// Angebote sind kein Buchungsbeleg — die meisten Regeln der Rechnung gelten
// hier nicht. Was aber nicht falsch sein darf, ist die Umwandlung: Was im
// Angebot stand, muss in der Rechnung ankommen, und die Spur zwischen beiden
// muss in beide Richtungen lesbar sein. Dazu die Nummernvergabe, die ohne
// Zähler auskommt und deshalb den Bestand richtig lesen muss.

import { describe, expect, it } from 'vitest';
import {
  ANGEBOT_GUELTIG_TAGE, QUOTE_PREFIX_VORGABE, angebotZuRechnungsentwurf,
  istAbrechenbar, kennzahlen, neuesAngebot, nextQuoteNumber, quoteState, summiere,
} from './quotes';
import type { InvoiceItem, Quote } from '../types';

const tag = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const posten: InvoiceItem[] = [
  { description: 'Konzept', quantity: 10, unit: 'h', unitPrice: 90, total: 900, kind: 'time' },
  { description: 'Lizenz', quantity: 1, unit: 'Pauschal', unitPrice: 100, total: 100, kind: 'flat' },
];

function angebot(over: Partial<Quote> = {}): Quote {
  return {
    id: 'q1', number: 'AN-2026-0001', customerId: 1, projectId: 5,
    createdAt: tag(2026, 5, 1), validUntil: tag(2026, 5, 31),
    items: posten, subtotal: 1000, vatRate: 19, vatAmount: 190, total: 1190,
    notes: 'Ohne Reisekosten.', status: 'sent',
    ...over,
  };
}

describe('Gültigkeit', () => {
  it('lässt ein Angebot bis zum Ende des letzten Tages gelten', () => {
    // Um 09:00 am Stichtag ist es noch gültig — eine Frist endet abends,
    // nicht um Mitternacht des Vortags.
    const q = angebot();
    expect(quoteState(q, tag(2026, 5, 31))).toBe('sent');
    expect(quoteState(q, new Date(2026, 4, 31, 23, 59, 0).getTime())).toBe('sent');
    expect(quoteState(q, tag(2026, 6, 1))).toBe('expired');
  });

  it('lässt Entwürfe nicht ablaufen', () => {
    // Ein Entwurf wurde nie hinausgegeben; es gibt keine Frist, die verstreicht.
    expect(quoteState(angebot({ status: 'draft' }), tag(2027, 1, 1))).toBe('draft');
  });

  it('lässt ein angenommenes Angebot nicht nachträglich ablaufen', () => {
    // Wer zugesagt hat, hat zugesagt.
    expect(quoteState(angebot({ status: 'accepted' }), tag(2027, 1, 1))).toBe('accepted');
  });

  it('erlaubt die Abrechnung auch nach Fristablauf', () => {
    // Der Kunde sagt oft erst nach der Frist zu. Dann ist das Angebot die
    // Grundlage, nicht das Hindernis.
    expect(istAbrechenbar(angebot(), tag(2026, 8, 1))).toBe(true);
    expect(istAbrechenbar(angebot({ status: 'draft' }))).toBe(false);
    expect(istAbrechenbar(angebot({ status: 'declined' }))).toBe(false);
  });
});

