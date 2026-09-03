// Zahlungseingänge — was auf eine Rechnung tatsächlich geflossen ist.
//
// Vorher war der Zahlungsstatus ein Schalter: bezahlt oder nicht. Das reicht,
// solange alle immer vollständig zahlen. Sobald jemand eine Teilzahlung leistet,
// wird es peinlich — eine Mahnung über den vollen Betrag nach einer Anzahlung
// ist der Fall, den man dem Kunden nicht erklären möchte.
//
// **`paid` bleibt, wird aber abgeleitet.** Der Schalter wird an rund zwanzig
// Stellen gelesen — in der Liste, in den Filtern, in der Auswertung, im
// Mahnwesen, im Z3-Export. Ihn dort überall zu ersetzen wäre zwanzig
// Gelegenheiten, eine zu übersehen. Stattdessen bleibt er stehen und wird bei
// jeder Änderung an den Zahlungen neu berechnet. Wer Zahlungen anfasst, muss
// deshalb `mitZahlung` / `ohneZahlung` benutzen und nicht `payments` von Hand
// setzen — sonst laufen Schalter und Wahrheit auseinander.

import type { Invoice, Payment } from '../types';

/**
 * Bis auf welchen Rest gilt eine Rechnung als beglichen.
 *
 * Ein Cent Rundungsdifferenz soll keine Mahnung auslösen. Ein halber Cent ist
 * die Grenze, weil Beträge auf zwei Stellen geführt werden — alles darunter
 * kann nur aus Fließkomma-Ungenauigkeit stammen, nicht aus einer Überweisung.
 */
const TOLERANZ = 0.005;

/** Auf zwei Stellen runden — sonst summiert sich Fließkomma-Rauschen sichtbar. */
const rund = (n: number) => Math.round(n * 100) / 100;

/**
 * Was der Kunde insgesamt schuldet: Rechnungsbetrag plus alle Mahngebühren.
 *
 * Die Gebühren gehören dazu, weil die Mahnung sie einfordert. Wer sie
 * ausließe, hielte eine Rechnung für beglichen, bei der die Gebühr noch offen
 * ist.
 */
export function gesamtforderung(invoice: Invoice): number {
  const gebuehren = invoice.reminders.reduce((s, r) => s + r.fee, 0);
  return rund(invoice.total + gebuehren);
}

export function gezahlt(invoice: Invoice): number {
  return rund((invoice.payments ?? []).reduce((s, p) => s + p.amount, 0));
}

/** Was noch aussteht. Bei Überzahlung negativ — das ist keine Null. */
export function offen(invoice: Invoice): number {
  return rund(gesamtforderung(invoice) - gezahlt(invoice));
}

export type Zahlungsstand = 'offen' | 'teilweise' | 'bezahlt' | 'ueberzahlt';

export function zahlungsstand(invoice: Invoice): Zahlungsstand {
  const rest = offen(invoice);
  const bezahltBetrag = gezahlt(invoice);
  if (rest < -TOLERANZ) return 'ueberzahlt';
  if (rest <= TOLERANZ) return 'bezahlt';
  return bezahltBetrag > TOLERANZ ? 'teilweise' : 'offen';
}

export const ZAHLUNGSSTAND_LABEL: Record<Zahlungsstand, string> = {
  offen: 'Offen',
  teilweise: 'Teilweise bezahlt',
  bezahlt: 'Bezahlt',
  ueberzahlt: 'Überzahlt',
};

/**
 * Setzt `paid` und `paidAt` aus den Zahlungen neu.
 *
 * `paidAt` ist der Tag, an dem die Rechnung ausgeglichen war — also das Datum
 * der **letzten** Zahlung, nicht der ersten. Für die Ist-Versteuerung zählt
 * ohnehin jede Zahlung mit ihrem eigenen Datum; `paidAt` ist nur noch die
 * grobe Auskunft „seit wann erledigt".
 */
function nachgezogen(invoice: Invoice): Invoice {
  const zahlungen = [...(invoice.payments ?? [])].sort((a, b) => a.paidAt - b.paidAt);
  const stand = zahlungsstand({ ...invoice, payments: zahlungen });
  const istBezahlt = stand === 'bezahlt' || stand === 'ueberzahlt';
  const next: Invoice = { ...invoice, payments: zahlungen, paid: istBezahlt };
  if (istBezahlt && zahlungen.length > 0) {
    next.paidAt = zahlungen[zahlungen.length - 1].paidAt;
  } else {
    // Ein Zahldatum ohne bezahlte Rechnung wäre eine Falschaussage, die in der
    // Ist-Versteuerung landet.
    delete next.paidAt;
  }
  return next;
}

