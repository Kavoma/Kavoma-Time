import type { Customer, InvoiceItem, Issuer } from '../types';

/**
 * Brutto- oder Nettopreise.
 *
 * Stundensätze, Pauschalen und Positionen werden so eingegeben, wie man mit
 * dem Kunden spricht. Bei „brutto" steckt die Umsatzsteuer schon drin — aus
 * 200 € Pauschale werden 200 € Rechnungsbetrag statt 238 €.
 *
 * Gespeichert wird eine Rechnung **immer netto** (Positionen + USt obendrauf).
 * So verlangt es § 14 UStG, und PDF, E-Rechnung, DATEV und Statistik müssen
 * nichts von der Eingabeart wissen. Umgerechnet wird ausschliesslich hier.
 */

/** Wirksamer USt-Satz des Ausstellers — 0 bei Kleinunternehmern. */
export function effectiveVatRate(issuer: Pick<Issuer, 'smallBusiness' | 'vatRate'> | null | undefined): number {
  if (!issuer || issuer.smallBusiness) return 0;
  return Number.isFinite(issuer.vatRate) ? issuer.vatRate : 0;
}

/**
 * Gelten die Preise für diesen Kunden als brutto?
 *
 * Die Einstellung am Kunden gewinnt; fehlt sie, gilt die Grundeinstellung in
 * den Rechnungs-Einstellungen. Ohne USt (Kleinunternehmer) gibt es keinen
 * Unterschied — dann immer `false`, damit nirgends „inkl. 0 % USt" steht.
 */
export function pricesIncludeVat(
  issuer: Pick<Issuer, 'smallBusiness' | 'vatRate' | 'pricesIncludeVat'> | null | undefined,
  customer?: Pick<Customer, 'pricesIncludeVat'> | null,
): boolean {
  if (effectiveVatRate(issuer) === 0) return false;
  return customer?.pricesIncludeVat ?? issuer?.pricesIncludeVat ?? false;
}

const rund2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const rund4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Prozent-Rabatte tragen den Prozentsatz im Einzelpreis — der bleibt unberührt. */
const istProzent = (it: InvoiceItem) => it.kind === 'discount' && it.unit === '%';

/** Bruttobetrag zu einem Nettobetrag (zur Anzeige). */
export function grossOf(net: number, vatRate: number): number {
  return rund2(net * (1 + vatRate / 100));
}

/** Nettobetrag zu einem Bruttobetrag (zur Anzeige). */
export function netOf(gross: number, vatRate: number): number {
  return rund2(gross / (1 + vatRate / 100));
}

/**
 * Rechnet brutto eingegebene Positionen in Nettopositionen um.
 *
 * Der Einzelpreis bekommt bis zu vier Nachkommastellen — sonst wird aus
 * 50 €/h brutto 42,02 € netto, und 10,1 h ergäben am Ende 505,04 € statt 505 €.
 *
 * Danach bleibt pro Rechnung höchstens ein Rundungscent Abweichung, weil die
 * USt auf die Nettosumme gerechnet wird und nicht je Zeile. Den gleichen wir an
 * der grössten Position aus, damit der Endbetrag exakt die Summe der
 * Bruttopreise ist.
 */
export function itemsToNet(items: InvoiceItem[], vatRate: number): InvoiceItem[] {
  if (vatRate <= 0) return items.map((it) => ({ ...it }));
  const faktor = 1 + vatRate / 100;

  const netto = items.map((it): InvoiceItem => {
    const total = rund2(it.total / faktor);
    if (istProzent(it)) return { ...it, total };
    const unitPrice = it.quantity !== 0 ? rund4(total / it.quantity) : rund4(it.unitPrice / faktor);
    return { ...it, unitPrice, total };
  });

  const ziel = rund2(items.reduce((s, it) => s + it.total, 0));
  const endbetrag = (liste: InvoiceItem[]) => {
    const sub = rund2(liste.reduce((s, it) => s + it.total, 0));
    return rund2(sub + rund2(sub * (vatRate / 100)));
  };

  // Die grösste Position, die keinen Prozentsatz trägt, nimmt den Ausgleich auf.
  let idx = -1;
  netto.forEach((it, i) => {
    if (istProzent(it)) return;
    if (idx < 0 || Math.abs(it.total) > Math.abs(netto[idx].total)) idx = i;
  });
  if (idx < 0) return netto;

  // Ein Netto-Cent bewegt den Endbetrag um ~1,19 Cent — nach ein, zwei
  // Schritten ist das Ziel erreicht oder nicht treffbar. Mehr wäre Raterei.
  for (let schritt = 0; schritt < 3; schritt++) {
    const diff = rund2(ziel - endbetrag(netto));
    if (diff === 0) break;
    const it = netto[idx];
    const total = rund2(it.total + (diff > 0 ? 0.01 : -0.01));
    const unitPrice = it.quantity !== 0 ? rund4(total / it.quantity) : it.unitPrice;
    netto[idx] = { ...it, total, unitPrice };
  }
  return netto;
}

/** Gegenrichtung für das Bearbeiten gespeicherter Entwürfe/Angebote. */
export function itemsToGross(items: InvoiceItem[], vatRate: number): InvoiceItem[] {
  if (vatRate <= 0) return items.map((it) => ({ ...it }));
  return items.map((it) => {
    const total = grossOf(it.total, vatRate);
    if (istProzent(it)) return { ...it, total };
    return { ...it, unitPrice: grossOf(it.unitPrice, vatRate), total };
  });
}
