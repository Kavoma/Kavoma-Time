import { describe, expect, it } from 'vitest';
import type { InvoiceItem } from '../types';
import { itemsToGross, itemsToNet, pricesIncludeVat } from './pricing';
import { computeTotals } from './templates';

const pauschal = (preis: number): InvoiceItem =>
  ({ description: 'Pauschale', quantity: 1, unit: 'Pauschal', unitPrice: preis, total: preis, kind: 'flat' });
const stunden = (h: number, satz: number): InvoiceItem =>
  ({ description: 'Arbeit', quantity: h, unit: 'h', unitPrice: satz, total: Math.round(h * satz * 100) / 100, kind: 'time' });

describe('itemsToNet', () => {
  it('200 € brutto ergeben exakt 200 € Rechnungsbetrag', () => {
    const netto = itemsToNet([pauschal(200)], 19);
    expect(netto[0].total).toBe(168.07);
    expect(computeTotals(netto, 19)).toEqual({ subtotal: 168.07, vatAmount: 31.93, total: 200 });
  });

  it('krumme Stunden bleiben beim Bruttobetrag', () => {
    const netto = itemsToNet([stunden(10.1, 50)], 19);
    expect(computeTotals(netto, 19).total).toBe(505);
    // Menge × Einzelpreis muss auf der Rechnung aufgehen
    expect(Math.round(netto[0].quantity * netto[0].unitPrice * 100) / 100).toBe(netto[0].total);
  });

  it('gleicht Rundungscents über mehrere Positionen aus', () => {
    const positionen = [stunden(3.33, 47), stunden(1.17, 85), pauschal(99.99), pauschal(12.5)];
    const ziel = positionen.reduce((s, p) => s + p.total, 0);
    const netto = itemsToNet(positionen, 19);
    expect(computeTotals(netto, 19).total).toBeCloseTo(ziel, 2);
  });

  it('ohne USt ändert sich nichts', () => {
    expect(itemsToNet([pauschal(200)], 0)[0].total).toBe(200);
  });

  it('Hin und zurück ergibt wieder die eingegebenen Bruttopreise', () => {
    const eingabe = [stunden(10.1, 50), pauschal(200)];
    const zurueck = itemsToGross(itemsToNet(eingabe, 19), 19);
    expect(zurueck.map((i) => i.unitPrice)).toEqual([50, 200]);
  });
});

describe('pricesIncludeVat', () => {
  const issuer = { smallBusiness: false, vatRate: 19, pricesIncludeVat: true };
  it('Kunde überschreibt die Grundeinstellung', () => {
    expect(pricesIncludeVat(issuer)).toBe(true);
    expect(pricesIncludeVat(issuer, { pricesIncludeVat: false })).toBe(false);
    expect(pricesIncludeVat({ ...issuer, pricesIncludeVat: false }, { pricesIncludeVat: true })).toBe(true);
  });
  it('Kleinunternehmer haben keine Bruttopreise', () => {
    expect(pricesIncludeVat({ smallBusiness: true, vatRate: 0, pricesIncludeVat: true })).toBe(false);
  });
});
