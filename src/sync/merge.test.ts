import { describe, expect, it } from 'vitest';
import type { AppState, Customer, Invoice, TimeEntry } from '../types';
import { applyOps } from './merge';
import { diffState } from './diff';
import { stampChanges } from './stamp';
import type { Op } from './types';

const DEV_A = 'aaaa-device';
const DEV_B = 'bbbb-device';

function baseState(patch: Partial<AppState> = {}): AppState {
  return {
    isRunning: false, startedAt: null, sessionStartedAt: null, elapsedBefore: 0,
    currentCustomerId: 0, currentProjectId: 0, currentDescription: '',
    entries: [], customers: [], projects: [],
    weeklyTargetHours: 40, shortcuts: { startPause: 'X' },
    issuer: { name: '', street: '', zip: '', city: '', email: '', phone: '',
              iban: '', bic: '', bank: '', taxId: '', smallBusiness: true, vatRate: 19 },
    invoices: [], nextInvoiceCounter: 1, invoicePrefix: 'YYYY-', nextDebtorNumber: 10001,
    attachments: [], vendorInvoices: [], contracts: [],
    invoiceTemplates: [], recurringInvoices: [],
    syncLamport: 0, syncVersions: {}, syncTombstones: [], syncConflicts: [],
    ...patch,
  } as AppState;
}

function customer(id: number, name: string): Customer {
  return { id, name, color: '#fff' };
}

function op(patch: Partial<Op> & Pick<Op, 'entity' | 'entityId' | 'op'>): Op {
  return {
    id: `op-${Math.random()}`, deviceId: DEV_B, lamport: 1, updatedAt: 1000,
    ...patch,
  } as Op;
}

/** Bildet nach, was ein Gerät lokal tut: ändern und dabei stempeln. */
function localChange(state: AppState, mutate: (s: AppState) => AppState, device = DEV_A): AppState {
  return stampChanges(state, mutate(state), device)!;
}

/** Die Ops, die ein Gerät für eine lokale Änderung erzeugen würde. */
function opsFor(before: AppState, after: AppState, device = DEV_A): Op[] {
  return diffState(before, after, device, after.syncLamport ?? 0);
}

describe('applyOps — Grundlagen', () => {
  it('übernimmt eine unbekannte Entität', () => {
    const { state, applied } = applyOps(baseState(), [
      op({ entity: 'customer', entityId: '5', op: 'upsert', payload: customer(5, 'Müller GmbH') }),
    ]);
    expect(state.customers).toHaveLength(1);
    expect(state.customers[0].name).toBe('Müller GmbH');
    expect(applied).toBe(1);
  });

  it('ist idempotent — dieselben Ops zweimal ergeben denselben Zustand', () => {
    const ops = [
      op({ entity: 'customer', entityId: '5', op: 'upsert', payload: customer(5, 'A'), lamport: 3 }),
      op({ entity: 'customer', entityId: '6', op: 'upsert', payload: customer(6, 'B'), lamport: 4 }),
    ];
    const once = applyOps(baseState(), ops).state;
    const twice = applyOps(once, ops).state;
    expect(twice.customers).toEqual(once.customers);
    expect(twice.syncConflicts).toEqual(once.syncConflicts);
  });

  it('spielt Ops unabhängig von ihrer Reihenfolge gleich ein', () => {
    const ops = [
      op({ entity: 'customer', entityId: '5', op: 'upsert', payload: customer(5, 'Alt'), lamport: 2 }),
      op({ entity: 'customer', entityId: '5', op: 'upsert', payload: customer(5, 'Neu'), lamport: 9 }),
    ];
    const vorwaerts = applyOps(baseState(), ops).state;
    const rueckwaerts = applyOps(baseState(), [...ops].reverse()).state;
    expect(vorwaerts.customers[0].name).toBe('Neu');
    expect(rueckwaerts.customers[0].name).toBe('Neu');
  });
});

