import { AppState, VendorInvoice, VendorInvoiceCategory } from '../types';
import { forecastYear } from './analytics';
import { ustAnteil } from './payments';

// === Typen ====================================================
export type Granularity = 'day' | 'month' | 'quarter';
export type AccountingMode = 'cash' | 'accrual';

export interface DateRange {
  from: number;       // inklusive
  to: number;         // exklusiv
}

export interface PeriodBucket {
  key: string;
  label: string;
  from: number;       // inklusive
  to: number;         // exklusiv
}

export interface PnLEntry {
  bucket: PeriodBucket;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface VatQuarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  collected: number;
  deductible: number;
  payable: number;
  vendorInvoicesWithoutVat: number;
}

export interface CategoryExpense {
  category: VendorInvoiceCategory;
  total: number;
  share: number;        // 0..1
  count: number;
}

export interface FinanceForecast {
  revenueYtd: number;
  expensesYtd: number;
  profitYtd: number;
  revenueForecast: number;
  expensesForecast: number;
  profitForecast: number;
  daysRemaining: number;
}

// === Helpers ==================================================
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function startOfQuarter(d: Date) {
  const x = startOfMonth(d);
  const q = Math.floor(x.getMonth() / 3) * 3;
  x.setMonth(q);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

// === Range-Default ==============================================
export function rangeForYear(year: number): DateRange {
  const from = new Date(year, 0, 1).getTime();
  const to   = new Date(year + 1, 0, 1).getTime();
  return { from, to };
}

export function rangeForQuarter(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1).getTime();
  const to   = new Date(year, startMonth + 3, 1).getTime();
  return { from, to };
}

// === Granularitäts-Auswahl =====================================
function autoGranularity(range: DateRange): Granularity {
  const days = (range.to - range.from) / 86_400_000;
  if (days <= 90) return 'day';
  if (days <= 18 * 31) return 'month';   // ≈ 18 Monate
  return 'quarter';
}

