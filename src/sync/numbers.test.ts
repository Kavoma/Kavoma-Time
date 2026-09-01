import { afterEach, describe, expect, it } from 'vitest';
import type { Customer, Invoice } from '../types';
import {
  advanceCounter,
  allocateNumber,
  counterFromInvoiceNumber,
  debtorFloor,
  DEBTOR_START,
  formatInvoiceNumber,
  invoiceFloor,
  NumberUnavailableError,
} from './numbers';

function mockApi(impl: unknown) {
  (globalThis as unknown as { window: unknown }).window = { api: impl };
}

afterEach(() => { (globalThis as unknown as { window: unknown }).window = {}; });

/** Nur die Felder, auf die die Nummernlogik schaut. */
function invoice(number: string, year: number): Invoice {
  return { number, createdAt: new Date(year, 5, 1).getTime() } as Invoice;
}

function customer(debtorNumber?: string): Customer {
  return { debtorNumber } as Customer;
}

describe('formatInvoiceNumber', () => {
  it('setzt das Jahr ein und füllt auf drei Stellen auf', () => {
    expect(formatInvoiceNumber('YYYY-', 7, 2026)).toBe('2026-007');
  });

  it('nimmt YYYY- als Vorgabe, wenn kein Präfix gesetzt ist', () => {
    expect(formatInvoiceNumber(undefined, 1, 2026)).toBe('2026-001');
    expect(formatInvoiceNumber('', 1, 2026)).toBe('2026-001');
  });

  it('lässt eigene Präfixe unangetastet', () => {
    expect(formatInvoiceNumber('RE-', 42, 2026)).toBe('RE-042');
  });

  it('hängt das Storno-Kürzel an', () => {
    expect(formatInvoiceNumber('YYYY-', 12, 2026, '-S')).toBe('2026-012-S');
  });

  it('kürzt dreistellige Zahlen nicht', () => {
    expect(formatInvoiceNumber('YYYY-', 1234, 2026)).toBe('2026-1234');
  });
});

describe('counterFromInvoiceNumber', () => {
  it('liest den Zähler aus dem Standardformat', () => {
    expect(counterFromInvoiceNumber('2026-007', 'YYYY-', 2026)).toBe(7);
  });

  it('ignoriert das Storno-Kürzel', () => {
    expect(counterFromInvoiceNumber('2026-012-S', 'YYYY-', 2026)).toBe(12);
  });

  it('kommt mit einem zwischenzeitlich geänderten Präfix zurecht', () => {
    // Alte Rechnung trägt RE-, das Präfix steht inzwischen auf YYYY-.
    expect(counterFromInvoiceNumber('RE-042', 'YYYY-', 2026)).toBe(42);
  });

  it('liefert null für Entwürfe ohne Nummer', () => {
    expect(counterFromInvoiceNumber('', 'YYYY-', 2026)).toBeNull();
    expect(counterFromInvoiceNumber('   ', 'YYYY-', 2026)).toBeNull();
  });

  it('liefert null, wenn gar keine Ziffer drinsteht', () => {
    expect(counterFromInvoiceNumber('ENTWURF', 'YYYY-', 2026)).toBeNull();
  });

  it('verwechselt die Jahreszahl im Präfix nicht mit dem Zähler', () => {
    expect(counterFromInvoiceNumber('2026-001', 'YYYY-', 2026)).toBe(1);
  });
});

describe('invoiceFloor', () => {
  it('liegt über der höchsten vergebenen Nummer des Jahres', () => {
    const invoices = [invoice('2026-001', 2026), invoice('2026-002', 2026)];
    expect(invoiceFloor(invoices, 'YYYY-', 2026, 1)).toBe(3);
  });

  // Genau der Fehler, der die doppelte 001 erzeugt hat: Der Server begann bei 1,
  // obwohl es schon Rechnungen gab.
  it('hebt einen zurückgebliebenen lokalen Zähler an', () => {
    const invoices = [invoice('2026-001', 2026), invoice('2026-012', 2026)];
    expect(invoiceFloor(invoices, 'YYYY-', 2026, 1)).toBe(13);
  });

  it('lässt einen höheren lokalen Zähler stehen', () => {
    const invoices = [invoice('2026-001', 2026)];
    expect(invoiceFloor(invoices, 'YYYY-', 2026, 50)).toBe(50);
  });

  it('zählt Entwürfe nicht mit — die tragen noch keine Nummer', () => {
    const invoices = [invoice('2026-005', 2026), invoice('', 2026)];
    expect(invoiceFloor(invoices, 'YYYY-', 2026, 1)).toBe(6);
  });

  it('beginnt bei 1, wenn es noch nichts gibt', () => {
    expect(invoiceFloor([], 'YYYY-', 2026, 1)).toBe(1);
  });

  it('lässt den Kreis im Januar neu beginnen, wenn das Jahr im Präfix steht', () => {
    const invoices = [invoice('2026-042', 2026)];
    expect(invoiceFloor(invoices, 'YYYY-', 2027, 1)).toBe(1);
  });

  it('zählt ohne Jahr im Präfix über alle Jahre weiter', () => {
    // Sonst käme RE-042 im nächsten Jahr ein zweites Mal.
    const invoices = [invoice('RE-042', 2026)];
    expect(invoiceFloor(invoices, 'RE-', 2027, 1)).toBe(43);
  });
});