describe('Gleichzeitig geänderter Kunde', () => {
  it('höherer Lamport gewinnt und der Konflikt wird protokolliert', () => {
    // Gerät A legt den Kunden an und benennt ihn um.
    let a = localChange(baseState(), (s) => ({ ...s, customers: [customer(5, 'Original')] }));
    a = localChange(a, (s) => ({ ...s, customers: [customer(5, 'Von A geändert')] }));

    // Gerät B ändert denselben Kunden — mit höherem Zähler.
    const fremd = op({
      entity: 'customer', entityId: '5', op: 'upsert',
      payload: customer(5, 'Von B geändert'),
      lamport: (a.syncLamport ?? 0) + 5, deviceId: DEV_B,
    });

    const { state, conflicts } = applyOps(a, [fremd]);
    expect(state.customers[0].name).toBe('Von B geändert');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe('lamport');
    expect(conflicts[0].winnerDeviceId).toBe(DEV_B);
    expect(state.syncConflicts?.[0].label).toContain('Kunde');
  });

  it('niedrigerer Lamport verliert — die lokale Fassung bleibt', () => {
    let a = localChange(baseState(), (s) => ({ ...s, customers: [customer(5, 'Original')] }));
    a = localChange(a, (s) => ({ ...s, customers: [customer(5, 'Lokal neuer')] }));

    const veraltet = op({
      entity: 'customer', entityId: '5', op: 'upsert',
      payload: customer(5, 'Fremd veraltet'), lamport: 1, deviceId: DEV_B,
    });

    const { state, conflicts } = applyOps(a, [veraltet]);
    expect(state.customers[0].name).toBe('Lokal neuer');
    expect(conflicts[0].winnerDeviceId).toBe(DEV_A);
  });

  it('löst Gleichstand über die Geräte-Kennung auf — beide Seiten gleich', () => {
    const lokal = localChange(baseState(), (s) => ({ ...s, customers: [customer(5, 'A-Fassung')] }), DEV_A);
    const gleichstand = op({
      entity: 'customer', entityId: '5', op: 'upsert',
      payload: customer(5, 'B-Fassung'),
      lamport: lokal.syncLamport ?? 1, deviceId: DEV_B,
    });
    // DEV_B > DEV_A, also gewinnt B — auf beiden Geräten dieselbe Regel.
    expect(applyOps(lokal, [gleichstand]).state.customers[0].name).toBe('B-Fassung');
  });
});

describe('Angebote', () => {
  const angebot = (patch: Partial<import('../types').Quote> = {}) => ({
    id: 'q-1', number: 'AN-2026-0001', customerId: 5, projectId: null,
    createdAt: 0, validUntil: 0, items: [], subtotal: 100, vatRate: 19,
    vatAmount: 19, total: 119, notes: '', status: 'draft' as const, ...patch,
  });

  it('wandert als eigene Sammlung mit', () => {
    // Neue Sammlungen synchronisieren nur mit, wenn sie in `classify.ts`
    // stehen. Der Test hält fest, dass daran gedacht wurde.
    const lokal = localChange(baseState(), (s) => ({ ...s, quotes: [] }));
    const fremd = op({
      entity: 'quote', entityId: 'q-1', op: 'upsert',
      payload: angebot({ status: 'sent' }),
      lamport: (lokal.syncLamport ?? 0) + 1, deviceId: DEV_B,
    });
    const ergebnis = applyOps(lokal, [fremd]).state;
    expect(ergebnis.quotes).toHaveLength(1);
    expect(ergebnis.quotes[0].number).toBe('AN-2026-0001');
  });

  it('meldet ein geändertes Angebot als Änderung', () => {
    // Die Gegenrichtung: Was hier passiert, muss der Diff auch finden.
    const vorher = baseState({ quotes: [angebot()] });
    const nachher = localChange(vorher, (s) => ({
      ...s, quotes: [angebot({ status: 'accepted' })],
    }));
    const ops = diffState(vorher, nachher, DEV_A, nachher.syncLamport ?? 1);
    expect(ops.some((o) => o.entity === 'quote' && o.op === 'upsert')).toBe(true);
  });
});

