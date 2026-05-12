import { AppState, Customer, Project, TimeEntry, Invoice } from '../types';

// === Stundensatz-Auflösung ====================================
export function resolveRate(entry: TimeEntry, customers: Customer[], projects: Project[]): number {
  const project = projects.find(p => p.id === entry.projectId);
  if (project?.hourlyRate) return project.hourlyRate;
  const customer = customers.find(c => c.id === entry.customerId);
  return customer?.hourlyRate ?? 0;
}

// === Profitabilität pro Kunde ================================
export interface CustomerProfitability {
  customerId: number;
  totalSeconds: number;
  totalHours: number;
  trackedRevenue: number;        // (Stunden × Stundensatz) — auch wenn nicht abgerechnet
  invoicedRevenue: number;       // Summe aller aktiven Rechnungen (auch unbezahlt)
  paidRevenue: number;           // nur bezahlte Rechnungen
  openRevenue: number;           // unbezahlt-active Rechnungen
  effectiveHourlyRate: number;   // real verdienter Satz: invoicedRevenue / totalHours
}

export function profitabilityByCustomer(state: AppState): Map<number, CustomerProfitability> {
  const result = new Map<number, CustomerProfitability>();

  for (const c of state.customers) {
    result.set(c.id, {
      customerId: c.id,
      totalSeconds: 0,
      totalHours: 0,
      trackedRevenue: 0,
      invoicedRevenue: 0,
      paidRevenue: 0,
      openRevenue: 0,
      effectiveHourlyRate: 0,
    });
  }

  // Stunden + erwarteter Umsatz (basierend auf Stundensatz)
  for (const e of state.entries) {
    const slot = result.get(e.customerId);
    if (!slot) continue;
    slot.totalSeconds += e.durationSeconds;
    slot.totalHours = slot.totalSeconds / 3600;
    slot.trackedRevenue += (e.durationSeconds / 3600) * resolveRate(e, state.customers, state.projects);
  }

  // Tatsächlich abgerechneter Umsatz — stornierte Originale UND
  // Storno-Rechnungen (negativer Betrag) komplett ignorieren.
  // → Paar (Original + Storno) netto = 0, deshalb beide raus statt "+pos -neg"
  for (const inv of state.invoices) {
    if (inv.status === 'cancelled' || inv.cancelsInvoiceId) continue;
    const slot = result.get(inv.customerId);
    if (!slot) continue;
    slot.invoicedRevenue += inv.total;
    if (inv.paid) slot.paidRevenue += inv.total;
    else slot.openRevenue += inv.total;
  }

  // Effektiver Stundensatz: tatsächlich abgerechnet / geleistete Stunden
  for (const slot of result.values()) {
    slot.effectiveHourlyRate = slot.totalHours > 0 ? slot.invoicedRevenue / slot.totalHours : 0;
  }

  return result;
}

// === Profitabilität pro Projekt ==============================
export interface ProjectProfitability {
  projectId: number;
  totalSeconds: number;
  totalHours: number;
  trackedRevenue: number;          // Stunden × Rate
  budgetHours?: number;
  budgetUsagePercent?: number;     // Prozent vom Budget verbraucht
  fixedPrice?: number;             // Pauschalpreis falls gesetzt
  realHourlyRate?: number;         // fixedPrice / totalHours (echter Stundensatz bei Pauschal)
  remainingHoursAtRate?: number;   // Bei Budget: noch verbleibende Stunden
}

export function profitabilityByProject(state: AppState): Map<number, ProjectProfitability> {
  const result = new Map<number, ProjectProfitability>();

  for (const p of state.projects) {
    result.set(p.id, {
      projectId: p.id,
      totalSeconds: 0,
      totalHours: 0,
      trackedRevenue: 0,
      budgetHours: p.budgetHours,
      fixedPrice: p.fixedPrice,
    });
  }

  for (const e of state.entries) {
    const slot = result.get(e.projectId);
    if (!slot) continue;
    slot.totalSeconds += e.durationSeconds;
    slot.totalHours = slot.totalSeconds / 3600;
    slot.trackedRevenue += (e.durationSeconds / 3600) * resolveRate(e, state.customers, state.projects);
  }

  for (const slot of result.values()) {
    if (slot.budgetHours && slot.budgetHours > 0) {
      slot.budgetUsagePercent = (slot.totalHours / slot.budgetHours) * 100;
      slot.remainingHoursAtRate = Math.max(0, slot.budgetHours - slot.totalHours);
    }
    if (slot.fixedPrice && slot.fixedPrice > 0 && slot.totalHours > 0) {
      slot.realHourlyRate = slot.fixedPrice / slot.totalHours;
    }
  }

  return result;
}

// === Forecasting =============================================
export interface YearForecast {
  yearToDateRevenue: number;     // bisher in diesem Jahr abgerechnet
  yearToDateDays: number;        // Arbeitstage bisher
  daysInYear: number;
  daysRemaining: number;
  averageDailyRevenue: number;
  forecastEnd: number;           // Hochrechnung Jahresende
  forecastRemaining: number;     // Was noch dazukommt
}

export function forecastYear(state: AppState): YearForecast {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const yearEnd   = new Date(now.getFullYear() + 1, 0, 1).getTime();
  const daysInYear = Math.round((yearEnd - yearStart) / 86_400_000);
  const daysPassed = Math.round((now.getTime() - yearStart) / 86_400_000);
  const daysRemaining = daysInYear - daysPassed;

  const ytdInvoices = state.invoices.filter(i =>
    i.status !== 'cancelled' && !i.cancelsInvoiceId && i.createdAt >= yearStart
  );
  const yearToDateRevenue = ytdInvoices.reduce((s, i) => s + i.total, 0);

  // Arbeitstage = Tage mit ≥1 Eintrag
  const workDays = new Set(
    state.entries
      .filter(e => e.startedAt >= yearStart)
      .map(e => new Date(e.startedAt).toISOString().slice(0, 10))
  );
  const yearToDateDays = workDays.size;

  const averageDailyRevenue = daysPassed > 0 ? yearToDateRevenue / daysPassed : 0;
  const forecastRemaining = averageDailyRevenue * daysRemaining;
  const forecastEnd = yearToDateRevenue + forecastRemaining;

  return {
    yearToDateRevenue,
    yearToDateDays,
    daysInYear,
    daysRemaining,
    averageDailyRevenue,
    forecastEnd,
    forecastRemaining,
  };
}

// === Storno-Helpers ==========================================
export function createCancellationInvoice(original: Invoice, reason: string, newNumber: string): Invoice {
  const negSubtotal  = -original.subtotal;
  const negVatAmount = -original.vatAmount;
  const negTotal     = -original.total;
  return {
    id: String(Date.now()),
    number: newNumber,
    customerId: original.customerId,
    projectId: original.projectId,
    mode: original.mode,
    periodFrom: original.periodFrom,
    periodTo: original.periodTo,
    createdAt: Date.now(),
    dueDate: Date.now(),
    items: original.items.map(it => ({ ...it, quantity: -it.quantity, total: -it.total })),
    entryIds: [],
    subtotal: negSubtotal,
    vatRate: original.vatRate,
    vatAmount: negVatAmount,
    total: negTotal,
    notes: `Storno zu Rechnung ${original.number}.${reason ? ` Grund: ${reason}` : ''}`,
    paid: false,
    status: 'active',
    cancelsInvoiceId: original.id,
    reminders: [],
  };
}