describe('debtorFloor', () => {
  it('hält den DATEV-Bereich ein, auch wenn nichts da ist', () => {
    expect(debtorFloor([], DEBTOR_START)).toBe(DEBTOR_START);
  });

  it('liegt über der höchsten vergebenen Nummer', () => {
    const customers = [customer('10001'), customer('10007')];
    expect(debtorFloor(customers, DEBTOR_START)).toBe(10008);
  });

  // Nach dem Sync-Fehler trugen neue Kunden Nummern ab 1. Die dürfen die
  // Untergrenze nicht unter den DATEV-Bereich ziehen.
  it('lässt sich von zu niedrigen Altbeständen nicht herunterziehen', () => {
    const customers = [customer('1'), customer('2'), customer('3')];
    expect(debtorFloor(customers, DEBTOR_START)).toBe(DEBTOR_START);
  });

  it('überspringt Kunden ohne oder mit nicht-numerischer Nummer', () => {
    const customers = [customer(undefined), customer('K-42'), customer('10005')];
    expect(debtorFloor(customers, DEBTOR_START)).toBe(10006);
  });
});

describe('advanceCounter', () => {
  it('zieht den lokalen Zähler hinter die vergebene Nummer', () => {
    expect(advanceCounter(1, 12)).toBe(13);
  });

  it('läuft nie rückwärts', () => {
    expect(advanceCounter(20, 12)).toBe(20);
  });
});

describe('allocateNumber', () => {
  it('nimmt die Untergrenze, solange keine Synchronisierung eingerichtet ist', async () => {
    mockApi({ syncAllocateNumber: async () => ({ source: 'local' }) });
    const r = await allocateNumber('invoice', 5, 2026);
    expect(r).toEqual({ value: 5, source: 'local' });
  });

  it('läuft auch ganz ohne Electron (Browser-Vorschau)', async () => {
    (globalThis as unknown as { window: unknown }).window = {};
    const r = await allocateNumber('invoice', 3, 2026);
    expect(r).toEqual({ value: 3, source: 'local' });
  });

  it('nimmt die Server-Nummer', async () => {
    mockApi({ syncAllocateNumber: async () => ({ source: 'server', value: 91 }) });
    const r = await allocateNumber('invoice', 5, 2026);
    expect(r).toEqual({ value: 91, source: 'server' });
  });

  it('reicht Jahr und Untergrenze an den Server durch', async () => {
    const gesehen: unknown[] = [];
    mockApi({
      syncAllocateNumber: async (...args: unknown[]) => {
        gesehen.push(args);
        return { source: 'server', value: 13 };
      },
    });
    await allocateNumber('invoice', 13, 2026);
    expect(gesehen[0]).toEqual(['invoice', 2026, 13]);
  });

  // Eine Debitorennummer gehört dauerhaft zu einem Kunden. Liefe sie nach Jahr,
  // begänne die Vergabe im Januar wieder von vorn.
  it('zieht Debitorennummern ohne Jahresbindung', async () => {
    const gesehen: unknown[] = [];
    mockApi({
      syncAllocateNumber: async (...args: unknown[]) => {
        gesehen.push(args);
        return { source: 'server', value: 10002 };
      },
    });
    await allocateNumber('debtor', 10001, 2026);
    expect(gesehen[0]).toEqual(['debtor', 0, 10001]);
  });

  it('verweigert die Vergabe, statt eine Dublette zu erzeugen', async () => {
    mockApi({ syncAllocateNumber: async () => ({ source: 'unavailable', error: 'offline' }) });
    await expect(allocateNumber('invoice', 5, 2026)).rejects.toBeInstanceOf(NumberUnavailableError);
  });

  it('fällt bei einem kaputten Kanal auf die Untergrenze zurück', async () => {
    mockApi({ syncAllocateNumber: () => Promise.reject(new Error('IPC weg')) });
    const r = await allocateNumber('invoice', 8, 2026);
    expect(r).toEqual({ value: 8, source: 'local' });
  });
});
