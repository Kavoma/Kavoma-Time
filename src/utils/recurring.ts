// Phase 1.5 — Pure Functions für wiederkehrende Rechnungen.
//
// Architektur-Entscheidung: Kein Cron / kein OS-Scheduler. Die App läuft
// nicht permanent (Desktop-App), und Drafts müssen ohnehin manuell
// finalisiert werden. Stattdessen ruft `AppStateProvider` beim Mount
// einmal `evaluateRecurringInvoices(now, state)` auf, das fällige
// Definitionen als Draft-Invoices materialisiert und nextDueAt
// weiterschiebt.

import type {
  AppState,
  RecurringInvoice,
  RecurringCadence,
  InvoiceTemplate,
  Customer,
  Invoice,
} from '../types';
import { computeTotals } from './templates';

const MAX_SAFE_DAY = 28;

/**
 * Berechnet den nächsten Fälligkeitszeitpunkt nach einem gegebenen Datum.
 * `dayOfPeriod` wird auf 1..28 geclamped, damit Februar-Konflikte
 * vermieden werden. Der zurückgegebene Timestamp liegt immer auf 12:00
 * Mittagszeit, um Zeitzonen-Drift zwischen Sommer-/Winterzeit zu
 * vermeiden.
 */
export function computeNextDueDate(
  cadence: RecurringCadence,
  dayOfPeriod: number,
  from: number,
): number {
  const day = Math.min(MAX_SAFE_DAY, Math.max(1, Math.floor(dayOfPeriod)));
  const base = new Date(from);
  const result = new Date(base.getFullYear(), base.getMonth(), day, 12, 0, 0, 0);

  if (cadence === 'monthly') {
    result.setMonth(result.getMonth() + 1);
  } else if (cadence === 'quarterly') {
    result.setMonth(result.getMonth() + 3);
  } else {
    result.setFullYear(result.getFullYear() + 1);
  }
  return result.getTime();
}

/**
 * Erzeugt einen Draft aus einer Recurring-Definition. Die Recurring trägt
 * keine eigenen Items; sie zeigt auf ein Template, das die Positionen
 * vorgibt.
 */
export function generateDraftFromRecurring(params: {
  recurring: RecurringInvoice;
  template: InvoiceTemplate;
  customer: Customer;
  nextCounter: number;
  invoicePrefix: string;
  vatRate: number;
  now: number;
}): Invoice {
  const { recurring, template, customer, nextCounter, invoicePrefix, vatRate, now } = params;

  const year = new Date(now).getFullYear();
  const prefix = (invoicePrefix || 'YYYY-').replace('YYYY', String(year));
  const number = `${prefix}${String(nextCounter).padStart(3, '0')}`;

  const items = template.items.map((it) => ({ ...it }));
  const { subtotal, vatAmount, total } = computeTotals(items, vatRate);

  const dueAt = now + template.dueDays * 86_400_000;

  return {
    id: `${now}-${recurring.id}`,
    number,
    customerId: customer.id,
    projectId: template.projectId ?? null,
    mode: 'mixed', // Drafts mit freien Items → mixed; wird beim Finalisieren neu abgeleitet
    periodFrom: now,
    periodTo: now,
    createdAt: now,
    dueDate: dueAt,
    items,
    entryIds: [],
    subtotal,
    vatRate,
    vatAmount,
    total,
    notes: template.notes
      ? `${template.notes}\n\n(Automatisch erstellt aus Vorlage „${template.name}".)`
      : `Automatisch erstellt aus Vorlage „${template.name}".`,
    paid: false,
    status: 'draft',
    reminders: [],
    recurringId: recurring.id,
  };
}

export interface RecurringEvaluationResult {
  state: AppState;
  generatedCount: number;
}

/**
 * Iteriert alle aktiven Recurrings und legt für jede fällige Definition
 * einen Draft an. Mehrere überfällige Perioden werden in einem Durchlauf
 * aufgeholt (z. B. wenn die App 3 Monate lang nicht gestartet wurde
 * → 3 Drafts mit fortlaufenden Nummern). Eine harte Obergrenze von
 * 12 Iterationen pro Recurring schützt vor Endlosschleifen bei
 * korrupten nextDueAt-Werten.
 */
export function evaluateRecurringInvoices(now: number, state: AppState): RecurringEvaluationResult {
  const recurrings = state.recurringInvoices ?? [];
  if (recurrings.length === 0) {
    return { state, generatedCount: 0 };
  }

  const issuer = state.issuer;
  const vatRate = issuer?.smallBusiness ? 0 : issuer?.vatRate ?? 0;

  let nextCounter = state.nextInvoiceCounter;
  const newInvoices: Invoice[] = [];
  const updatedRecurrings: RecurringInvoice[] = recurrings.map((r) => ({ ...r }));

  for (let idx = 0; idx < updatedRecurrings.length; idx++) {
    const r = updatedRecurrings[idx];
    if (!r.active) continue;

    const template = state.invoiceTemplates.find((t) => t.id === r.templateId);
    if (!template) continue;

    const customer = state.customers.find((c) => c.id === r.customerId);
    if (!customer) continue;

    let dueAt = r.nextDueAt;
    let iterations = 0;
    while (dueAt <= now && iterations < 12) {
      iterations++;
      const draft = generateDraftFromRecurring({
        recurring: r,
        template,
        customer,
        nextCounter,
        invoicePrefix: state.invoicePrefix ?? 'YYYY-',
        vatRate,
        now: dueAt,
      });
      newInvoices.push(draft);
      nextCounter++;
      r.lastGeneratedAt = dueAt;
      dueAt = computeNextDueDate(r.cadence, r.dayOfPeriod, dueAt);
    }
    r.nextDueAt = dueAt;
    updatedRecurrings[idx] = r;
  }

  if (newInvoices.length === 0) {
    return { state, generatedCount: 0 };
  }

  return {
    state: {
      ...state,
      invoices: [...newInvoices, ...state.invoices],
      nextInvoiceCounter: nextCounter,
      recurringInvoices: updatedRecurrings,
    },
    generatedCount: newInvoices.length,
  };
}
