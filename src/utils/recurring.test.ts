import { describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import { evaluateRecurringInvoices } from './recurring';

const TAG = 86_400_000;

function state(now: number): AppState {
  return {
    isRunning: false, startedAt: null, sessionStartedAt: null, elapsedBefore: 0,
    currentCustomerId: 0, currentProjectId: 0, currentDescription: '',
    entries: [], projects: [],
    customers: [{ id: 1, name: 'Müller GmbH', color: '#fff' }],
    weeklyTargetHours: 40, shortcuts: { startPause: 'X' },
    issuer: { name: '', street: '', zip: '', city: '', email: '', phone: '', iban: '', bic: '',
              bank: '', taxId: '', smallBusiness: false, vatRate: 19 },
    invoices: [], nextInvoiceCounter: 5, invoicePrefix: 'YYYY-', nextDebtorNumber: 10001,
    attachments: [], vendorInvoices: [], contracts: [],
    invoiceTemplates: [{
      id: 't1', name: 'Wartung', customerId: 1,
      items: [{ description: 'Wartung', quantity: 1, unit: 'Pauschal', unitPrice: 100, total: 100, kind: 'flat' }],
      serviceType: 'Dienstleistung', notes: '', dueDays: 14, createdAt: 0,
    }],
    quotes: [],
  recurringInvoices: [{
      id: 'r1', templateId: 't1', customerId: 1, cadence: 'monthly',
      dayOfPeriod: 1, nextDueAt: now - TAG, active: true,
    }],
  } as AppState;
}

describe('Wiederkehrende Rechnungen', () => {
  it('erzeugt Entwürfe ohne Nummer', () => {
    const now = Date.UTC(2026, 5, 15);
    const result = evaluateRecurringInvoices(now, state(now));

    expect(result.generatedCount).toBeGreaterThan(0);
    for (const inv of result.state.invoices) {
      expect(inv.status).toBe('draft');
      // Der Kern der Umstellung: Ein Entwurf verbrennt keine Nummer mehr.
      // Früher stand hier „2026-005" — und das zweite Gerät hätte dieselbe
      // vergeben.
      expect(inv.number).toBe('');
    }
  });

  it('rührt den lokalen Zähler nicht an', () => {
    const now = Date.UTC(2026, 5, 15);
    const vorher = state(now);
    const result = evaluateRecurringInvoices(now, vorher);

    expect(result.state.nextInvoiceCounter).toBe(vorher.nextInvoiceCounter);
  });

  it('lässt den Zustand unangetastet, wenn nichts fällig ist', () => {
    const now = Date.UTC(2026, 5, 15);
    const s = state(now);
    s.recurringInvoices[0].nextDueAt = now + 30 * TAG;

    const result = evaluateRecurringInvoices(now, s);
    expect(result.generatedCount).toBe(0);
    expect(result.state).toBe(s);
  });

  it('überspringt abgeschaltete Definitionen', () => {
    const now = Date.UTC(2026, 5, 15);
    const s = state(now);
    s.recurringInvoices[0].active = false;

    expect(evaluateRecurringInvoices(now, s).generatedCount).toBe(0);
  });
});