describe('Nummernvergabe ohne Zähler', () => {
  it('zählt von der höchsten vorhandenen Nummer weiter', () => {
    const bestand = [
      angebot({ id: 'a', number: 'AN-2026-0001' }),
      angebot({ id: 'b', number: 'AN-2026-0007' }),
      angebot({ id: 'c', number: 'AN-2026-0003' }),
    ];
    expect(nextQuoteNumber(bestand, 'AN-2026-')).toBe('AN-2026-0008');
  });

  it('beginnt bei leerem Bestand mit der Eins', () => {
    expect(nextQuoteNumber([], 'AN-2026-')).toBe('AN-2026-0001');
  });

  it('lässt sich von einem anderen Präfix nicht beirren', () => {
    // Beim Jahreswechsel steht der Vorjahresbestand noch da. Zählte man ihn
    // mit, begänne das neue Jahr bei der Nummer des alten.
    const bestand = [angebot({ number: 'AN-2025-0042' })];
    expect(nextQuoteNumber(bestand, 'AN-2026-')).toBe('AN-2026-0001');
  });

  it('überspringt von Hand vergebene Nummern, die keine Zahl sind', () => {
    const bestand = [
      angebot({ id: 'a', number: 'AN-2026-Sonderfall' }),
      angebot({ id: 'b', number: 'AN-2026-0002' }),
    ];
    expect(nextQuoteNumber(bestand, 'AN-2026-')).toBe('AN-2026-0003');
  });

  it('vergibt nach dem Löschen des letzten Angebots dessen Nummer erneut', () => {
    // Das ist Absicht und der Unterschied zur Rechnung: Für Angebotsnummern
    // gibt es keine Lückenlosigkeitspflicht, also darf eine frei gewordene
    // Nummer wieder benutzt werden.
    const bestand = [angebot({ number: 'AN-2026-0001' })];
    expect(nextQuoteNumber(bestand, 'AN-2026-')).toBe('AN-2026-0002');
    expect(nextQuoteNumber([], 'AN-2026-')).toBe('AN-2026-0001');
  });
});

describe('Summen', () => {
  it('rechnet Netto, Steuer und Gesamt', () => {
    expect(summiere(posten, 19)).toEqual({ subtotal: 1000, vatAmount: 190, total: 1190 });
  });

  it('lässt bei einem Kleinunternehmer die Steuer weg', () => {
    expect(summiere(posten, 0)).toEqual({ subtotal: 1000, vatAmount: 0, total: 1000 });
  });

  it('rundet auf Cent, statt Fließkomma-Rauschen weiterzureichen', () => {
    const krumm: InvoiceItem[] = [
      { description: 'a', quantity: 1, unit: 'h', unitPrice: 0.1, total: 0.1 },
      { description: 'b', quantity: 1, unit: 'h', unitPrice: 0.2, total: 0.2 },
    ];
    expect(summiere(krumm, 19).subtotal).toBe(0.3);
  });
});

describe('Angebot wird Rechnung', () => {
  const jetzt = tag(2026, 6, 15);

  it('legt einen Entwurf ohne Nummer an', () => {
    // Die Nummer entsteht erst beim Finalisieren — bei eingeschalteter
    // Synchronisierung serverseitig. Hier eine zu vergeben hiesse, den Weg zu
    // umgehen, der Nummerndubletten verhindert.
    const { invoice } = angebotZuRechnungsentwurf(angebot(), jetzt);
    expect(invoice.status).toBe('draft');
    expect(invoice.number).toBe('');
  });

  it('übernimmt Kunde, Projekt, Positionen, Summen und Anmerkungen', () => {
    const { invoice } = angebotZuRechnungsentwurf(angebot(), jetzt);
    expect(invoice.customerId).toBe(1);
    expect(invoice.projectId).toBe(5);
    expect(invoice.items).toHaveLength(2);
    expect(invoice.items[0].description).toBe('Konzept');
    expect(invoice.subtotal).toBe(1000);
    expect(invoice.vatAmount).toBe(190);
    expect(invoice.total).toBe(1190);
    expect(invoice.notes).toBe('Ohne Reisekosten.');
  });

  it('kopiert die Positionen, statt sie zu teilen', () => {
    // Sonst änderte eine spätere Bearbeitung des Entwurfs rückwirkend das
    // Angebot, das dem Kunden schon vorliegt.
    const q = angebot();
    const { invoice } = angebotZuRechnungsentwurf(q, jetzt);
    invoice.items[0].description = 'Geändert';
    expect(q.items[0].description).toBe('Konzept');
  });

  it('macht die Spur in beide Richtungen lesbar', () => {
    const { invoice, quote } = angebotZuRechnungsentwurf(angebot(), jetzt);
    expect(invoice.quoteId).toBe('q1');
    expect(quote.invoiceId).toBe(invoice.id);
    expect(quote.status).toBe('invoiced');
  });

  it('setzt die Fälligkeit auf das Zahlungsziel ab heute', () => {
    const { invoice } = angebotZuRechnungsentwurf(angebot(), jetzt, 14);
    expect(invoice.createdAt).toBe(jetzt);
    expect(invoice.dueDate).toBe(tag(2026, 6, 29));
  });

  it('legt die Rechnung ohne Zahlungen und ohne Mahnungen an', () => {
    const { invoice } = angebotZuRechnungsentwurf(angebot(), jetzt);
    expect(invoice.payments).toEqual([]);
    expect(invoice.paid).toBe(false);
    expect(invoice.reminders).toEqual([]);
  });

  it('behält ein bereits vorhandenes Entscheidungsdatum', () => {
    // Wer am 1. Juni zugesagt hat, hat nicht am 15. zugesagt, nur weil die
    // Rechnung erst dann geschrieben wurde.
    const zugesagt = angebot({ status: 'accepted', decidedAt: tag(2026, 6, 1) });
    expect(angebotZuRechnungsentwurf(zugesagt, jetzt).quote.decidedAt).toBe(tag(2026, 6, 1));
  });
});