// === Bucket-Generator ==========================================
export function buildBuckets(range: DateRange, granularity?: Granularity): PeriodBucket[] {
  // Swap falls from > to (defensive)
  const r: DateRange = range.from > range.to ? { from: range.to, to: range.from } : range;
  const g = granularity ?? autoGranularity(r);

  const buckets: PeriodBucket[] = [];

  if (g === 'day') {
    let cur = startOfDay(new Date(r.from));
    const end = new Date(r.to);
    while (cur.getTime() < end.getTime()) {
      const next = addDays(cur, 1);
      buckets.push({
        key: `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`,
        label: `${pad2(cur.getDate())}.${pad2(cur.getMonth() + 1)}.`,
        from: cur.getTime(),
        to: next.getTime(),
      });
      cur = next;
    }
    return buckets;
  }

  if (g === 'month') {
    let cur = startOfMonth(new Date(r.from));
    const end = new Date(r.to);
    while (cur.getTime() < end.getTime()) {
      const next = addMonths(cur, 1);
      buckets.push({
        key: `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`,
        label: `${MONTHS_SHORT[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
        from: cur.getTime(),
        to: next.getTime(),
      });
      cur = next;
    }
    return buckets;
  }

  // quarter
  let cur = startOfQuarter(new Date(r.from));
  const end = new Date(r.to);
  while (cur.getTime() < end.getTime()) {
    const next = addMonths(cur, 3);
    const q = Math.floor(cur.getMonth() / 3) + 1;
    buckets.push({
      key: `${cur.getFullYear()}-Q${q}`,
      label: `Q${q} ${cur.getFullYear()}`,
      from: cur.getTime(),
      to: next.getTime(),
    });
    cur = next;
  }
  return buckets;
}

// === Pure-Function-Filter (gespiegelt zu analytics.ts) =========
function isRevenueInvoice(inv: { status: string; cancelsInvoiceId?: string }) {
  return inv.status !== 'cancelled' && inv.status !== 'draft' && !inv.cancelsInvoiceId;
}

// === G/V pro Periode ===========================================
export function computePnL(
  state: AppState,
  range: DateRange,
  mode: AccountingMode,
  granularity?: Granularity,
): PnLEntry[] {
  const buckets = buildBuckets(range, granularity);
  if (buckets.length === 0) return [];

  const entries: PnLEntry[] = buckets.map((b) => ({
    bucket: b,
    revenue: 0,
    expenses: 0,
    profit: 0,
  }));

  const findBucket = (ts: number) => entries.find((e) => ts >= e.bucket.from && ts < e.bucket.to);

  for (const inv of state.invoices) {
    if (!isRevenueInvoice(inv)) continue;
    if (mode !== 'cash') {
      // Soll-Versteuerung: der Umsatz zählt, wenn die Rechnung geschrieben wird.
      const slot = findBucket(inv.createdAt);
      if (slot) slot.revenue += inv.total;
      continue;
    }
    // Ist-Versteuerung: jede Zahlung zählt mit **ihrem eigenen** Datum. Vorher
    // fiel eine Rechnung ganz in den Monat der letzten Zahlung — eine Anzahlung
    // im März und der Rest im Juni landeten beide im Juni.
    for (const p of inv.payments ?? []) {
      const slot = findBucket(p.paidAt);
      if (slot) slot.revenue += p.amount;
    }
  }

  for (const v of state.vendorInvoices) {
    const slot = findBucket(v.invoiceDate);
    if (slot) slot.expenses += v.amountGross;
  }

  for (const e of entries) e.profit = e.revenue - e.expenses;
  return entries;
}

// === Aggregat-Summen über die Range ============================
export interface PnLTotals {
  revenue: number;
  expenses: number;
  profit: number;
}

export function totalsFromPnL(entries: PnLEntry[]): PnLTotals {
  const t: PnLTotals = { revenue: 0, expenses: 0, profit: 0 };
  for (const e of entries) {
    t.revenue  += e.revenue;
    t.expenses += e.expenses;
    t.profit   += e.profit;
  }
  return t;
}

// === Vorsteuer-Quartalsübersicht ===============================
/**
 * Die Umsatzsteuer je Quartal.
 *
 * `mode` entscheidet, **wann** die Steuer entsteht: Bei Soll-Versteuerung mit
 * der Rechnung, bei Ist-Versteuerung mit dem Geldeingang. Seit es
 * Zahlungseingänge gibt, lässt sich der Ist-Fall auch bei Teilzahlungen richtig
 * rechnen — anteilig, mit dem Datum der jeweiligen Zahlung. Vorher gab es dafür
 * schlicht keine Daten.
 *
 * Die Vorsteuer bleibt am Belegdatum: Für sie führt Kavoma Time keine
 * Zahlungsdaten, und ein erfundenes Zahldatum wäre schlechter als das
 * Belegdatum, das wenigstens stimmt.
 */
export function computeVatBreakdown(
  state: AppState,
  year: number,
  mode: AccountingMode = 'accrual',
): VatQuarter[] {
  const result: VatQuarter[] = ([1, 2, 3, 4] as const).map((q) => ({
    year,
    quarter: q,
    collected: 0,
    deductible: 0,
    payable: 0,
    vendorInvoicesWithoutVat: 0,
  }));

  const quarterForTs = (ts: number): 1 | 2 | 3 | 4 | null => {
    const d = new Date(ts);
    if (d.getFullYear() !== year) return null;
    return (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  };

  for (const inv of state.invoices) {
    if (!isRevenueInvoice(inv)) continue;
    if (mode === 'cash') {
      for (const p of inv.payments ?? []) {
        const q = quarterForTs(p.paidAt);
        if (q) result[q - 1].collected += ustAnteil(inv, p);
      }
      continue;
    }
    const q = quarterForTs(inv.createdAt);
    if (!q) continue;
    result[q - 1].collected += inv.vatAmount;
  }

  for (const v of state.vendorInvoices) {
    const q = quarterForTs(v.invoiceDate);
    if (!q) continue;
    if (typeof v.vatAmount === 'number' && Number.isFinite(v.vatAmount)) {
      result[q - 1].deductible += v.vatAmount;
    } else {
      result[q - 1].vendorInvoicesWithoutVat += 1;
    }
  }

  for (const r of result) r.payable = r.collected - r.deductible;
  return result;
}

// === Ausgaben nach Kategorie ===================================
export function computeExpenseCategories(state: AppState, range: DateRange): CategoryExpense[] {
  const map = new Map<VendorInvoiceCategory, { total: number; count: number }>();
  let grand = 0;

  for (const v of state.vendorInvoices) {
    if (v.invoiceDate < range.from || v.invoiceDate >= range.to) continue;
    const slot = map.get(v.category) ?? { total: 0, count: 0 };
    slot.total += v.amountGross;
    slot.count += 1;
    grand += v.amountGross;
    map.set(v.category, slot);
  }

  return Array.from(map.entries())
    .map(([category, agg]) => ({
      category,
      total: agg.total,
      count: agg.count,
      share: grand > 0 ? agg.total / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// === Jahres-Forecast inkl. Ausgaben ============================
export function computeFinanceForecast(state: AppState): FinanceForecast {
  // Einnahmen-Forecast aus dem bestehenden, einnahmenseitigen Forecaster
  const fc = forecastYear(state);

  const now = Date.now();
  const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
  const yearEnd   = new Date(new Date(now).getFullYear() + 1, 0, 1).getTime();

  // Ausgaben YTD
  let expensesYtd = 0;
  for (const v of state.vendorInvoices) {
    if (v.invoiceDate >= yearStart && v.invoiceDate < yearEnd && v.invoiceDate <= now) {
      expensesYtd += v.amountGross;
    }
  }

  // Spiegelbild-Logik: Ø pro Kalendertag × verbleibende Tage
  // (Ausgaben fallen nicht nur an Arbeitstagen an — Kalendertag-Mittel ist hier ehrlicher)
  const dayMs = 86_400_000;
  // Inklusive Tageszählung: der laufende Tag zählt vom ersten Moment an mit,
  // sonst wäre der Ø-Satz morgens künstlich zu hoch (Math.round hätte den
  // laufenden Tag erst ab Mittag mitgezählt).
  const calendarDaysPassed = Math.max(1, Math.floor((now - yearStart) / dayMs) + 1);
  const dailyExpenseRate = expensesYtd / calendarDaysPassed;
  const expensesForecast = expensesYtd + dailyExpenseRate * fc.daysRemaining;

  return {
    revenueYtd: fc.invoicedRevenue,
    expensesYtd,
    profitYtd: fc.invoicedRevenue - expensesYtd,
    revenueForecast: fc.forecastEnd,
    expensesForecast,
    profitForecast: fc.forecastEnd - expensesForecast,
    daysRemaining: fc.daysRemaining,
  };
}

// === CSV-Export Vorsteuer ======================================
function csvEscape(value: string) {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCurrencyDe(value: number) {
  return value.toFixed(2).replace('.', ',');
}

export function exportVatCsv(quarters: VatQuarter[]): string {
  if (quarters.length === 0) return '';
  const year = quarters[0].year;
  const header = ['Jahr', 'Quartal', 'USt vereinnahmt (EUR)', 'Vorsteuer abziehbar (EUR)', 'Zahllast (EUR)', 'Belege ohne USt'];
  const rows: string[][] = [header];

  let sumCollected = 0;
  let sumDeductible = 0;
  let sumPayable = 0;
  let sumMissing = 0;

  for (const q of quarters) {
    rows.push([
      String(q.year),
      `Q${q.quarter}`,
      formatCurrencyDe(q.collected),
      formatCurrencyDe(q.deductible),
      formatCurrencyDe(q.payable),
      String(q.vendorInvoicesWithoutVat),
    ]);
    sumCollected  += q.collected;
    sumDeductible += q.deductible;
    sumPayable    += q.payable;
    sumMissing    += q.vendorInvoicesWithoutVat;
  }

  rows.push([
    String(year),
    'Jahressumme',
    formatCurrencyDe(sumCollected),
    formatCurrencyDe(sumDeductible),
    formatCurrencyDe(sumPayable),
    String(sumMissing),
  ]);

  return rows.map((r) => r.map(csvEscape).join(';')).join('\n');
}

// === Trigger Download (Renderer-only, kein IPC nötig) ==========
export function downloadVatCsv(quarters: VatQuarter[]) {
  const csv = exportVatCsv(quarters);
  if (!csv) return;
  const year = quarters[0].year;
  // BOM für Excel-DE damit Umlaute korrekt erscheinen
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vorsteuer-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// === Formatierungs-Helper (Renderer-shared) ====================
// Echtes Minuszeichen U+2212 statt ASCII-Bindestrich,
// damit negative G/V optisch sauber bleiben.
export function formatEuro(value: number, fractionDigits = 0): string {
  const abs = Math.abs(value).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return value < 0 ? `−${abs}` : abs;
}

// === Vendor-Helpers (re-export für Komponenten) ================
export const VENDOR_CATEGORY_LABELS: Record<VendorInvoiceCategory, string> = {
  hardware: 'Hardware',
  software: 'Software',
  office:   'Büro',
  travel:   'Reise',
  service:  'Dienstleistung',
  other:    'Sonstiges',
};

export type { VendorInvoice };