export function neueZahlung(
  daten: Omit<Payment, 'id' | 'createdAt' | 'source'> & Partial<Pick<Payment, 'source'>>,
): Payment {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    source: 'manual',
    ...daten,
    amount: rund(daten.amount),
  };
}

export function mitZahlung(invoice: Invoice, zahlung: Payment): Invoice {
  return nachgezogen({ ...invoice, payments: [...(invoice.payments ?? []), zahlung] });
}

export function ohneZahlung(invoice: Invoice, zahlungId: string): Invoice {
  return nachgezogen({
    ...invoice,
    payments: (invoice.payments ?? []).filter((p) => p.id !== zahlungId),
  });
}

/**
 * Den ganzen Rest auf einmal verbuchen — der häufigste Fall und das, was der
 * alte Schalter tat. Bei einer bereits ausgeglichenen Rechnung passiert nichts,
 * sonst entstünde eine Zahlung über null Euro.
 */
export function komplettBezahlt(invoice: Invoice, am: number = Date.now()): Invoice {
  const rest = offen(invoice);
  if (rest <= TOLERANZ) return invoice;
  return mitZahlung(invoice, neueZahlung({ amount: rest, paidAt: am }));
}

/** Alle Zahlungen entfernen — der Rückweg des alten Schalters. */
export function alleZahlungenEntfernt(invoice: Invoice): Invoice {
  return nachgezogen({ ...invoice, payments: [] });
}

/**
 * Wandelt den alten Schalter in eine Zahlung um.
 *
 * Der Datensatz wird als `source: 'switch'` gekennzeichnet, weil er **erschlossen**
 * ist und nicht erfasst: Wir wissen, dass jemand die Rechnung als bezahlt
 * markiert hat, nicht, wann welcher Betrag einging. Ohne diese Kennzeichnung
 * sähe eine erschlossene Zahlung in der Betriebsprüfung aus wie eine erfasste.
 */
export function migriereZahlungsschalter(invoice: Invoice): Invoice {
  if (Array.isArray(invoice.payments)) return nachgezogen(invoice);
  if (!invoice.paid) return { ...invoice, payments: [] };
  const betrag = gesamtforderung({ ...invoice, payments: [] });
  return nachgezogen({
    ...invoice,
    payments: [
      {
        id: `migriert-${invoice.id}`,
        amount: betrag,
        paidAt: invoice.paidAt ?? invoice.createdAt,
        source: 'switch',
        createdAt: invoice.paidAt ?? invoice.createdAt,
      },
    ],
  });
}

/**
 * Zahlungen eines Zeitraums über alle Rechnungen, aufsteigend nach Datum.
 * Grundlage für die Ist-Versteuerung und den Z3-Export.
 */
export function zahlungenIm(
  invoices: Invoice[],
  von: number,
  bis: number,
): { invoice: Invoice; payment: Payment }[] {
  const out: { invoice: Invoice; payment: Payment }[] = [];
  for (const inv of invoices) {
    if (inv.status === 'draft') continue;
    for (const p of inv.payments ?? []) {
      if (p.paidAt >= von && p.paidAt <= bis) out.push({ invoice: inv, payment: p });
    }
  }
  return out.sort((a, b) => a.payment.paidAt - b.payment.paidAt);
}

/**
 * Der Umsatzsteueranteil **einer** Zahlung.
 *
 * Bei Ist-Versteuerung wird die Steuer fällig, wenn das Geld kommt — bei einer
 * Teilzahlung also anteilig. Bezugsgröße ist der Rechnungsbetrag ohne
 * Mahngebühren: Eine Mahngebühr ist Schadensersatz und nicht steuerbar.
 */
export function ustAnteil(invoice: Invoice, zahlung: Payment): number {
  if (invoice.total === 0) return 0;
  const anteil = Math.min(zahlung.amount / invoice.total, 1);
  return rund(invoice.vatAmount * anteil);
}
