import { useState, useMemo } from 'react';
import { BarChart3, Target, Clock, Activity, Euro, TrendingUp, Calendar } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';
import { useAppState } from '../state/AppStateContext';
import { useChartColors } from '../utils/chartColors';
import { TimeEntry } from '../types';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { profitabilityByCustomer, profitabilityByProject, forecastYear, resolveRate } from '../utils/analytics';

type Period = 'week' | 'month' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week:  'Woche',
  month: 'Monat',
  year:  'Jahr',
};

// === Helpers =====================================================
function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d = new Date()): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfYear(d = new Date()): Date {
  const x = new Date(d);
  x.setMonth(0, 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function periodStart(p: Period): number {
  if (p === 'week')  return startOfWeek().getTime();
  if (p === 'month') return startOfMonth().getTime();
  return startOfYear().getTime();
}
function formatHM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// === Card Wrapper ================================================
function Card({ icon: Icon, label, value, rawValue, format = 'number', sub, diff }: { icon: any; label: string; value?: string; rawValue?: number; format?: 'currency' | 'number' | 'time'; sub?: string; diff?: number | null }) {
  return (
    <div className="kv-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="kv-label">{label}</span>
        <div className="flex items-center gap-2">
          {diff !== undefined && diff !== null && (
            <span className={`text-[10px] font-bold tabular-nums ${diff >= 0 ? 'text-success' : 'text-danger'}`}>
              {diff >= 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(0)}%
            </span>
          )}
          <Icon size={14} className="text-muted" />
        </div>
      </div>
      <div className="font-display text-3xl font-bold tabular-nums leading-none text-ink">
        {rawValue !== undefined ? <AnimatedNumber value={rawValue} format={format} /> : value}
      </div>
      {sub && <div className="mt-2 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

// === Tooltip ====================================================
/** Kunden ohne eigene Farbe bekommen den neutralen Diagrammton — der
 *  folgt dem Thema, ein festes Dunkelgrau taete das nicht. */
const FALLBACK_SERIES = 'var(--kv-chart-6)';

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  
  return (
    <div className="kv-overlay px-3 py-2 text-xs">
      <div className="mb-1 font-bold text-ink">{label}</div>
      <div className="tabular-nums text-muted">
        Stunden: <span className="text-ink">{data.hours.toFixed(1)} h</span>
      </div>
      {data.revenue > 0 && (
        <div className="tabular-nums text-muted">
          Umsatz: <span className="text-accent">{formatEuro(data.revenue)}</span>
        </div>
      )}
    </div>
  );
}

// === Main ========================================================
export function StatisticsView() {
  const { state } = useAppState();
  const chart = useChartColors();
  const [period, setPeriod] = useState<Period>('month');

  // Sichere Zugriffe (state kann null sein während Loading)
  const entries   = state?.entries   ?? [];
  const customers = state?.customers ?? [];
  const projects  = state?.projects  ?? [];
  const weeklyTargetHours = state?.weeklyTargetHours ?? 40;

  const start = periodStart(period);
  const entriesInPeriod = entries.filter((e: TimeEntry) => e.startedAt >= start);
  
  // === Vergleichszeitraum berechnen ===
  const prevStart = useMemo(() => {
    const d = new Date(start);
    if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  }, [start, period]);
  
  const entriesInPrevPeriod = entries.filter((e: TimeEntry) => e.startedAt >= prevStart && e.startedAt < start);
  const prevTotalSeconds = entriesInPrevPeriod.reduce((sum: number, e: TimeEntry) => sum + e.durationSeconds, 0);
  
  const totalSeconds  = entriesInPeriod.reduce((sum: number, e: TimeEntry) => sum + e.durationSeconds, 0);
  const diffPercent = prevTotalSeconds > 0 ? ((totalSeconds - prevTotalSeconds) / prevTotalSeconds) * 100 : null;

  // Umsatz (geschätzt) — Projekt-Rate > Kunden-Rate
  const revenue = entriesInPeriod.reduce((sum: number, e: TimeEntry) => {
    return sum + (e.durationSeconds / 3600) * resolveRate(e, customers, projects);
  }, 0);

  const prevRevenue = entriesInPrevPeriod.reduce((sum: number, e: TimeEntry) => {
    return sum + (e.durationSeconds / 3600) * resolveRate(e, customers, projects);
  }, 0);

  const revenueDiffPercent = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  const sessionsCount = entriesInPeriod.length;
  const avgSession    = sessionsCount > 0 ? totalSeconds / sessionsCount : 0;

  // Anzahl tatsächlicher Arbeitstage (Tage mit ≥1 Eintrag)
  const workDays = new Set(entriesInPeriod.map((e: TimeEntry) => ymd(new Date(e.startedAt)))).size;
  const avgPerWorkDay = workDays > 0 ? totalSeconds / workDays : 0;

  // === Vorperioden-Aggregate für weitere Vergleiche ===
  const prevSessionsCount = entriesInPrevPeriod.length;
  const prevAvgSession    = prevSessionsCount > 0 ? prevTotalSeconds / prevSessionsCount : 0;
  const prevWorkDays      = new Set(entriesInPrevPeriod.map((e: TimeEntry) => ymd(new Date(e.startedAt)))).size;
  const prevAvgPerWorkDay = prevWorkDays > 0 ? prevTotalSeconds / prevWorkDays : 0;

  const diffP = (curr: number, prev: number): number | null =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null;

  const sessionsDiff      = diffP(sessionsCount, prevSessionsCount);
  const avgSessionDiff    = diffP(avgSession,    prevAvgSession);
  const workDaysDiff      = diffP(workDays,      prevWorkDays);
  const avgPerWorkDayDiff = diffP(avgPerWorkDay, prevAvgPerWorkDay);

  // Per-Kunde Vorperioden-Sekunden für Top-Customer Vergleich
  const prevCustomerSeconds = useMemo(() => {
    const m = new Map<number, number>();
    entriesInPrevPeriod.forEach((e: TimeEntry) => {
      m.set(e.customerId, (m.get(e.customerId) || 0) + e.durationSeconds);
    });
    return m;
  }, [entriesInPrevPeriod]);

  // Wochenziel-Fortschritt (immer aktuelle Woche)
  const weekStart = startOfWeek().getTime();
  const weekSeconds = entries
    .filter((e: TimeEntry) => e.startedAt >= weekStart)
    .reduce((s: number, e: TimeEntry) => s + e.durationSeconds, 0);
  const weekHours    = weekSeconds / 3600;
  const target       = weeklyTargetHours;
  const weekProgress = Math.min(100, (weekHours / target) * 100);

  // === Daily Bar-Chart (Tage in der Periode) ====================
  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; hours: number; revenue: number; ts: number }>();
    const now = new Date();
    const cursor = new Date(start);

    while (cursor.getTime() <= now.getTime()) {
      const key = ymd(cursor);
      map.set(key, { date: key, hours: 0, revenue: 0, ts: cursor.getTime() });
      cursor.setDate(cursor.getDate() + 1);
    }
    entriesInPeriod.forEach((e: TimeEntry) => {
      const key = ymd(new Date(e.startedAt));
      const item = map.get(key);
      if (item) {
        const h = e.durationSeconds / 3600;
        item.hours += h;
        item.revenue += h * resolveRate(e, customers, projects);
      }
    });

    const labelOf = (d: Date) =>
      period === 'year'
        ? d.toLocaleDateString('de-DE', { month: 'short', day: '2-digit' })
        : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' });

    return Array.from(map.values()).map(d => ({ ...d, label: labelOf(new Date(d.ts)) }));
  }, [entriesInPeriod, start, period, customers, projects]);

  // === Donut: Stunden pro Kunde =================================
  const customerData = useMemo(() => {
    const acc = new Map<number, number>();
    entriesInPeriod.forEach((e: TimeEntry) => {
      acc.set(e.customerId, (acc.get(e.customerId) || 0) + e.durationSeconds);
    });
    return Array.from(acc.entries())
      .map(([customerId, seconds]) => {
        const c = customers.find((cc: any) => cc.id === customerId);
        return {
          name: c?.name ?? 'Unbekannt',
          hours: seconds / 3600,
          color: c?.color ?? FALLBACK_SERIES,
          revenue: entriesInPeriod
            .filter((e: TimeEntry) => e.customerId === customerId)
            .reduce((s: number, e: TimeEntry) => s + (e.durationSeconds / 3600) * resolveRate(e, customers, projects), 0),
        };
      })
      .filter((c: any) => c.hours > 0)
      .sort((a: any, b: any) => b.hours - a.hours);
  }, [entriesInPeriod, customers, projects]);

  // === Top-Projekte =============================================
  const projectData = useMemo(() => {
    const acc = new Map<number, number>();
    entriesInPeriod.forEach((e: TimeEntry) => {
      acc.set(e.projectId, (acc.get(e.projectId) || 0) + e.durationSeconds);
    });
    // Vorperiode pro Projekt
    const prevAcc = new Map<number, number>();
    entriesInPrevPeriod.forEach((e: TimeEntry) => {
      prevAcc.set(e.projectId, (prevAcc.get(e.projectId) || 0) + e.durationSeconds);
    });
    return Array.from(acc.entries())
      .map(([projectId, seconds]) => {
        const p = projects.find((pp: any) => pp.id === projectId);
        const c = customers.find((cc: any) => cc.id === p?.customerId);
        const prevSeconds = prevAcc.get(projectId) || 0;
         return {
          projectId,
          name:    p?.name ?? 'Unbekannt',
          customer: c?.name ?? '—',
          color:   c?.color ?? FALLBACK_SERIES,
          seconds,
          hours:   seconds / 3600,
          revenue: entriesInPeriod
            .filter((e: TimeEntry) => e.projectId === projectId)
            .reduce((s: number, e: TimeEntry) => s + (e.durationSeconds / 3600) * resolveRate(e, customers, projects), 0),
          share:   totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0,
          diff:    diffP(seconds, prevSeconds),
        };
      })
      .sort((a: any, b: any) => b.hours - a.hours)
      .slice(0, 5);
  }, [entriesInPeriod, entriesInPrevPeriod, projects, customers, totalSeconds]);

  // === Wochentag-Verteilung =====================================
  const weekdayData = useMemo(() => {
    const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const totalSec = [0, 0, 0, 0, 0, 0, 0];
    const totalRev = [0, 0, 0, 0, 0, 0, 0];

    entriesInPeriod.forEach((e: TimeEntry) => {
      const dow = (new Date(e.startedAt).getDay() + 6) % 7;
      totalSec[dow] += e.durationSeconds;
      totalRev[dow] += (e.durationSeconds / 3600) * resolveRate(e, customers, projects);
    });

    return labels.map((label, i) => ({ 
      label, 
      hours: totalSec[i] / 3600,
      revenue: totalRev[i]
    }));
  }, [entriesInPeriod, customers, projects]);

  // === Best Day Insight ========================================
  const bestDay = weekdayData.reduce((max: any, d: any) => d.hours > max.hours ? d : max, weekdayData[0]);
  const topCustomer = customerData[0];

  // === Profitabilität + Forecast ===============================
  const profitabilityCustomers = useMemo(() => {
    if (!state) return [];
    const map = profitabilityByCustomer(state);
    return Array.from(map.values())
      .map(p => ({ ...p, customer: customers.find(c => c.id === p.customerId) }))
      .filter(p => p.totalHours > 0 || p.invoicedRevenue > 0)
      .sort((a, b) => b.invoicedRevenue - a.invoicedRevenue);
  }, [state, customers]);

  const profitabilityProjects = useMemo(() => {
    if (!state) return [];
    const map = profitabilityByProject(state);
    return Array.from(map.values())
      .map(p => {
        const project = projects.find(pp => pp.id === p.projectId);
        const customer = project ? customers.find(c => c.id === project.customerId) : undefined;
        return { ...p, project, customer };
      })
      .filter(p => p.totalHours > 0 || p.fixedPrice)
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [state, projects, customers]);

  const yearForecast = useMemo(() => state ? forecastYear(state) : null, [state]);

  if (!state) return null;

  // === Render ===================================================
  return (
    <>
      {/* Header + Period Picker */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight leading-none">Statistik</h2>
          <p className="mt-1.5 text-xs text-muted">{PERIOD_LABELS[period]} im Überblick</p>
        </div>
        <div className="flex gap-1 rounded-md border border-divider bg-surface p-1">
          {(['week', 'month', 'year'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`cursor-pointer rounded px-3 py-1.5 text-xs font-bold transition-colors ${ period === p ? 'bg-ink text-paper' : 'text-muted hover:text-ink' }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card
          icon={Clock}
          label="Stunden gesamt"
          rawValue={totalSeconds}
          format="time"
          sub={`${workDays} ${workDays === 1 ? 'Arbeitstag' : 'Arbeitstage'}`}
          diff={diffPercent}
        />
        <Card
          icon={Euro}
          label="Umsatz"
          rawValue={revenue}
          format="currency"
          sub={revenue > 0 ? 'aus Stundensätzen geschätzt' : 'kein Stundensatz hinterlegt'}
          diff={revenueDiffPercent}
        />
        <Card
          icon={Target}
          label="Wochenziel"
          value={`${weekProgress.toFixed(0)}%`}
          sub={`${formatHM(weekSeconds)} von ${target} Std.`}
        />
        <Card
          icon={Activity}
          label="Sessions"
          rawValue={sessionsCount}
          format="number"
          sub={sessionsCount > 0 ? `Ø ${formatHM(avgSession)} pro Session` : '—'}
          diff={sessionsDiff}
        />
        <Card
          icon={TrendingUp}
          label="Ø pro Arbeitstag"
          rawValue={avgPerWorkDay}
          format="time"
          sub={workDays > 0 ? `auf ${workDays} ${workDays === 1 ? 'Tag' : 'Tagen'}` : '—'}
          diff={avgPerWorkDayDiff}
        />
        <Card
          icon={Calendar}
          label="Arbeitstage"
          rawValue={workDays}
          format="number"
          sub={workDays > 0 ? `Bester: ${bestDay?.label ?? '—'}` : 'noch keine Daten'}
          diff={workDaysDiff}
        />
      </div>

      {/* Top-Kunde + Insight-Zeilen */}
      {topCustomer && (() => {
        const cust = customers.find(c => c.name === topCustomer.name);
        const prevSec = cust ? prevCustomerSeconds.get(cust.id) ?? 0 : 0;
        const currSec = topCustomer.hours * 3600;
        const topDiff = diffP(currSec, prevSec);
        const arrow = topDiff === null ? '' : topDiff > 0 ? '↑' : topDiff < 0 ? '↓' : '→';
        const arrowColor = topDiff === null ? 'text-muted' : topDiff > 0 ? 'text-success' : topDiff < 0 ? 'text-danger' : 'text-muted';
        return (
          <div className="mb-6 kv-card p-5">
            <div className="flex items-center gap-3">
              <span className="size-3.5 shrink-0 rounded-full" style={{ background: topCustomer.color }} />
              <div className="flex-1">
                <div className="kv-label">Top-Kunde der Periode</div>
                <div className="mt-0.5 text-sm font-bold text-ink">{topCustomer.name}</div>
              </div>
              <div className="text-right tabular-nums">
                <div className="flex items-center justify-end gap-2 text-sm font-bold text-ink">
                  {topCustomer.hours.toFixed(1)} Std.
                  {topDiff !== null && (
                    <span className={`text-[11px] ${arrowColor}`}>{arrow} {Math.abs(topDiff).toFixed(0)}%</span>
                  )}
                </div>
                {topCustomer.revenue > 0 && (
                  <div className="text-[11px] text-accent">{formatEuro(topCustomer.revenue)}</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bar Chart: Stunden pro Tag */}
      <div className="mb-6 kv-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={14} className="text-muted" />
          <span className="kv-label">Stunden pro Tag</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={{ stroke: chart.grid }} tickLine={false} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: chart.cursor }} />
              {period === 'week' && (
                <ReferenceLine y={target / 7} stroke={chart.reference} strokeDasharray="3 3" />
              )}
              <Bar dataKey="hours" name="Stunden" fill={chart.primary} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Donut + Wochentage */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {/* Donut: Kunden */}
        <div className="kv-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-muted" />
            <span className="kv-label">Pro Kunde</span>
          </div>
          {customerData.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">Keine Daten</div>
          ) : (
            <>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={customerData} dataKey="hours" innerRadius={45} outerRadius={70} strokeWidth={0}>
                      {customerData.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {customerData.slice(0, 4).map((c, i) => {
                  const cust = customers.find(cc => cc.name === c.name);
                  const prev = cust ? (prevCustomerSeconds.get(cust.id) ?? 0) / 3600 : 0;
                  const d = diffP(c.hours, prev);
                  return (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="flex-1 truncate text-ink">{c.name}</span>
                      {d !== null && (
                        <span className={`text-[10px] tabular-nums ${d > 0 ? 'text-success' : d < 0 ? 'text-danger' : 'text-muted'}`}>
                          {d > 0 ? '↑' : d < 0 ? '↓' : '→'} {Math.abs(d).toFixed(0)}%
                        </span>
                      )}
                      <span className="tabular-nums text-muted">{c.hours.toFixed(1)}h</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Wochentage */}
        <div className="kv-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-muted" />
            <span className="kv-label">Pro Wochentag</span>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={{ stroke: chart.grid }} tickLine={false} />
                <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: chart.cursor }} />
                <Bar dataKey="hours" name="Stunden" fill={chart.secondary} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top-Projekte Tabelle */}
      <div className="mb-6 kv-card">
        <div className="border-b border-divider px-4 py-3">
          <span className="kv-label">Top-Projekte</span>
        </div>
        {projectData.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">Keine Daten in dieser Periode</div>
        ) : (
          <ul className="divide-y divide-divider">
            {projectData.map((p, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-ink">{p.name}</div>
                  <div className="text-[11px] text-muted">{p.customer}</div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2 text-sm font-bold text-ink">
                    {p.hours.toFixed(1)} h
                    {p.diff !== null && (
                      <span className={`text-[10px] ${p.diff > 0 ? 'text-success' : p.diff < 0 ? 'text-danger' : 'text-muted'}`}>
                        {p.diff > 0 ? '↑' : p.diff < 0 ? '↓' : '→'} {Math.abs(p.diff).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">
                    {p.share.toFixed(0)}%{p.revenue > 0 ? ` · ${formatEuro(p.revenue)}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {yearForecast && yearForecast.yearToDateRevenue > 0 && (
        <div className="mb-6 kv-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-muted" />
              <span className="kv-label">Jahres-Hochrechnung</span>
            </div>
            <div className="rounded-md bg-paper px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-muted border border-divider">
              {(yearForecast.workDayRatio * 100).toFixed(0)}% Arbeitstage
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-muted">Bisher in {new Date().getFullYear()}</div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{formatEuro(yearForecast.yearToDateRevenue)}</div>
              <div className="text-[10px] text-muted">{yearForecast.yearToDateWorkDays} Arbeitstage</div>
              {yearForecast.trackedRevenue > 0 && (
                <div className="mt-0.5 text-[9px] text-warning/80">davon {formatEuro(yearForecast.trackedRevenue)} noch nicht abgerechnet</div>
              )}
            </div>
            <div>
              <div className="text-[10px] text-muted">Ø pro Arbeitstag</div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{formatEuro(yearForecast.averageDailyRevenue)}</div>
              <div className="text-[10px] text-muted">~{yearForecast.estimatedRemainingWorkDays} Arbeitstage übrig</div>
            </div>
            <div>
              <div className="text-[10px] text-muted">Prognose Jahresende</div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums text-accent">{formatEuro(yearForecast.forecastEnd)}</div>
              <div className="text-[10px] text-muted">+{formatEuro(yearForecast.forecastRemaining)} erwartet</div>
            </div>
          </div>
        </div>
      )}

      {/* === Profitabilität pro Kunde === */}
      {profitabilityCustomers.length > 0 && (
        <div className="mb-6 kv-card">
          <div className="border-b border-divider px-4 py-3">
            <span className="kv-label">Profitabilität pro Kunde</span>
          </div>
          <ul className="divide-y divide-divider">
            {profitabilityCustomers.map(p => (
              <li key={p.customerId} className="flex items-center gap-3 px-4 py-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.customer?.color ?? 'var(--kv-chart-6)' }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-ink">{p.customer?.name ?? '—'}</div>
                  <div className="text-[11px] text-muted tabular-nums">
                    {p.totalHours.toFixed(1)} h · realer Stundensatz {p.effectiveHourlyRate > 0 ? p.effectiveHourlyRate.toFixed(0) + ' €/h' : '—'}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-sm font-bold text-ink">{formatEuro(p.invoicedRevenue)}</div>
                  {p.openRevenue > 0 && (
                    <div className="text-[11px] text-warning">{formatEuro(p.openRevenue)} offen</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* === Profitabilität pro Projekt mit Budget/Pauschal === */}
      {profitabilityProjects.filter(p => p.budgetHours || p.fixedPrice).length > 0 && (
        <div className="mb-6 kv-card">
          <div className="border-b border-divider px-4 py-3">
            <span className="kv-label">Projekte mit Budget / Pauschalpreis</span>
          </div>
          <ul className="divide-y divide-divider">
            {profitabilityProjects.filter(p => p.budgetHours || p.fixedPrice).map(p => {
              const overBudget = p.budgetUsagePercent && p.budgetUsagePercent > 100;
              return (
                <li key={p.projectId} className="flex items-center gap-3 px-4 py-3">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.customer?.color ?? 'var(--kv-chart-6)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{p.project?.name ?? '—'}</div>
                    <div className="text-[11px] text-muted tabular-nums">
                      {p.totalHours.toFixed(1)} h gearbeitet
                      {p.budgetHours ? ` · Budget ${p.budgetHours} h` : ''}
                      {p.realHourlyRate ? ` · realer Satz ${p.realHourlyRate.toFixed(0)} €/h` : ''}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    {p.budgetUsagePercent !== undefined && (
                      <div className={`text-sm font-bold ${overBudget ? 'text-danger' : 'text-ink'}`}>
                        {p.budgetUsagePercent.toFixed(0)}%
                      </div>
                    )}
                    {p.fixedPrice && (
                      <div className="text-[11px] text-muted">{formatEuro(p.fixedPrice)} Pauschal</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