describe('Neues Angebot', () => {
  const jetzt = tag(2026, 5, 1);

  it('gilt ab Werk dreissig Tage', () => {
    const q = neuesAngebot([], 'AN-2026-', 19, jetzt);
    expect(q.validUntil).toBe(tag(2026, 5, 1 + ANGEBOT_GUELTIG_TAGE));
    expect(q.status).toBe('draft');
    expect(q.number).toBe('AN-2026-0001');
  });

  it('übernimmt den Steuersatz des Absenders', () => {
    expect(neuesAngebot([], 'AN-2026-', 0, jetzt).vatRate).toBe(0);
  });

  it('bildet das Vorgabe-Präfix aus dem Jahr', () => {
    expect(QUOTE_PREFIX_VORGABE(2026)).toBe('AN-2026-');
  });
});

describe('Erfolgsquote', () => {
  it('zählt nur entschiedene Angebote in den Nenner', () => {
    // Sonst sänke die Quote jedes Mal, wenn man ein neues Angebot schreibt.
    const k = kennzahlen([
      angebot({ id: 'a', status: 'draft' }),
      angebot({ id: 'b', status: 'sent', validUntil: tag(2099, 1, 1) }),
      angebot({ id: 'c', status: 'accepted' }),
      angebot({ id: 'd', status: 'declined' }),
    ], tag(2026, 5, 15));
    expect(k.offen).toBe(1);
    expect(k.angenommen).toBe(1);
    expect(k.abgelehnt).toBe(1);
    expect(k.quote).toBe(50);
  });

  it('wertet ein abgelaufenes Angebot wie eine Ablehnung', () => {
    // Keine Antwort ist eine Antwort.
    const k = kennzahlen([
      angebot({ id: 'a', status: 'accepted' }),
      angebot({ id: 'b', status: 'sent', validUntil: tag(2026, 1, 1) }),
    ], tag(2026, 5, 15));
    expect(k.abgelaufen).toBe(1);
    expect(k.quote).toBe(50);
  });

  it('zählt ein abgerechnetes Angebot als angenommen', () => {
    const k = kennzahlen([angebot({ status: 'invoiced' })], tag(2026, 5, 15));
    expect(k.angenommen).toBe(1);
    expect(k.angenommenerWert).toBe(1190);
    expect(k.quote).toBe(100);
  });

  it('meldet keine Quote, solange nichts entschieden ist', () => {
    // Null Prozent wäre eine Aussage, die niemand belegen kann.
    expect(kennzahlen([angebot({ status: 'draft' })]).quote).toBeNull();
    expect(kennzahlen([]).quote).toBeNull();
  });
});
