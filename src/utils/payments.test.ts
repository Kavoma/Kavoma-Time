// Zahlungseingänge entscheiden, was auf einer Mahnung steht, welcher Umsatz in
// welchem Quartal versteuert wird und was in der Betriebsprüfung als bezahlt
// gilt. Drei Stellen, an denen ein Rechenfehler teuer wird — deshalb getestet,
// anders als der Rest der Oberfläche.

import { describe, expect, it } from 'vitest';
import {
  alleZahlungenEntfernt, gesamtforderung, gezahlt, komplettBezahlt,
  migriereZahlungsschalter, mitZahlung, neueZahlung, offen, ohneZahlung,
  ustAnteil, zahlungenIm, zahlungsstand,
} from './payments';
import type { Invoice, Payment } from '../types';

const tag = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

function rechnung(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1', number: '2026-0001', customerId: 1, projectId: null, mode: 'fixed',
    periodFrom: tag(2026, 3, 1), periodTo: tag(2026, 3, 31),
    createdAt: tag(2026, 4, 5), dueDate: tag(2026, 4, 19),
    items: [], entryIds: [], subtotal: 1000, vatRate: 19, vatAmount: 190, total: 1190,
    notes: '', paid: false, payments: [], status: 'active', reminders: [],
    ...over,
  } as Invoice;
}

const zahlung = (amount: number, am: number, over: Partial<Payment> = {}): Payment =>
  neueZahlung({ amount, paidAt: am, ...over });

describe('Summen', () => {
  it('zählt Mahngebühren zur Forderung', () => {
    // Wer sie ausließe, hielte eine Rechnung für beglichen, bei der die Gebühr
    // noch offen ist.
    const mitMahnung = rechnung({
      reminders: [{ level: 1, sentAt: tag(2026, 5, 1), newDueDate: tag(2026, 5, 15), fee: 5 }],
    });
    expect(gesamtforderung(mitMahnung)).toBe(1195);
  });

  it('summiert mehrere Zahlungen', () => {
    let inv = rechnung();
    inv = mitZahlung(inv, zahlung(500, tag(2026, 4, 10)));
    inv = mitZahlung(inv, zahlung(300, tag(2026, 5, 2)));
    expect(gezahlt(inv)).toBe(800);
    expect(offen(inv)).toBe(390);
  });

  it('rundet Fließkomma-Rauschen weg', () => {
    // 0.1 + 0.2 ist in Fließkomma nicht 0.3. Ohne Rundung stünde in der App
    // „noch 0,000000000000004 € offen" — und die Rechnung bliebe ewig offen.
    let inv = rechnung({ subtotal: 0.3, vatAmount: 0, vatRate: 0, total: 0.3 });
    inv = mitZahlung(inv, zahlung(0.1, tag(2026, 4, 10)));
    inv = mitZahlung(inv, zahlung(0.2, tag(2026, 4, 11)));
    expect(offen(inv)).toBe(0);
    expect(inv.paid).toBe(true);
  });
});

describe('Zahlungsstand', () => {
  it('unterscheidet offen, teilweise, bezahlt und überzahlt', () => {
    const leer = rechnung();
    expect(zahlungsstand(leer)).toBe('offen');
    expect(zahlungsstand(mitZahlung(leer, zahlung(500, tag(2026, 4, 10))))).toBe('teilweise');
    expect(zahlungsstand(mitZahlung(leer, zahlung(1190, tag(2026, 4, 10))))).toBe('bezahlt');
    expect(zahlungsstand(mitZahlung(leer, zahlung(1200, tag(2026, 4, 10))))).toBe('ueberzahlt');
  });

  it('lässt einen halben Cent Rundungsdifferenz durchgehen', () => {
    // Ein Cent zu wenig soll keine Mahnung auslösen.
    const fast = mitZahlung(rechnung(), zahlung(1189.996, tag(2026, 4, 10)));
    expect(zahlungsstand(fast)).toBe('bezahlt');
  });

  it('meldet einen echten Restcent als offen', () => {
    const fehlt = mitZahlung(rechnung(), zahlung(1189.98, tag(2026, 4, 10)));
    expect(zahlungsstand(fehlt)).toBe('teilweise');
    expect(offen(fehlt)).toBe(0.02);
  });
});

