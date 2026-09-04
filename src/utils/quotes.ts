// Angebote — der Schritt vor der Rechnung.
//
// Ein Angebot ist strukturell fast dieselbe Datenmenge wie eine Rechnung:
// Kunde, Positionen, Summen. Was es unterscheidet, ist alles Rechtliche —
// und das fällt hier weg statt hinzuzukommen:
//
// - **Keine Nummernkreis-Pflicht.** Ein Angebot ist kein Buchungsbeleg. Die
//   Nummer darf Lücken haben, und sie muss nicht vom Server kommen. Ein
//   Angebot zu verweigern, weil kein Netz da ist, wäre absurd.
// - **Keine Unveränderbarkeit.** Ein Angebot darf nachverhandelt werden. Erst
//   die Rechnung daraus ist fest.
// - **Kein Storno.** Ein abgelehntes Angebot wird abgelehnt, nicht storniert.
//
// Umgekehrt hat es etwas, das die Rechnung nicht hat: eine **Gültigkeit**.
// Ob sie abgelaufen ist, wird gerechnet und nicht gespeichert — als Zustand
// müsste jemand ihn umsetzen, und um Mitternacht ist niemand da.

import type { Invoice, InvoiceItem, Quote, QuoteStatus } from '../types';

/** Vorgabe für die Gültigkeit eines neuen Angebots. */
export const ANGEBOT_GUELTIG_TAGE = 30;

export const QUOTE_PREFIX_VORGABE = (jahr = new Date().getFullYear()) => `AN-${jahr}-`;

/** Der Zustand einschliesslich der gerechneten Ablauf-Erkennung. */
export type QuoteState = QuoteStatus | 'expired';

export const QUOTE_STATE_LABEL: Record<QuoteState, string> = {
  draft: 'Entwurf',
  sent: 'Versendet',
  accepted: 'Angenommen',
  declined: 'Abgelehnt',
  expired: 'Abgelaufen',
  invoiced: 'Abgerechnet',
};

/**
 * Abgelaufen ist nur ein **versendetes** Angebot.
 *
 * Ein Entwurf läuft nicht ab — er wurde nie hinausgegeben. Ein angenommenes
 * erst recht nicht: Wer zugesagt hat, hat zugesagt, auch wenn die Frist
 * danach verstreicht.
 */
export function quoteState(quote: Quote, jetzt: number = Date.now()): QuoteState {
  if (quote.status !== 'sent') return quote.status;
  const grenze = new Date(quote.validUntil);
  grenze.setHours(23, 59, 59, 999);
  return jetzt > grenze.getTime() ? 'expired' : 'sent';
}

/** Ob sich aus dem Angebot noch eine Rechnung machen lässt. */
export function istAbrechenbar(quote: Quote, jetzt: number = Date.now()): boolean {
  const stand = quoteState(quote, jetzt);
  // Auch ein abgelaufenes Angebot darf abgerechnet werden — der Kunde sagt oft
  // erst nach der Frist zu, und dann ist das Angebot die Grundlage, nicht das
  // Hindernis. Nur ein Entwurf und eine Ablehnung sind es nicht.
  return stand === 'sent' || stand === 'accepted' || stand === 'expired';
}

// === Nummernvergabe ============================================

/**
 * Die nächste freie Nummer, errechnet aus dem **tatsächlichen Bestand**.
 *
 * Kein gespeicherter Zähler: Auf einem zweiten Gerät wäre er entweder zu
 * niedrig (und vergäbe eine Nummer doppelt) oder er müsste mitwandern (und
 * risse nach jedem Abgleich Löcher). Nachzusehen, was es schon gibt, ist
 * beides nicht.
 *
 * Zwei Geräte, die **gleichzeitig offline** ein Angebot schreiben, können
 * trotzdem dieselbe Nummer erzeugen. Das ist hingenommen: Beide Angebote
 * bleiben nach dem Abgleich erhalten und die Dublette ist sichtbar — anders als
 * bei einer Rechnung hängt daran keine Pflicht.
 */
export function nextQuoteNumber(quotes: Quote[], prefix: string): string {
  let hoechste = 0;
  for (const q of quotes) {
    if (!q.number.startsWith(prefix)) continue;
    const rest = q.number.slice(prefix.length);
    if (!/^\d+$/.test(rest)) continue;
    hoechste = Math.max(hoechste, Number(rest));
  }
  return `${prefix}${String(hoechste + 1).padStart(4, '0')}`;
}

// === Summen ====================================================

export function summiere(items: InvoiceItem[], vatRate: number): {
  subtotal: number; vatAmount: number; total: number;
} {
  const rund = (n: number) => Math.round(n * 100) / 100;
  const subtotal = rund(items.reduce((s, i) => s + i.total, 0));
  const vatAmount = rund(subtotal * (vatRate / 100));
  return { subtotal, vatAmount, total: rund(subtotal + vatAmount) };
}

// === Angebot → Rechnung ========================================