describe('Rechnungen', () => {
  function invoice(patch: Partial<Invoice> = {}): Invoice {
    return {
      id: 'inv-1', number: '2026-001', customerId: 5, projectId: null, mode: 'hourly',
      periodFrom: 0, periodTo: 0, createdAt: 0, dueDate: 0, items: [], entryIds: [],
      subtotal: 100, vatRate: 19, vatAmount: 19, total: 119, notes: '',
      paid: false, status: 'active', reminders: [], ...patch,
    };
  }

  const zahlung = (id: string, amount: number, paidAt: number) => ({
    id, amount, paidAt, source: 'manual' as const, createdAt: paidAt,
  });

  it('vereinigt Zahlungseingänge beider Geräte, statt eine zu verlieren', () => {
    // Der teuerste Verlust im ganzen Abgleich: Eine Zahlung, die auf dem
    // anderen Gerät erfasst wurde, ist Geld, das eingegangen ist. Verschwände
    // sie, mahnte die App anschliessend einen längst bezahlten Betrag an.
    const lokal = localChange(baseState(), (s) => ({
      ...s, invoices: [invoice({ payments: [zahlung('p-a', 50, 1000)] })],
    }));
    const fremd = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ payments: [zahlung('p-b', 69, 2000)], notes: 'von B' }),
      lamport: (lokal.syncLamport ?? 0) + 5, deviceId: DEV_B,
    });

    const ergebnis = applyOps(lokal, [fremd]).state.invoices[0];
    expect(ergebnis.payments!.map((p) => p.id).sort()).toEqual(['p-a', 'p-b']);
    // 50 + 69 = 119 — die Rechnung ist damit ausgeglichen, obwohl **keine**
    // der beiden Seiten sie für bezahlt hielt.
    expect(ergebnis.paid).toBe(true);
    expect(ergebnis.paidAt).toBe(2000);
  });

  it('lässt „bezahlt" wieder fallen, wenn die vereinigten Zahlungen nicht reichen', () => {
    // `paid` ist abgeleitet — es darf nicht vom Gewinner mitgeschleppt werden.
    const lokal = localChange(baseState(), (s) => ({
      ...s,
      invoices: [invoice({ paid: true, paidAt: 999, payments: [zahlung('p-a', 19, 999)] })],
    }));
    const fremd = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ paid: true, paidAt: 999, payments: [zahlung('p-a', 19, 999)] }),
      lamport: (lokal.syncLamport ?? 0) + 5, deviceId: DEV_B,
    });
    const ergebnis = applyOps(lokal, [fremd]).state.invoices[0];
    expect(ergebnis.paid).toBe(false);
    expect('paidAt' in ergebnis).toBe(false);
  });

  it('lässt „bezahlt" von einem noch nicht aktualisierten Gerät in Ruhe', () => {
    // Während eines Roll-outs schickt das alte Gerät `paid: true` ganz ohne
    // Zahlungsliste. Würde hier abgeleitet, machte der Abgleich die Rechnung
    // stillschweigend wieder unbezahlt.
    const lokal = localChange(baseState(), (s) => ({
      ...s, invoices: [invoice({ paid: false })],
    }));
    const altesGeraet = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ paid: true, paidAt: 4000 }),   // kein `payments`
      lamport: (lokal.syncLamport ?? 0) + 5, deviceId: DEV_B,
    });
    const ergebnis = applyOps(lokal, [altesGeraet]).state.invoices[0];
    expect(ergebnis.paid).toBe(true);
    expect(ergebnis.paidAt).toBe(4000);
  });

  it('macht aus derselben Zahlung keine zwei', () => {
    // Vereinigt wird über die Zahlungs-ID; zweimal dasselbe bleibt einmal.
    const lokal = localChange(baseState(), (s) => ({
      ...s, invoices: [invoice({ payments: [zahlung('p-a', 119, 1000)] })],
    }));
    const fremd = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ payments: [zahlung('p-a', 119, 1000)], notes: 'von B' }),
      lamport: (lokal.syncLamport ?? 0) + 5, deviceId: DEV_B,
    });
    expect(applyOps(lokal, [fremd]).state.invoices[0].payments).toHaveLength(1);
  });

  it('finalisierte Rechnung schlägt Entwurf — auch mit höherem Lamport', () => {
    const lokal = localChange(baseState(), (s) => ({ ...s, invoices: [invoice({ status: 'active' })] }));
    const entwurf = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ status: 'draft', notes: 'noch in Arbeit' }),
      lamport: (lokal.syncLamport ?? 0) + 99, deviceId: DEV_B,
    });

    const { state, conflicts } = applyOps(lokal, [entwurf]);
    expect(state.invoices[0].status).toBe('active');
    expect(state.invoices[0].notes).toBe('');
    expect(conflicts[0].reason).toBe('invoice-status');
  });

  it('Storno schlägt Entwurf und finalisierte Fassung', () => {
    const lokal = localChange(baseState(), (s) => ({ ...s, invoices: [invoice({ status: 'active' })] }));
    const storno = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ status: 'cancelled', cancellationReason: 'Kunde abgesprungen' }),
      lamport: 1, deviceId: DEV_B,   // bewusst niedriger Zähler
    });
    expect(applyOps(lokal, [storno]).state.invoices[0].status).toBe('cancelled');
  });

  // Hier stand einmal die Umkehrung: „bezahlt" war monoton und liess sich nicht
  // zurücknehmen. Wer sich verklickte, bekam die Markierung beim naechsten
  // Abgleich zurueck — fuer die Person davor sah das aus, als entscheide die
  // App selbst.
  it('eine neuere Ruecknahme von „bezahlt" setzt sich durch', () => {
    const lokal = localChange(baseState(), (s) => ({
      ...s, invoices: [invoice({ paid: true, paidAt: 5000 })],
    }));
    const unbezahlt = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ paid: false }),
      lamport: (lokal.syncLamport ?? 0) + 10, deviceId: DEV_B,
    });
    const { state } = applyOps(lokal, [unbezahlt]);
    expect(state.invoices[0].paid).toBe(false);
  });

  it('ein aelterer Stand macht „bezahlt" nicht rueckgaengig', () => {
    // Gegen verspaetete Altstaende schuetzt die Lamport-Ordnung — dafuer
    // braucht es keine Sonderregel fuer ein einzelnes Feld.
    //
    // Zwei lokale Schritte, damit der eigene Zaehler wirklich ueber dem der
    // fremden Op liegt: Bei Gleichstand entscheidet die Geraete-Kennung, und
    // DEV_B laege alphabetisch vorn.
    const angelegt = localChange(baseState(), (s) => ({
      ...s, invoices: [invoice({ paid: false })],
    }));
    const lokal = localChange(angelegt, (s) => ({
      ...s, invoices: [invoice({ paid: true, paidAt: 5000 })],
    }));
    const alt = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ paid: false }),
      lamport: 1, deviceId: DEV_B,
    });
    const { state } = applyOps(lokal, [alt]);
    expect(state.invoices[0].paid).toBe(true);
    expect(state.invoices[0].paidAt).toBe(5000);
  });

  it('markiert eine fremde Zahlung auch hier als bezahlt', () => {
    const lokal = localChange(baseState(), (s) => ({ ...s, invoices: [invoice({ paid: false })] }));
    const bezahlt = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ paid: true, paidAt: 7000 }),
      lamport: (lokal.syncLamport ?? 0) + 5, deviceId: DEV_B,
    });
    const { state } = applyOps(lokal, [bezahlt]);
    expect(state.invoices[0].paid).toBe(true);
    expect(state.invoices[0].paidAt).toBe(7000);
  });

  it('vereinigt Mahnungen statt sie zu ersetzen', () => {
    const lokal = localChange(baseState(), (s) => ({
      ...s,
      invoices: [invoice({ reminders: [{ level: 1, sentAt: 100, newDueDate: 200, fee: 0 }] })],
    }));
    const fremd = op({
      entity: 'invoice', entityId: 'inv-1', op: 'upsert',
      payload: invoice({ reminders: [{ level: 2, sentAt: 300, newDueDate: 400, fee: 5 }] }),
      lamport: (lokal.syncLamport ?? 0) + 1, deviceId: DEV_B,
    });
    const { state } = applyOps(lokal, [fremd]);
    expect(state.invoices[0].reminders.map((r) => r.level)).toEqual([1, 2]);
  });
});