describe('Der abgeleitete Schalter', () => {
  it('setzt paid und paidAt auf die letzte Zahlung', () => {
    // Nicht die erste: Ausgeglichen war die Rechnung erst mit der letzten.
    let inv = mitZahlung(rechnung(), zahlung(600, tag(2026, 4, 10)));
    expect(inv.paid).toBe(false);
    expect(inv.paidAt).toBeUndefined();
    inv = mitZahlung(inv, zahlung(590, tag(2026, 6, 1)));
    expect(inv.paid).toBe(true);
    expect(inv.paidAt).toBe(tag(2026, 6, 1));
  });

  it('entfernt paidAt wieder, wenn eine Zahlung zurückgenommen wird', () => {
    // Ein Zahldatum ohne bezahlte Rechnung landete sonst in der
    // Ist-Versteuerung — als Umsatz, der nie floss.
    const p = zahlung(1190, tag(2026, 4, 10));
    const bezahlt = mitZahlung(rechnung(), p);
    const zurueck = ohneZahlung(bezahlt, p.id);
    expect(zurueck.paid).toBe(false);
    expect('paidAt' in zurueck).toBe(false);
  });

  it('sortiert die Zahlungen nach Datum, egal wie sie erfasst wurden', () => {
    let inv = mitZahlung(rechnung(), zahlung(90, tag(2026, 6, 1)));
    inv = mitZahlung(inv, zahlung(100, tag(2026, 4, 10)));
    expect(inv.payments!.map((p) => p.paidAt)).toEqual([tag(2026, 4, 10), tag(2026, 6, 1)]);
  });
});

describe('Die Ein-Klick-Wege aus der Liste', () => {
  it('bucht den ganzen Rest auf einmal', () => {
    const halb = mitZahlung(rechnung(), zahlung(400, tag(2026, 4, 10)));
    const fertig = komplettBezahlt(halb, tag(2026, 5, 20));
    expect(fertig.paid).toBe(true);
    expect(fertig.payments).toHaveLength(2);
    expect(fertig.payments![1].amount).toBe(790);
  });

  it('erzeugt bei einer bereits bezahlten Rechnung keine Null-Zahlung', () => {
    const fertig = komplettBezahlt(rechnung(), tag(2026, 5, 20));
    expect(komplettBezahlt(fertig, tag(2026, 5, 21))).toBe(fertig);
  });

  it('nimmt alle Zahlungen zurück', () => {
    const zurueck = alleZahlungenEntfernt(komplettBezahlt(rechnung()));
    expect(zurueck.payments).toEqual([]);
    expect(zurueck.paid).toBe(false);
  });

  it('bezieht die Mahngebühr in den Restbetrag ein', () => {
    const mitMahnung = rechnung({
      reminders: [{ level: 1, sentAt: tag(2026, 5, 1), newDueDate: tag(2026, 5, 15), fee: 5 }],
    });
    expect(komplettBezahlt(mitMahnung).payments![0].amount).toBe(1195);
  });
});