export interface UmwandlungsErgebnis {
  invoice: Invoice;
  quote: Quote;
}

/**
 * Macht aus einem Angebot einen Rechnungs**entwurf**.
 *
 * Bewusst ein Entwurf und keine fertige Rechnung: Die Rechnungsnummer entsteht
 * erst beim Finalisieren — bei eingeschalteter Synchronisierung serverseitig.
 * Hier eine zu vergeben, hiesse den Weg zu umgehen, der die Dubletten
 * verhindert. Der Nutzer sieht den Entwurf, prüft ihn und finalisiert ihn wie
 * jeden anderen.
 *
 * Das Angebot wird auf `invoiced` gesetzt und trägt die Entwurfs-ID; die
 * Rechnung trägt umgekehrt die Angebots-ID. Die Spur ist in beide Richtungen
 * lesbar — dieselbe Überlegung wie bei den Storno-Rechnungen.
 */
export function angebotZuRechnungsentwurf(
  quote: Quote,
  jetzt: number = Date.now(),
  zahlungszielTage = 14,
): UmwandlungsErgebnis {
  const id = globalThis.crypto?.randomUUID?.() ?? `inv-${jetzt}-${Math.random().toString(36).slice(2)}`;
  const faellig = new Date(jetzt);
  faellig.setDate(faellig.getDate() + zahlungszielTage);

  const invoice: Invoice = {
    id,
    // Ein Entwurf trägt noch keine Nummer — genau wie jeder andere Entwurf.
    number: '',
    customerId: quote.customerId,
    projectId: quote.projectId,
    mode: 'fixed',
    // Ein Angebot hat keinen Leistungszeitraum; bis die Leistung erbracht ist,
    // ist der Tag der Umwandlung die einzige ehrliche Angabe. Wer es besser
    // weiss, ändert es im Entwurf.
    periodFrom: jetzt,
    periodTo: jetzt,
    createdAt: jetzt,
    dueDate: faellig.getTime(),
    items: quote.items.map((i) => ({ ...i })),
    entryIds: [],
    subtotal: quote.subtotal,
    vatRate: quote.vatRate,
    vatAmount: quote.vatAmount,
    total: quote.total,
    notes: quote.notes,
    paid: false,
    payments: [],
    status: 'draft',
    reminders: [],
    quoteId: quote.id,
  };

  return {
    invoice,
    quote: { ...quote, status: 'invoiced', invoiceId: id, decidedAt: quote.decidedAt ?? jetzt },
  };
}

/** Ein leeres Angebot mit sinnvollen Vorgaben. */
export function neuesAngebot(
  vorhandene: Quote[],
  prefix: string,
  vatRate: number,
  jetzt: number = Date.now(),
): Quote {
  const gueltig = new Date(jetzt);
  gueltig.setDate(gueltig.getDate() + ANGEBOT_GUELTIG_TAGE);
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `q-${jetzt}-${Math.random().toString(36).slice(2)}`,
    number: nextQuoteNumber(vorhandene, prefix),
    customerId: 0,
    projectId: null,
    createdAt: jetzt,
    validUntil: gueltig.getTime(),
    items: [],
    subtotal: 0,
    vatRate,
    vatAmount: 0,
    total: 0,
    notes: '',
    status: 'draft',
  };
}

// === Kennzahlen ================================================

export interface QuoteKennzahlen {
  offen: number;
  offenerWert: number;
  angenommen: number;
  angenommenerWert: number;
  abgelehnt: number;
  abgelaufen: number;
  /** Angenommen geteilt durch entschieden, in Prozent. `null`, wenn nichts entschieden ist. */
  quote: number | null;
}

/**
 * Die Erfolgsquote zählt nur **entschiedene** Angebote.
 *
 * Entwürfe und noch laufende Angebote gehören nicht in den Nenner — sonst
 * sinkt die Quote jedes Mal, wenn man ein neues Angebot schreibt.
 * Abgelaufene zählen als abgelehnt: Keine Antwort ist eine Antwort.
 */
export function kennzahlen(quotes: Quote[], jetzt: number = Date.now()): QuoteKennzahlen {
  const k: QuoteKennzahlen = {
    offen: 0, offenerWert: 0, angenommen: 0, angenommenerWert: 0,
    abgelehnt: 0, abgelaufen: 0, quote: null,
  };
  for (const q of quotes) {
    switch (quoteState(q, jetzt)) {
      case 'sent':      k.offen++; k.offenerWert += q.total; break;
      case 'accepted':
      case 'invoiced':  k.angenommen++; k.angenommenerWert += q.total; break;
      case 'declined':  k.abgelehnt++; break;
      case 'expired':   k.abgelaufen++; break;
      default: break;   // Entwürfe zählen nirgends mit
    }
  }
  const entschieden = k.angenommen + k.abgelehnt + k.abgelaufen;
  if (entschieden > 0) k.quote = Math.round((k.angenommen / entschieden) * 100);
  return k;
}
