// @vitest-environment happy-dom
//
// Der Weg durch das PDF ist der häufigste in der Praxis: Die meisten
// E-Rechnungen kommen als ZUGFeRD-PDF, nicht als nackte XML-Datei. Getestet
// wird deshalb gegen ein **echtes** PDF, das derselbe Code erzeugt hat, der
// Kavoma Times eigene Rechnungen schreibt — nicht gegen einen nachgebauten
// Katalog.

import { describe, expect, it } from 'vitest';
import { PDFDocument, AFRelationship } from 'pdf-lib';
import { extractEmbeddedXml, findEInvoice } from './eInvoicePdf';
import { attachFacturX } from './zugferdPdf';
import { buildFacturXXml, FACTUR_X_FILENAME } from './eInvoiceXml';
import type { Invoice, Issuer, Customer } from '../types';

const tag = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const issuer: Issuer = {
  name: 'Lieferant GmbH', street: 'Marktplatz 5', zip: '50667', city: 'Köln', country: 'DE',
  email: 'rechnung@lieferant.example', phone: '', iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001', bank: 'Beispielbank', taxId: '22/333/44444', vatId: 'DE987654321',
  smallBusiness: false, vatRate: 19,
};

const customer = {
  id: 1, name: 'Kavoma', street: 'Beispielweg 3', zip: '20095', city: 'Hamburg',
  country: 'DE', email: 'post@kavoma.example', debtorNumber: '10001',
} as unknown as Customer;

const invoice = {
  id: 'i1', number: 'LG-2026-0815', customerId: 1, projectId: null, mode: 'fixed',
  periodFrom: tag(2026, 7, 1), periodTo: tag(2026, 7, 31),
  createdAt: tag(2026, 8, 5), dueDate: tag(2026, 9, 4),
  items: [{ description: 'Bürostühle', quantity: 4, unit: 'Stk.', unitPrice: 250, total: 1000, kind: 'flat' }],
  entryIds: [], subtotal: 1000, vatRate: 19, vatAmount: 190, total: 1190,
  notes: '', paid: false, status: 'active', reminders: [],
} as unknown as Invoice;

/** Ein leeres PDF als Träger — der Inhalt ist für den Anhang gleichgültig. */
async function leeresPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
}

/** Ein vollständiges ZUGFeRD-PDF, geschrieben vom Produktionscode. */
async function zugferdPdf(): Promise<Uint8Array> {
  const xml = buildFacturXXml(invoice, issuer, customer);
  return attachFacturX(await leeresPdf(), xml, invoice.number, new Date(invoice.createdAt));
}

describe('XML aus einem ZUGFeRD-PDF holen', () => {
  it('findet den Anhang unter seinem Standardnamen', async () => {
    const gefunden = await extractEmbeddedXml(await zugferdPdf());
    expect(gefunden).not.toBeNull();
    expect(gefunden!.filename).toBe(FACTUR_X_FILENAME);
    expect(gefunden!.xml).toContain('<rsm:CrossIndustryInvoice');
  });

  it('liest die Rechnung vollständig aus dem PDF', async () => {
    const treffer = await findEInvoice(await zugferdPdf(), 'beleg.pdf');
    expect(treffer).not.toBeNull();
    expect(treffer!.source).toBe('embedded');
    expect(treffer!.filename).toBe(FACTUR_X_FILENAME);

    const inv = treffer!.invoice;
    expect(inv.number).toBe('LG-2026-0815');
    expect(inv.issueDate).toBe(tag(2026, 8, 5));
    expect(inv.dueDate).toBe(tag(2026, 9, 4));
    expect(inv.seller.name).toBe('Lieferant GmbH');
    expect(inv.seller.vatId).toBe('DE987654321');
    expect(inv.grandTotal).toBe(1190);
    expect(inv.taxTotal).toBe(190);
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].name).toBe('Bürostühle');
    expect(inv.warnings).toEqual([]);
  });

  it('überlebt Umlaute im Anhang', async () => {
    // Der Anhang wird als UTF-8-Bytes eingebettet. Wer ihn als Latin-1 liest,
    // macht aus „Bürostühle" Buchstabensalat — und der DOMParser merkt nichts.
    const treffer = await findEInvoice(await zugferdPdf(), 'beleg.pdf');
    expect(treffer!.invoice.lines[0].name).toBe('Bürostühle');
    expect(treffer!.invoice.seller.city).toBe('Köln');
  });
});

describe('PDFs ohne E-Rechnung', () => {
  it('meldet bei einem gewöhnlichen PDF schlicht nichts', async () => {
    // Das ist der Normalfall bei einem eingescannten Beleg und kein Fehler.
    expect(await extractEmbeddedXml(await leeresPdf())).toBeNull();
    expect(await findEInvoice(await leeresPdf(), 'scan.pdf')).toBeNull();
  });

  it('lässt sich von einem fremden Anhang nicht täuschen', async () => {
    // Ein PDF darf mehrere Anhänge tragen. Ein Lieferschein ist keine Rechnung,
    // auch wenn er `.xml` heißt und zuerst kommt.
    const doc = await PDFDocument.load(await leeresPdf());
    await doc.attach(new TextEncoder().encode('<Lieferschein><Pos/></Lieferschein>'), 'lieferschein.xml', {
      mimeType: 'text/xml', afRelationship: AFRelationship.Supplement,
    });
    const mitBeifang = await attachFacturX(
      await doc.save(), buildFacturXXml(invoice, issuer, customer),
      invoice.number, new Date(invoice.createdAt),
    );

    const treffer = await findEInvoice(mitBeifang, 'beleg.pdf');
    expect(treffer).not.toBeNull();
    expect(treffer!.filename).toBe(FACTUR_X_FILENAME);
    expect(treffer!.invoice.number).toBe('LG-2026-0815');
  });

  it('hält Datenmüll für kein PDF und für keine Rechnung', async () => {
    const muell = new TextEncoder().encode('Das ist nur Text.');
    expect(await findEInvoice(muell, 'notiz.txt')).toBeNull();
  });
});

describe('Reine XML-Datei', () => {
  it('erkennt sie ohne PDF drumherum', async () => {
    const xml = new TextEncoder().encode(buildFacturXXml(invoice, issuer, customer));
    const treffer = await findEInvoice(xml, 'rechnung.xml');
    expect(treffer).not.toBeNull();
    expect(treffer!.source).toBe('standalone');
    expect(treffer!.filename).toBe('rechnung.xml');
    expect(treffer!.invoice.number).toBe('LG-2026-0815');
  });

  it('stolpert nicht über eine vorangestellte BOM', async () => {
    // Ein unsichtbares U+FEFF vor dem Wurzelelement lässt den DOMParser
    // scheitern — und der Fehler wäre im Editor nicht zu sehen.
    const mitBom = new TextEncoder().encode('﻿' + buildFacturXXml(invoice, issuer, customer));
    const treffer = await findEInvoice(mitBom, 'rechnung.xml');
    expect(treffer).not.toBeNull();
    expect(treffer!.invoice.number).toBe('LG-2026-0815');
  });
});
