import { describe, expect, it } from 'vitest';
import type { Customer, Invoice, Issuer, Project, TimeEntry } from '../types';
import { computeOutstanding } from './outstanding';

const issuer = { smallBusiness: false, vatRate: 19 } as Issuer;
const kunde: Customer = { id: 1, name: 'Kunde', color: '#000', hourlyRate: 50 };
const projekt: Project = { id: 10, customerId: 1, name: 'Web' };

const eintrag = (id: number, stunden: number, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id, customerId: 1, projectId: 10, description: '', startedAt: 0, endedAt: 1,
  durationSeconds: stunden * 3600, ...extra,
});

const rechnung = (extra: Partial<Invoice>): Invoice => ({
  id: 'r1', number: '2026-001', customerId: 1, projectId: 10, mode: 'hourly',
  periodFrom: 0, periodTo: 0, createdAt: 0, dueDate: 0, items: [], entryIds: [],
  subtotal: 100, vatRate: 19, vatAmount: 19, total: 119, notes: '', paid: false,
  payments: [], status: 'active', reminders: [], ...extra,
});

describe('computeOutstanding', () => {
  it('bewertet offene Stunden netto und rechnet die USt drauf', () => {
    const r = computeOutstanding(
      { entries: [eintrag(1, 10)], invoices: [], projects: [projekt], customers: [kunde], issuer },
      { customerId: 1 },
    );
    expect(r.unbilledNet).toBe(500);
    expect(r.unbilledGross).toBe(595);
  });

  it('bei Bruttopreisen bleibt der Betrag glatt', () => {
    const r = computeOutstanding(
      { entries: [eintrag(1, 10)], invoices: [], projects: [projekt], customers: [{ ...kunde, pricesIncludeVat: true }], issuer },
      { customerId: 1 },
    );
    expect(r.unbilledGross).toBe(500);
    expect(r.unbilledNet).toBe(420.17);
  });

  it('abgerechnete, interne und Entwurfs-Zeiten richtig zuordnen', () => {
    const r = computeOutstanding({
      entries: [eintrag(1, 2), eintrag(2, 3), eintrag(3, 4, { billable: false })],
      invoices: [rechnung({ entryIds: [1] }), rechnung({ id: 'd', status: 'draft', entryIds: [2] })],
      projects: [projekt], customers: [kunde], issuer,
    }, { customerId: 1 });
    // Eintrag 1 ist abgerechnet, 2 steht nur in einem Entwurf, 3 ist intern
    expect(r.unbilledSeconds).toBe(3 * 3600);
    expect(r.openInvoiceCount).toBe(1);
    expect(r.openInvoicesAmount).toBe(119);
    expect(r.totalGross).toBe(119 + 178.5);
  });

  it('Teilzahlungen mindern den offenen Betrag, Stornos zählen nicht', () => {
    const r = computeOutstanding({
      entries: [],
      invoices: [
        rechnung({ payments: [{ id: 'p', amount: 19, paidAt: 0, source: 'manual', createdAt: 0 }] }),
        rechnung({ id: 's', total: -119, subtotal: -100, vatAmount: -19 }),
      ],
      projects: [projekt], customers: [kunde], issuer,
    }, { customerId: 1 });
    expect(r.openInvoicesAmount).toBe(100);
    expect(r.openInvoiceCount).toBe(1);
  });
});
