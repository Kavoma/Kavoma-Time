// Was ein Kunde (oder ein Projekt) noch zahlen muss.
//
// Zwei Töpfe, bewusst getrennt ausgewiesen:
//   1. Geleistete, abrechenbare Zeit, für die es noch keine Rechnung gibt —
//      bewertet mit dem Stundensatz (Projekt vor Kunde).
//   2. Gestellte Rechnungen, die noch nicht (ganz) bezahlt sind.
//
// Der erste Topf ist eine Schätzung, der zweite eine Forderung. Wer beides in
// eine Zahl wirft, sieht nicht mehr, wofür er eine Rechnung schreiben muss
// und wofür er eine Mahnung schreiben müsste.

import type { AppState, Customer, Invoice, Project, TimeEntry } from '../types';
import { istAbrechenbar } from './billable';
import { offen } from './payments';
import { effectiveVatRate, grossOf, netOf, pricesIncludeVat } from './pricing';

export interface OutstandingAmounts {
  /** Abrechenbare Sekunden ohne aktive Rechnung. */
  unbilledSeconds: number;
  /** Davon ohne hinterlegten Stundensatz — die fehlen im Betrag. */
  unbilledSecondsWithoutRate: number;
  /** Wert der nicht abgerechneten Zeit (inkl. offener Pauschalen). */
  unbilledNet: number;
  unbilledGross: number;
  /** Offener Betrag aus gestellten Rechnungen (brutto, inkl. Mahngebühren). */
  openInvoicesAmount: number;
  openInvoiceCount: number;
  /** unbilledGross + openInvoicesAmount — was insgesamt noch hereinkommen sollte. */
  totalGross: number;
}

type Scope = Pick<AppState, 'entries' | 'invoices' | 'projects' | 'customers' | 'issuer'>;

const rund = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Einträge, die bereits auf einer gestellten Rechnung stehen.
 *
 * Entwürfe zählen **nicht** — ein Entwurf ist noch keine Forderung, und die
 * Zeit soll bis zum Finalisieren als „noch abzurechnen" sichtbar bleiben.
 * Stornierte Rechnungen geben ihre Einträge ebenfalls wieder frei.
 */
export function billedEntryIds(invoices: readonly Invoice[]): Set<number> {
  const ids = new Set<number>();
  for (const inv of invoices) {
    if (inv.status !== 'active') continue;
    for (const id of inv.entryIds) ids.add(id);
  }
  return ids;
}

/** Stundensatz wie bei der Rechnungserstellung: Projekt vor Kunde, 0 als echter Wert. */
export function rateFor(project: Project | undefined, customer: Customer | undefined): number {
  if (project?.hourlyRate != null && Number.isFinite(project.hourlyRate)) return project.hourlyRate;
  if (customer?.hourlyRate != null && Number.isFinite(customer.hourlyRate)) return customer.hourlyRate;
  return 0;
}

export function computeOutstanding(
  state: Scope,
  filter: { customerId: number; projectId?: number },
): OutstandingAmounts {
  const customer = state.customers.find((c) => c.id === filter.customerId);
  const vatRate = effectiveVatRate(state.issuer);
  const brutto = pricesIncludeVat(state.issuer, customer);
  const billed = billedEntryIds(state.invoices);

  const passt = (e: Pick<TimeEntry, 'customerId' | 'projectId'>) =>
    e.customerId === filter.customerId
    && (filter.projectId === undefined || e.projectId === filter.projectId);

  // --- 1. Nicht abgerechnete Zeit ------------------------------------------
  const offeneEintraege = state.entries.filter((e) =>
    passt(e) && e.endedAt !== null && e.durationSeconds > 0 && istAbrechenbar(e) && !billed.has(e.id));

  // Eingabewert: so, wie Stundensätze und Pauschalen eingetragen sind —
  // brutto oder netto, je nach Einstellung des Kunden.
  let eingabewert = 0;
  let ohneSatz = 0;
  let sekunden = 0;
  const pauschalProjekte = new Set<number>();

  for (const e of offeneEintraege) {
    sekunden += e.durationSeconds;
    const project = state.projects.find((p) => p.id === e.projectId);
    // Pauschalprojekte ohne eigenen Stundensatz werden unten über den
    // Festpreis bewertet, nicht über die Stunden.
    if (project?.fixedPrice && project.hourlyRate == null) {
      pauschalProjekte.add(project.id);
      continue;
    }
    const rate = rateFor(project, customer);
    if (rate <= 0) { ohneSatz += e.durationSeconds; continue; }
    eingabewert += (e.durationSeconds / 3600) * rate;
  }

  // Festpreis minus dem, was auf das Projekt schon abgerechnet ist.
  for (const pid of pauschalProjekte) {
    const project = state.projects.find((p) => p.id === pid);
    if (!project?.fixedPrice) continue;
    const abgerechnet = state.invoices
      .filter((i) => i.status === 'active' && i.projectId === pid)
      .reduce((s, i) => s + (brutto ? i.total : i.subtotal), 0);
    eingabewert += Math.max(0, project.fixedPrice - abgerechnet);
  }

  const unbilledNet = brutto ? netOf(eingabewert, vatRate) : rund(eingabewert);
  const unbilledGross = brutto ? rund(eingabewert) : grossOf(eingabewert, vatRate);

  // --- 2. Offene Rechnungen -------------------------------------------------
  const offeneRechnungen = state.invoices.filter((i) =>
    i.customerId === filter.customerId
    && (filter.projectId === undefined || i.projectId === filter.projectId)
    && i.status === 'active'
    && i.total > 0              // Storno-Rechnungen sind keine Forderung
    && offen(i) > 0.005);
  const openInvoicesAmount = rund(offeneRechnungen.reduce((s, i) => s + offen(i), 0));

  return {
    unbilledSeconds: sekunden,
    unbilledSecondsWithoutRate: ohneSatz,
    unbilledNet,
    unbilledGross,
    openInvoicesAmount,
    openInvoiceCount: offeneRechnungen.length,
    totalGross: rund(unbilledGross + openInvoicesAmount),
  };
}
