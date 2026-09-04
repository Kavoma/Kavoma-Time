// @vitest-environment happy-dom
//
// Die Ansicht ist die zweite Hälfte der Empfangspflicht: Eine XRechnung, die
// niemand lesen kann, ist nicht empfangen, sondern abgelegt. Getestet wird
// deshalb, dass die Zahlen aus dem XML auch wirklich auf dem Schirm landen —
// und, mindestens so wichtig, dass fehlende Felder als fehlend erscheinen
// statt als Null.

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EInvoiceView } from './EInvoiceView';
import { parseEInvoiceXml } from '../../utils/eInvoiceRead';
import { buildFacturXXml } from '../../utils/eInvoiceXml';
import type { Invoice, Issuer, Customer } from '../../types';

const tag = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const issuer: Issuer = {
  name: 'Lieferant GmbH', street: 'Marktplatz 5', zip: '50667', city: 'Köln', country: 'DE',
  email: 'rechnung@lieferant.example', phone: '', iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001', bank: 'Beispielbank', taxId: '22/333/44444', vatId: 'DE987654321',
  smallBusiness: false, vatRate: 19,
};
const customer = {
  id: 1, name: 'Kavoma', street: 'Beispielweg 3', zip: '20095', city: 'Hamburg', country: 'DE',
} as unknown as Customer;
const invoice = {
  id: 'i1', number: 'LG-2026-0815', customerId: 1, projectId: null, mode: 'fixed',
  periodFrom: tag(2026, 7, 1), periodTo: tag(2026, 7, 31),
  createdAt: tag(2026, 8, 5), dueDate: tag(2026, 9, 4),
  items: [{ description: 'Bürostühle', quantity: 4, unit: 'Stk.', unitPrice: 250, total: 1000, kind: 'flat' }],
  entryIds: [], subtotal: 1000, vatRate: 19, vatAmount: 190, total: 1190,
  notes: '', paid: false, status: 'active', reminders: [],
} as unknown as Invoice;

/**
 * `Intl.NumberFormat` trennt Betrag und Währungszeichen mit einem
 * geschützten Leerzeichen — je nach Node-Fassung U+00A0 oder U+202F. Als
 * Escape geschrieben, nicht als Zeichen: Ein wörtliches unsichtbares
 * Leerzeichen im Quelltext sieht niemand, auch nicht beim Verschwinden.
 */
const glatt = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

function render(xml: string, compact = false) {
  return glatt(renderToStaticMarkup(
    <EInvoiceView invoice={parseEInvoiceXml(xml)} compact={compact} />,
  ));
}

describe('EInvoiceView', () => {
  const html = render(buildFacturXXml(invoice, issuer, customer));

  it('zeigt Nummer, Beträge und Beteiligte', () => {
    expect(html).toContain('LG-2026-0815');
    expect(html).toContain('Lieferant GmbH');
    expect(html).toContain('Kavoma');
    expect(html).toContain('1.190,00 €');
    expect(html).toContain('190,00 €');
    expect(html).toContain('DE987654321');
    expect(html).toContain('DE02120300000000202051');
  });

  it('zeigt die Positionen mit Menge und Einheit', () => {
    expect(html).toContain('Bürostühle');
    expect(html).toContain('4 Stk.');
    expect(html).toContain('250,00 €');
  });

  it('nennt Syntax und Profil', () => {
    expect(html).toContain('CII');
    expect(html).toContain('EN 16931 (Comfort)');
    expect(html).toContain('Rechnung');
  });

  it('lässt die Positionstabelle in der kompakten Fassung weg', () => {
    const kompakt = render(buildFacturXXml(invoice, issuer, customer), true);
    expect(kompakt).not.toContain('Bürostühle');
    // Die Summen bleiben — sie sind der Grund, warum man hinsieht.
    expect(kompakt).toContain('1.190,00 €');
  });

  it('schreibt „—" statt einer erfundenen Null, wenn ein Feld fehlt', () => {
    // Der Unterschied zwischen „0,00 €" und „nicht angegeben" entscheidet,
    // ob man einer Zahl trauen kann.
    const ohneFaelligkeit = `<?xml version="1.0"?>
      <rsm:CrossIndustryInvoice xmlns:rsm="urn:x" xmlns:ram="urn:y">
        <rsm:ExchangedDocument><ram:ID>M-1</ram:ID><ram:TypeCode>380</ram:TypeCode></rsm:ExchangedDocument>
        <rsm:SupplyChainTradeTransaction>
          <ram:ApplicableHeaderTradeAgreement>
            <ram:SellerTradeParty><ram:Name>Knapp GmbH</ram:Name></ram:SellerTradeParty>
          </ram:ApplicableHeaderTradeAgreement>
          <ram:ApplicableHeaderTradeSettlement>
            <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
              <ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>
            </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
          </ram:ApplicableHeaderTradeSettlement>
        </rsm:SupplyChainTradeTransaction>
      </rsm:CrossIndustryInvoice>`;
    const knapp = render(ohneFaelligkeit);
    expect(knapp).toContain('—');
    expect(knapp).toContain('119,00 €');
    expect(knapp).not.toContain('0,00 €');
  });

  it('zeigt die Auffälligkeiten des Lesers', () => {
    const kaputt = buildFacturXXml(
      { ...invoice, total: 999 } as Invoice, issuer, customer,
    );
    const html2 = render(kaputt);
    expect(html2).toContain('Bitte nachsehen');
    expect(html2).toContain('gehen nicht auf');
  });

  it('nennt den Befreiungsgrund bei einer Kleinunternehmer-Rechnung', () => {
    const klein = buildFacturXXml(
      { ...invoice, vatRate: 0, vatAmount: 0, total: 1000 } as Invoice,
      { ...issuer, smallBusiness: true, vatRate: 0 },
      customer,
    );
    const html3 = render(klein);
    expect(html3).toContain('Kleinunternehmer');
    expect(html3).toContain('steuerbefreit');
  });

  it('kippt nicht an einem unbekannten Währungscode', () => {
    // `Intl.NumberFormat` wirft bei Unsinn — die Anzeige darf das nicht mitreißen.
    const fremd = buildFacturXXml(invoice, issuer, customer)
      .replace('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>',
               '<ram:InvoiceCurrencyCode>XX</ram:InvoiceCurrencyCode>');
    expect(() => render(fremd)).not.toThrow();
    expect(render(fremd)).toContain('1190.00 XX');
  });
});