describe('Löschungen', () => {
  it('eine Löschung entfernt den Eintrag und hinterlässt einen Grabstein', () => {
    const lokal = localChange(baseState(), (s) => ({ ...s, customers: [customer(5, 'Weg damit')] }));
    const { state } = applyOps(lokal, [
      op({ entity: 'customer', entityId: '5', op: 'delete', lamport: 50, deviceId: DEV_B }),
    ]);
    expect(state.customers).toHaveLength(0);
    expect(state.syncTombstones).toHaveLength(1);
    expect(state.syncTombstones?.[0].entityId).toBe('5');
  });

  it('ein älterer Upsert bringt einen gelöschten Eintrag nicht zurück', () => {
    const lokal = localChange(baseState(), (s) => ({ ...s, customers: [customer(5, 'Weg damit')] }));
    const geloescht = applyOps(lokal, [
      op({ entity: 'customer', entityId: '5', op: 'delete', lamport: 50, deviceId: DEV_B }),
    ]).state;

    // Ein Gerät, das lange offline war, meldet den alten Stand nach.
    const { state, conflicts } = applyOps(geloescht, [
      op({ entity: 'customer', entityId: '5', op: 'upsert', payload: customer(5, 'Wiederauferstehung'), lamport: 10, deviceId: 'cccc-device' }),
    ]);
    expect(state.customers).toHaveLength(0);
    expect(conflicts[0].reason).toBe('tombstone');
  });

  it('ein neuerer Upsert darf denselben Eintrag wieder anlegen', () => {
    const lokal = localChange(baseState(), (s) => ({ ...s, customers: [customer(5, 'Weg damit')] }));
    const geloescht = applyOps(lokal, [
      op({ entity: 'customer', entityId: '5', op: 'delete', lamport: 50, deviceId: DEV_B }),
    ]).state;
    const { state } = applyOps(geloescht, [
      op({ entity: 'customer', entityId: '5', op: 'upsert', payload: customer(5, 'Doch wieder da'), lamport: 80, deviceId: DEV_B }),
    ]);
    expect(state.customers).toHaveLength(1);
    expect(state.customers[0].name).toBe('Doch wieder da');
  });
});