describe('Umstellung des alten Ja/Nein-Schalters', () => {
  it('macht aus „bezahlt" eine Zahlung über den vollen Betrag', () => {
    const alt = { ...rechnung({ paid: true, paidAt: tag(2026, 4, 12) }), payments: undefined } as Invoice;
    const neu = migriereZahlungsschalter(alt);
    expect(neu.payments).toHaveLength(1);
    expect(neu.payments![0].amount).toBe(1190);
    expect(neu.payments![0].paidAt).toBe(tag(2026, 4, 12));
    expect(neu.paid).toBe(true);
  });

  it('kennzeichnet sie als erschlossen, nicht als erfasst', () => {
    // Wir wissen, dass die Rechnung als bezahlt galt — nicht, wann welcher
    // Betrag einging. Der Unterschied gehört in eine Betriebsprüfung.
    const alt = { ...rechnung({ paid: true, paidAt: tag(2026, 4, 12) }), payments: undefined } as Invoice;
    expect(migriereZahlungsschalter(alt).payments![0].source).toBe('switch');
    expect(komplettBezahlt(rechnung()).payments![0].source).toBe('manual');
  });

  it('nimmt bei „nicht bezahlt" eine leere Liste', () => {
    const alt = { ...rechnung(), payments: undefined } as Invoice;
    expect(migriereZahlungsschalter(alt).payments).toEqual([]);
  });

  it('fällt ohne Zahldatum auf das Rechnungsdatum zurück', () => {
    const alt = { ...rechnung({ paid: true }), payments: undefined, paidAt: undefined } as Invoice;
    expect(migriereZahlungsschalter(alt).payments![0].paidAt).toBe(tag(2026, 4, 5));
  });

  it('lässt eine bereits umgestellte Rechnung unverändert', () => {
    // Die Migration läuft bei jedem Start. Liefe sie zweimal durch, stünde die
    // Zahlung doppelt und die Rechnung wäre plötzlich überzahlt.
    const einmal = migriereZahlungsschalter(
      { ...rechnung({ paid: true, paidAt: tag(2026, 4, 12) }), payments: undefined } as Invoice,
    );
    const zweimal = migriereZahlungsschalter(einmal);
    expect(zweimal.payments).toHaveLength(1);
    expect(gezahlt(zweimal)).toBe(1190);
  });
});

describe('Umsatzsteuer bei Ist-Versteuerung', () => {
  it('teilt die Steuer anteilig auf eine Teilzahlung auf', () => {
    // Bei 1190 € brutto und 190 € Steuer trägt eine Zahlung über 595 € die
    // Hälfte davon.
    const inv = rechnung();
    expect(ustAnteil(inv, zahlung(595, tag(2026, 4, 10)))).toBe(95);
    expect(ustAnteil(inv, zahlung(1190, tag(2026, 4, 10)))).toBe(190);
  });

  it('rechnet eine Überzahlung nicht in mehr Steuer um', () => {
    // Wer zu viel überweist, schuldet deshalb keine höhere Umsatzsteuer.
    expect(ustAnteil(rechnung(), zahlung(2000, tag(2026, 4, 10)))).toBe(190);
  });

  it('bleibt bei einer Rechnung über null Euro bei null', () => {
    const leer = rechnung({ subtotal: 0, vatAmount: 0, total: 0 });
    expect(ustAnteil(leer, zahlung(50, tag(2026, 4, 10)))).toBe(0);
  });
});

describe('Zahlungen eines Zeitraums', () => {
  it('sammelt sie über alle Rechnungen und ordnet sie nach Datum', () => {
    const a = mitZahlung(rechnung({ id: 'a', number: 'A' }), zahlung(100, tag(2026, 6, 1)));
    const b = mitZahlung(rechnung({ id: 'b', number: 'B' }), zahlung(200, tag(2026, 3, 1)));
    const treffer = zahlungenIm([a, b], tag(2026, 1, 1), tag(2026, 12, 31));
    expect(treffer.map((t) => t.invoice.number)).toEqual(['B', 'A']);
  });

  it('lässt Entwürfe und Zahlungen außerhalb des Zeitraums weg', () => {
    const entwurf = mitZahlung(rechnung({ id: 'd', status: 'draft' }), zahlung(50, tag(2026, 5, 1)));
    const spaet = mitZahlung(rechnung({ id: 's' }), zahlung(50, tag(2027, 1, 5)));
    expect(zahlungenIm([entwurf, spaet], tag(2026, 1, 1), tag(2026, 12, 31))).toHaveLength(0);
  });
});
