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
  yearToDateRevenue: number;       // Gesamtumsatz bisher (abgerechnet + getrackt)
  invoicedRevenue: number;         // Nur abgerechneter Umsatz
  trackedRevenue: number;          // Nur getrackte, nicht abgerechnete Stunden
  yearToDateWorkDays: number;      // Tatsächliche Arbeitstage bisher
  calendarDaysPassed: number;      // Kalendertage bisher
  workDayRatio: number;            // Verhältnis Arbeitstage/Kalendertage (z.B. 0.69)
  daysInYear: number;
  daysRemaining: number;
  estimatedRemainingWorkDays: number; // Geschätzte verbleibende Arbeitstage
  averageDailyRevenue: number;     // Ø pro ARBEITSTAG (nicht Kalendertag)
  forecastEnd: number;             // Hochrechnung Jahresende
  forecastRemaining: number;       // Was noch dazukommt
}

export function forecastYear(state: AppState): YearForecast {
  const now = new Date();
  const nowTs = now.getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const yearEnd   = new Date(now.getFullYear() + 1, 0, 1).getTime();
  const daysInYear = Math.round((yearEnd - yearStart) / 86_400_000);
  const calendarDaysPassed = Math.max(1, Math.round((nowTs - yearStart) / 86_400_000));
  const daysRemaining = daysInYear - calendarDaysPassed;

  // --- Abgerechneter Umsatz (Rechnungen) ---
  const ytdInvoices = state.invoices.filter(i =>
    i.status !== 'cancelled' && !i.cancelsInvoiceId && i.createdAt >= yearStart && i.createdAt <= nowTs
  );
  const invoicedRevenue = ytdInvoices.reduce((s, i) => s + i.total, 0);

  // IDs aller bereits abgerechneten Einträge sammeln
  const invoicedEntryIds = new Set<number>();
  ytdInvoices.forEach(inv => inv.entryIds.forEach(id => invoicedEntryIds.add(id)));

  // --- Getrackte, noch nicht abgerechnete Stunden ---
  const ytdEntries = state.entries.filter(e => e.startedAt >= yearStart && e.startedAt <= nowTs);
  const unbilledEntries = ytdEntries.filter(e => !invoicedEntryIds.has(e.id));
  const trackedRevenue = unbilledEntries.reduce((s, e) => {
    return s + (e.durationSeconds / 3600) * resolveRate(e, state.customers, state.projects);
  }, 0);

  // --- Gesamtumsatz: abgerechnet + getrackt ---
  const yearToDateRevenue = invoicedRevenue + trackedRevenue;

  // --- Tatsächliche Arbeitstage (Tage mit ≥1 Eintrag) ---
  const workDays = new Set(
    ytdEntries.map(e => {
      const d = new Date(e.startedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })
  );
  const yearToDateWorkDays = workDays.size;

  // --- Intelligente Hochrechnung basierend auf echtem Arbeitsverhalten ---
  // Ratio: Wie viele der vergangenen Kalendertage waren Arbeitstage?
  // z.B. 90 Arbeitstage / 130 Kalendertage = 0.69
  const workDayRatio = calendarDaysPassed > 0 ? yearToDateWorkDays / calendarDaysPassed : 0;

  // Geschätzte verbleibende Arbeitstage basierend auf dem bisherigen Muster
  const estimatedRemainingWorkDays = Math.round(daysRemaining * workDayRatio);

  // Ø Umsatz pro ARBEITSTAG (nicht Kalendertag!)
  const averageDailyRevenue = yearToDateWorkDays > 0 ? yearToDateRevenue / yearToDateWorkDays : 0;

  // Prognose: Bisheriger Umsatz + (Ø pro Arbeitstag × geschätzte Restarbeitstage)
  const forecastRemaining = averageDailyRevenue * estimatedRemainingWorkDays;
  const forecastEnd = yearToDateRevenue + forecastRemaining;

  return {
    yearToDateRevenue,
    invoicedRevenue,
    trackedRevenue,
    yearToDateWorkDays,
    calendarDaysPassed,
    workDayRatio,
    daysInYear,
    daysRemaining,
    estimatedRemainingWorkDays,
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