describe('ID-Kollision', () => {
  it('meldet zwei unabhängig erzeugte Einträge mit derselben ID, statt still einen zu schlucken', () => {
    const entryA: TimeEntry = { id: 1700000000000, customerId: 1, projectId: 1, description: 'Arbeit auf A', startedAt: 1, endedAt: 2, durationSeconds: 3600 };
    const entryB: TimeEntry = { id: 1700000000000, customerId: 2, projectId: 2, description: 'Arbeit auf B', startedAt: 5, endedAt: 6, durationSeconds: 1800 };

    // Lokal angelegt, nie abgeglichen → kein Versionsstempel.
    const lokal = baseState({ entries: [entryA] });
    const { conflicts } = applyOps(lokal, [
      op({ entity: 'entry', entityId: String(entryB.id), op: 'upsert', payload: entryB, lamport: 7, deviceId: DEV_B }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe('id-collision');
  });
});

describe('Einstellungen', () => {
  it('gleicht Absenderfelder einzeln ab — eine neue IBAN verliert nicht gegen eine neue Telefonnummer', () => {
    let a = localChange(baseState(), (s) => ({ ...s, issuer: { ...s.issuer, phone: '0123' } }));
    a = localChange(a, (s) => ({ ...s, issuer: { ...s.issuer, iban: 'DE-LOKAL' } }));

    const { state } = applyOps(a, [
      op({ entity: 'setting', entityId: 'issuer.phone', op: 'upsert', payload: '0999', lamport: 99, deviceId: DEV_B }),
    ]);
    expect(state.issuer.phone).toBe('0999');
    expect(state.issuer.iban).toBe('DE-LOKAL');
  });

  it('übernimmt Einzelwerte nach demselben Vorrang', () => {
    const a = localChange(baseState(), (s) => ({ ...s, weeklyTargetHours: 32 }));
    const { state } = applyOps(a, [
      op({ entity: 'setting', entityId: 'weeklyTargetHours', op: 'upsert', payload: 20, lamport: 99, deviceId: DEV_B }),
    ]);
    expect(state.weeklyTargetHours).toBe(20);
  });
});

describe('Der laufende Timer bleibt am Gerät', () => {
  it('erzeugt für Timer-Felder keine Ops', () => {
    const before = baseState();
    const after = { ...before, isRunning: true, startedAt: 123, sessionStartedAt: 123, currentDescription: 'Läuft' };
    expect(opsFor(before, after)).toHaveLength(0);
  });

  it('erzeugt für den fertigen Eintrag sehr wohl eine Op', () => {
    const before = baseState();
    const entry: TimeEntry = { id: 42, customerId: 1, projectId: 1, description: 'Fertig', startedAt: 1, endedAt: 2, durationSeconds: 60 };
    const after = { ...before, entries: [entry] };
    const ops = opsFor(before, after);
    expect(ops).toHaveLength(1);
    expect(ops[0].entity).toBe('entry');
    expect(ops[0].op).toBe('upsert');
  });

  it('erzeugt für gerätelokale Einstellungen keine Ops', () => {
    const before = baseState();
    const after = { ...before, afkTimeoutMinutes: 45, timerOverlayEnabled: false, endOfDayReminderHour: 20 };
    expect(opsFor(before, after)).toHaveLength(0);
  });
});

describe('Der Zähler überlebt', () => {
  it('bleibt beim Stempeln monoton', () => {
    let s = baseState({ syncLamport: 7 });
    s = localChange(s, (x) => ({ ...x, customers: [customer(1, 'Eins')] }));
    expect(s.syncLamport).toBe(8);
    s = localChange(s, (x) => ({ ...x, customers: [customer(1, 'Zwei')] }));
    expect(s.syncLamport).toBe(9);
  });

  it('bewegt sich nicht, wenn nichts Synchronisierbares passiert ist', () => {
    const s = baseState({ syncLamport: 7 });
    const nachher = localChange(s, (x) => ({ ...x, isRunning: true, startedAt: 5 }));
    expect(nachher.syncLamport).toBe(7);
  });
});

describe('Zusammenspiel von Diff und Merge', () => {
  it('zwei Geräte, die parallel je einen Kunden anlegen, behalten beide', () => {
    const start = baseState();

    const a = localChange(start, (s) => ({ ...s, customers: [customer(1, 'Kunde von A')] }), DEV_A);
    const b = localChange(start, (s) => ({ ...s, customers: [customer(2, 'Kunde von B')] }), DEV_B);

    const opsVonB = opsFor(start, b, DEV_B);
    const opsVonA = opsFor(start, a, DEV_A);

    const aNachher = applyOps(a, opsVonB).state;
    const bNachher = applyOps(b, opsVonA).state;

    const namen = (s: AppState) => s.customers.map((c) => c.name).sort();
    expect(namen(aNachher)).toEqual(['Kunde von A', 'Kunde von B']);
    expect(namen(bNachher)).toEqual(['Kunde von A', 'Kunde von B']);
  });

  it('zieht den Lamport-Zähler über den höchsten fremden Stand', () => {
    const lokal = baseState({ syncLamport: 3 });
    const { state } = applyOps(lokal, [
      op({ entity: 'customer', entityId: '9', op: 'upsert', payload: customer(9, 'X'), lamport: 40 }),
    ]);
    expect(state.syncLamport).toBeGreaterThan(40);
  });
});

// ============================================================
// Die Grundlinie des Aenderungsprotokolls
// ============================================================
// `AppStateContext` fuehrt neben dem Zustand eine Grundlinie mit: den Stand,
// von dem der naechste Diff ausgeht. Trifft ein Abgleich ein, bekommt die
// Grundlinie **dieselben Ops** — sie darf nicht durch den fertigen
// Merge-Zustand ersetzt werden.
//
// Genau das war der Fehler: Eine gerade lokal gesetzte Markierung („bezahlt")
// stand dann schon in der Grundlinie und galt damit als abgeglichen, obwohl sie
// nie uebertragen worden war. Auf dem einen Geraet bezahlt, auf dem anderen
// nicht — und beim zweiten Klick ging es dann.
describe('Grundlinie beim Einspielen fremder Aenderungen', () => {
  function invoice(patch: Partial<Invoice> = {}): Invoice {
    return {
      id: 'inv-1', number: '2026-001', customerId: 5, projectId: null, mode: 'hourly',
      periodFrom: 0, periodTo: 0, createdAt: 0, dueDate: 0, items: [], entryIds: [],
      subtotal: 100, vatRate: 19, vatAmount: 19, total: 119, notes: '',
      paid: false, status: 'active', reminders: [], ...patch,
    };
  }

  /** Kunde vom fremden Geraet — beruehrt die Rechnung nicht. */
  const fremdeOps: Op[] = [op({
    entity: 'customer', entityId: '5', op: 'upsert',
    payload: customer(5, 'Fremd GmbH'), lamport: 50, deviceId: DEV_B,
  })];

  it('behaelt die noch nicht uebertragene eigene Aenderung im Diff', () => {
    const grundlinie = localChange(baseState(), (s) => ({
      ...s, customers: [customer(5, 'Alt')], invoices: [invoice({ paid: false })],
    }));

    // Die Person klickt „bezahlt" — noch nicht uebertragen.
    const zustand = localChange(grundlinie, (s) => ({
      ...s, invoices: [invoice({ paid: true, paidAt: 5000 })],
    }));

    // Der Abgleich trifft ein. Beide Seiten bekommen dieselben Ops.
    const neueGrundlinie = applyOps(grundlinie, fremdeOps).state;
    const neuerZustand = applyOps(zustand, fremdeOps).state;

    expect(neuerZustand.invoices[0].paid).toBe(true);

    const ops = diffState(neueGrundlinie, neuerZustand, DEV_A, 99);
    const rechnungsOps = ops.filter((o) => o.entity === 'invoice');
    expect(rechnungsOps).toHaveLength(1);
    expect((rechnungsOps[0].payload as Invoice).paid).toBe(true);
  });

  it('meldet nichts zurueck, wenn nur Fremdes eingespielt wurde', () => {
    // Die Gegenprobe: Ohne eigene Aenderung darf kein Echo entstehen.
    const grundlinie = localChange(baseState(), (s) => ({
      ...s, customers: [customer(5, 'Alt')], invoices: [invoice()],
    }));

    const neueGrundlinie = applyOps(grundlinie, fremdeOps).state;
    const neuerZustand = applyOps(grundlinie, fremdeOps).state;

    expect(diffState(neueGrundlinie, neuerZustand, DEV_A, 99)).toHaveLength(0);
  });
});
