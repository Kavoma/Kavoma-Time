import { afterEach, describe, expect, it, vi } from 'vitest';
import { allocateNumber, formatInvoiceNumber, NumberUnavailableError } from './numbers';

function mockApi(impl: unknown) {
  (globalThis as unknown as { window: unknown }).window = { api: impl };
}

afterEach(() => { (globalThis as unknown as { window: unknown }).window = {}; });

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

describe('allocateNumber', () => {
  it('nimmt den lokalen Zähler, solange keine Synchronisierung eingerichtet ist', async () => {
    mockApi({ syncAllocateNumber: async () => ({ source: 'local' }) });
    const r = await allocateNumber('invoice', 5, 2026);
    expect(r).toEqual({ value: 5, bumpLocalCounter: true, source: 'local' });
  });

  it('läuft auch ganz ohne Electron (Browser-Vorschau)', async () => {
    (globalThis as unknown as { window: unknown }).window = {};
    const r = await allocateNumber('invoice', 3, 2026);
    expect(r.value).toBe(3);
    expect(r.bumpLocalCounter).toBe(true);
  });

  it('nimmt die Server-Nummer und lässt den lokalen Zähler in Ruhe', async () => {
    mockApi({ syncAllocateNumber: async () => ({ source: 'server', value: 91 }) });
    const r = await allocateNumber('invoice', 5, 2026);
    expect(r).toEqual({ value: 91, bumpLocalCounter: false, source: 'server' });
  });

  it('nimmt offline die vorgemerkte Nummer', async () => {
    mockApi({ syncAllocateNumber: async () => ({ source: 'reserve', value: 42 }) });
    const r = await allocateNumber('invoice', 5, 2026);
    expect(r).toEqual({ value: 42, bumpLocalCounter: false, source: 'reserve' });
  });

  it('verweigert die Vergabe, statt eine Dublette zu erzeugen', async () => {
    mockApi({ syncAllocateNumber: async () => ({ source: 'unavailable', error: 'offline' }) });
    await expect(allocateNumber('invoice', 5, 2026)).rejects.toBeInstanceOf(NumberUnavailableError);
  });

  it('fällt bei einem kaputten Kanal auf den lokalen Zähler zurück', async () => {
    mockApi({ syncAllocateNumber: () => Promise.reject(new Error('IPC weg')) });
    const r = await allocateNumber('invoice', 8, 2026);
    expect(r.value).toBe(8);
    expect(r.source).toBe('local');
  });
});
