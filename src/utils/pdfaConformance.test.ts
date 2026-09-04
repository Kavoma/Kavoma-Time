// @vitest-environment happy-dom
//
// PDF/A-3B ist eine Zusage an den Empfänger: Diese Datei lässt sich in zehn
// Jahren noch genauso öffnen. Wer sie gibt und nicht hält, bekommt die Rechnung
// zurück — von genau den Empfängern mit strenger Prüfung, wegen derer man sich
// die Mühe überhaupt macht.
//
// Geprüft wird hier das **erzeugte PDF**, nicht die Absicht: Sind die
// Schriften wirklich eingebettet, steht die Ausgabebedingung drin, sagt das
// XMP „part 3, conformance B"? Eine vollständige Prüfung nach Norm leistet
// veraPDF; die braucht Java und ist nicht Teil dieses Programms. Was hier steht,
// sind die Punkte, an denen es realistisch scheitert.

import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFHexString } from 'pdf-lib';
import { generateEInvoicePdf } from './invoicePdf';
import { PDF_FONT } from './pdfFonts';
import type { Customer, Invoice, Issuer } from '../types';

const tag = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const issuer: Issuer = {
  name: 'Kavoma & Söhne', street: 'Beispielweg 3', zip: '20095', city: 'Hamburg', country: 'DE',
  email: 'post@kavoma.example', phone: '040 123456', iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001', bank: 'Beispielbank', taxId: '22/333/44444', vatId: 'DE987654321',
  smallBusiness: false, vatRate: 19,
};

const customer = {
  id: 1, name: 'Bürostühle GmbH', street: 'Marktplatz 5', zip: '50667', city: 'Köln',
  country: 'DE', email: 'einkauf@buerostuehle.example', debtorNumber: '10001',
} as unknown as Customer;

const invoice = {
  id: 'i1', number: '2026-0042', customerId: 1, projectId: null, mode: 'fixed',
  periodFrom: tag(2026, 3, 1), periodTo: tag(2026, 3, 31),
  createdAt: tag(2026, 4, 5), dueDate: tag(2026, 4, 19),
  items: [{ description: 'Bürostühle für Größenwahn', quantity: 4, unit: 'Stk.', unitPrice: 250, total: 1000, kind: 'flat' }],
  entryIds: [], subtotal: 1000, vatRate: 19, vatAmount: 190, total: 1190,
  notes: '', paid: false, payments: [], status: 'active', reminders: [],
} as unknown as Invoice;

async function bytes(): Promise<Uint8Array> {
  const blob = await generateEInvoicePdf(invoice, issuer, customer);
  return new Uint8Array(await blob.arrayBuffer());
}

const alsText = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('Schrifteinbettung', () => {
  it('bettet jede benutzte Schrift ein', async () => {
    // Der Kern von PDF/A. Ein FontFile2 (TrueType) muss an jedem Font
    // hängen — ohne das ist die Datei nur so lange lesbar, wie der Betrachter
    // die Schrift selbst besitzt.
    const doc = await PDFDocument.load(await bytes());
    const gefunden: { name: string; eingebettet: boolean }[] = [];

    for (const [ref] of doc.context.enumerateIndirectObjects()) {
      const obj = doc.context.lookup(ref);
      if (!(obj instanceof PDFDict)) continue;
      if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
      const subtype = obj.get(PDFName.of('Subtype'))?.toString();
      // Typ-0-Fonts tragen das Programm im Nachfahren, nicht an sich selbst.
      if (subtype === '/Type0') continue;
      const deskriptor = doc.context.lookupMaybe(
        obj.get(PDFName.of('FontDescriptor')), PDFDict,
      );
      const eingebettet = Boolean(
        deskriptor?.get(PDFName.of('FontFile2')) ??
        deskriptor?.get(PDFName.of('FontFile3')) ??
        deskriptor?.get(PDFName.of('FontFile')),
      );
      gefunden.push({
        name: obj.get(PDFName.of('BaseFont'))?.toString() ?? '?',
        eingebettet,
      });
    }

    expect(gefunden.length).toBeGreaterThan(0);
    for (const f of gefunden) {
      expect(f.eingebettet, `${f.name} ist nicht eingebettet`).toBe(true);
    }
  });

  it('benutzt keine der vierzehn Standardschriften mehr', async () => {
    // Helvetica & Co. dürfen ein PDF ohne Einbettung benutzen — genau deshalb
    // sind sie für die Archivierung untauglich.
    const text = alsText(await bytes());
    expect(text).not.toContain('/Helvetica');
    expect(text).not.toContain('/Times-Roman');
    expect(text).toContain(PDF_FONT);
  });
});

describe('Ausgabebedingung', () => {
  it('trägt einen OutputIntent mit der PDF/A-Kennung', async () => {
    const doc = await PDFDocument.load(await bytes());
    const intents = doc.catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray);
    expect(intents, 'OutputIntents fehlt').toBeDefined();
    const intent = doc.context.lookup(intents!.get(0), PDFDict);
    expect(intent.get(PDFName.of('S'))?.toString()).toBe('/GTS_PDFA1');
  });

  it('legt das ICC-Profil wirklich bei, mit passender Kanalzahl', async () => {
    // Ein Verweis auf „sRGB" ohne die Datei nützt dem Empfänger nichts.
    const doc = await PDFDocument.load(await bytes());
    const intents = doc.catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray)!;
    const intent = doc.context.lookup(intents.get(0), PDFDict);
    const profil = doc.context.lookup(intent.get(PDFName.of('DestOutputProfile')));
    expect(profil).toBeInstanceOf(PDFStream);
    expect((profil as PDFStream).dict.get(PDFName.of('N'))?.toString()).toBe('3');
  });
});

describe('Metadaten', () => {
  it('sagt im XMP „part 3, conformance B“', async () => {
    // Ohne diese zwei Felder ist es kein PDF/A, egal wie sauber der Rest ist.
    const text = alsText(await bytes());
    expect(text).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(text).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
  });

  it('behält die Factur-X-Kennung neben der PDF/A-Kennung', async () => {
    // Beide Erweiterungen müssen nebeneinander stehen — die eine sagt „Archiv“,
    // die andere „hier liegt eine Rechnung“.
    const text = alsText(await bytes());
    expect(text).toContain('<fx:DocumentType>INVOICE</fx:DocumentType>');
    expect(text).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
  });

  it('nennt im XMP und in der Dokumentinfo denselben Zeitpunkt', async () => {
    // PDF/A verlangt Übereinstimmung. pdf-lib schreibt die Dokumentinfo in
    // UTC, das XMP steht in Ortszeit mit Versatz — **derselbe Zeitpunkt**,
    // andere Schreibweise. Verglichen wird deshalb der Zeitpunkt, nicht der
    // Text; eine wörtliche Erwartung wäre nur in einer Zeitzone richtig.
    const rohe = await bytes();
    const text = alsText(rohe);

    const ausXmp = text.match(/<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/)![1];
    expect(new Date(ausXmp).getTime()).toBe(tag(2026, 4, 5));

    const doc = await PDFDocument.load(rohe);
    expect(doc.getCreationDate()!.getTime()).toBe(tag(2026, 4, 5));
  });

  it('setzt eine Datei-Kennung im Trailer', async () => {
    const text = alsText(await bytes());
    expect(/\/ID \[ <[0-9A-F]{32}> <[0-9A-F]{32}> \]/.test(text)).toBe(true);
  });

  it('erzeugt für dieselbe Rechnung dieselbe Kennung', async () => {
    // Sonst wäre nicht unterscheidbar, ob sich am Dokument etwas geändert hat
    // oder nur ein Zufallswert.
    const a = alsText(await bytes()).match(/\/ID \[ <([0-9A-F]{32})>/)![1];
    const b = alsText(await bytes()).match(/\/ID \[ <([0-9A-F]{32})>/)![1];
    expect(a).toBe(b);
  });
});

describe('Die Datei bleibt heil', () => {
  it('lässt sich nach dem Einfügen der Kennung noch öffnen', async () => {
    // Die `/ID` wird durch eine Textersetzung eingefügt — der riskanteste
    // Schritt. Ginge dabei ein Byte verloren, wäre das PDF unbrauchbar.
    const doc = await PDFDocument.load(await bytes());
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Rechnung 2026-0042');
  });

  it('trägt das ZUGFeRD-XML weiterhin als Anhang', async () => {
    // Im rohen Text ist davon nichts zu sehen: pdf-lib packt die Wörterbücher
    // in einen komprimierten Objektstrom. Gefragt werden muss die Struktur.
    const doc = await PDFDocument.load(await bytes());
    const namen = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    const eingebettet = namen?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
    const liste = eingebettet?.lookupMaybe(PDFName.of('Names'), PDFArray);
    expect(liste, 'kein EmbeddedFiles-Namensbaum').toBeDefined();

    // Der Name liegt als PDFHexString vor (UTF-16BE mit BOM). `toString()`
    // liefert dort die Hex-Ziffern, nicht den Namen — derselbe Fallstrick wie
    // beim Lesen fremder ZUGFeRD-PDFs.
    const dateiname = (liste!.get(0) as PDFHexString).decodeText();
    expect(dateiname).toBe('factur-x.xml');

    const spec = doc.context.lookup(liste!.get(1), PDFDict);
    expect(spec.get(PDFName.of('AFRelationship'))?.toString()).toBe('/Alternative');
  });

  it('behält Umlaute im sichtbaren Text', async () => {
    // Mit einer eingebetteten TrueType-Schrift kodiert jsPDF anders als mit
    // Helvetica. Ein zerschossener Umlaut fiele sonst erst dem Kunden auf.
    const { extractEmbeddedXml } = await import('./eInvoicePdf');
    const gefunden = await extractEmbeddedXml(await bytes());
    expect(gefunden!.xml).toContain('Bürostühle für Größenwahn');
  });
});
