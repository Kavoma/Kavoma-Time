import { useState, useMemo } from 'react';
import { BarChart3, Target, Clock, Activity, Euro, TrendingUp, Calendar } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';
import { useAppState } from '../state/AppStateContext';
import { TimeEntry } from '../types';

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
function Card({ icon: Icon, label, value, sub, diff }: { icon: any; label: string; value: string; sub?: string; diff?: number | null }) {
  return (
    <div className="rounded-lg border border-divider bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</span>
        <div className="flex items-center gap-2">
          {diff !== undefined && diff !== null && (
            <span className={`text-[10px] font-bold tabular-nums ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {diff >= 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(0)}%
            </span>
          )}
          <Icon size={14} className="text-muted" />
        </div>
      </div>
      <div className="font-display text-3xl font-bold tabular-nums leading-none text-ink">{value}</div>
      {sub && <div className="mt-2 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

// === Tooltip ====================================================
function ChartTooltip({ active, payload, label, suffix }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border border-divider bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-bold text-ink">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="tabular-nums text-muted">
          {p.name}: <span className="text-ink">{p.value.toFixed(1)}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

// === Main ========================================================
export function StatisticsView() {
  const { state } = useAppState();
  const [period, setPeriod] = useState<Period>('month');

  if (!state) return null;

  const start = periodStart(period);
  const entriesInPeriod = state.entries.filter(e => e.startedAt >= start);
  
  // === Vergleichszeitraum berechnen ===
  const prevStart = useMemo(() => {
    const d = new Date(start);
    if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  }, [start, period]);
  
  const entriesInPrevPeriod = state.entries.filter(e => e.startedAt >= prevStart && e.startedAt < start);
  const prevTotalSeconds = entriesInPrevPeriod.reduce((sum, e) => sum + e.durationSeconds, 0);
  
  const totalSeconds  = entriesInPeriod.reduce((sum, e) => sum + e.durationSeconds, 0);
  const diffPercent = prevTotalSeconds > 0 ? ((totalSeconds - prevTotalSeconds) / prevTotalSeconds) * 100 : null;

  // Umsatz (geschätzt) — nur Kunden mit hourlyRate
  const revenue = entriesInPeriod.reduce((sum, e) => {
    const customer = state.customers.find(c => c.id === e.customerId);
    if (!customer?.hourlyRate) return sum;
    return sum + (e.durationSeconds / 3600) * customer.hourlyRate;
  }, 0);

  const prevRevenue = entriesInPrevPeriod.reduce((sum, e) => {
    const customer = state.customers.find(c => c.id === e.customerId);
    if (!customer?.hourlyRate) return sum;
    return sum + (e.durationSeconds / 3600) * customer.hourlyRate;
  }, 0);

  const revenueDiffPercent = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  const sessionsCount = entriesInPeriod.length;
  const avgSession    = sessionsCount > 0 ? totalSeconds / sessionsCount : 0;

  // Anzahl tatsächlicher Arbeitstage (Tage mit ≥1 Eintrag)
  const workDays = new Set(entriesInPeriod.map(e => ymd(new Date(e.startedAt)))).size;
  const avgPerWorkDay = workDays > 0 ? totalSeconds / workDays : 0;

  // Wochenziel-Fortschritt (immer aktuelle Woche)
  const weekStart = startOfWeek().getTime();
  const weekSeconds = state.entries
    .filter(e => e.startedAt >= weekStart)
    .reduce((s, e) => s + e.durationSeconds, 0);
  const weekHours    = weekSeconds / 3600;
  const target       = state.weeklyTargetHours;
  const weekProgress = Math.min(100, (weekHours / target) * 100);

  // === Daily Bar-Chart (Tage in der Periode) ====================
  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; hours: number; ts: number }>();
    const now = new Date();
    let cursor = new Date(start);

    while (cursor.getTime() <= now.getTime()) {
      const key = ymd(cursor);
      map.set(key, { date: key, hours: 0, ts: cursor.getTime() });
      cursor.setDate(cursor.getDate() + 1);
    }
    entriesInPeriod.forEach(e => {
      const key = ymd(new Date(e.startedAt));
      const item = map.get(key);
      if (item) item.hours += e.durationSeconds / 3600;
    });

    const labelOf = (d: Date) =>
      period === 'year'
        ? d.toLocaleDateString('de-DE', { month: 'short', day: '2-digit' })
        : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' });

    return Array.from(map.values()).map(d => ({ ...d, label: labelOf(new Date(d.ts)) }));
  }, [entriesInPeriod, start, period]);

  // === Donut: Stunden pro Kunde =================================
  const customerData = useMemo(() => {
    const acc = new Map<number, number>();
    entriesInPeriod.forEach(e => {
      acc.set(e.customerId, (acc.get(e.customerId) || 0) + e.durationSeconds);
    });
    return Array.from(acc.entries())
      .map(([customerId, seconds]) => {
        const c = state.customers.find(cc => cc.id === customerId);
        return {
          name: c?.name ?? 'Unbekannt',
          hours: seconds / 3600,
          color: c?.color ?? '#525252',
          revenue: c?.hourlyRate ? (seconds / 3600) * c.hourlyRate : 0,
        };
      })
      .filter(c => c.hours > 0)
      .sort((a, b) => b.hours - a.hours);
  }, [entriesInPeriod, state.customers]);

  // === Top-Projekte =============================================
  const projectData = useMemo(() => {
    const acc = new Map<number, number>();
    entriesInPeriod.forEach(e => {
      acc.set(e.projectId, (acc.get(e.projectId) || 0) + e.durationSeconds);
    });
    return Array.from(acc.entries())
      .map(([projectId, seconds]) => {
        const p = state.projects.find(pp => pp.id === projectId);
        const c = state.customers.find(cc => cc.id === p?.customerId);
        return {
          name:    p?.name ?? 'Unbekannt',
          customer: c?.name ?? '—',
          color:   c?.color ?? '#525252',
          seconds,
          hours:   seconds / 3600,
          revenue: c?.hourlyRate ? (seconds / 3600) * c.hourlyRate : 0,
          share:   totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0,
        };
      })
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
  }, [entriesInPeriod, state.projects, state.customers, totalSeconds]);

  // === Wochentag-Verteilung =====================================
  const weekdayData = useMemo(() => {
    const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const totals = [0, 0, 0, 0, 0, 0, 0];
    entriesInPeriod.forEach(e => {
      const dow = (new Date(e.startedAt).getDay() + 6) % 7;
      totals[dow] += e.durationSeconds;
    });
    return labels.map((label, i) => ({ label, hours: totals[i] / 3600 }));
  }, [entriesInPeriod]);

  // === Best Day Insight ========================================
  const bestDay = weekdayData.reduce((max, d) => d.hours > max.hours ? d : max, weekdayData[0]);
  const topCustomer = customerData[0];

  // === Render ===================================================
  return (
    <>
      {/* Header + Period Picker */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight leading-none">Statistik</h2>
          <p className="mt-1.5 text-xs text-muted">{PERIOD_LABELS[period]} im Überblick</p>
        </div>
        <div className="flex gap-1 rounded-md border border-divider bg-surface p-1">
          {(['week', 'month', 'year'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`cursor-pointer rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                period === p ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
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
          value={formatHM(totalSeconds)}
          sub={`${workDays} ${workDays === 1 ? 'Arbeitstag' : 'Arbeitstage'}`}
          diff={diffPercent}
        />
        <Card
          icon={Euro}
          label="Umsatz"
          value={formatEuro(revenue)}
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
          value={String(sessionsCount)}
          sub={sessionsCount > 0 ? `Ø ${formatHM(avgSession)} pro Session` : '—'}
        />
        <Card
          icon={TrendingUp}
          label="Ø pro Arbeitstag"
          value={formatHM(avgPerWorkDay)}
          sub={workDays > 0 ? `auf ${workDays} ${workDays === 1 ? 'Tag' : 'Tagen'}` : '—'}
        />
        <Card
          icon={Calendar}
          label="Bester Wochentag"
          value={bestDay && bestDay.hours > 0 ? bestDay.label : '—'}
          sub={bestDay && bestDay.hours > 0 ? `${bestDay.hours.toFixed(1)} Std. gesamt` : 'noch keine Daten'}
        />
      </div>

      {/* Top-Kunde + Insight-Zeilen */}
      {topCustomer && (
        <div className="mb-6 rounded-lg border border-divider bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="size-3.5 shrink-0 rounded-full" style={{ background: topCustomer.color }} />
            <div className="flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Top-Kunde der Periode</div>
              <div className="mt-0.5 text-sm font-bold text-ink">{topCustomer.name}</div>
            </div>
            <div className="text-right tabular-nums">
              <div className="text-sm font-bold text-ink">{topCustomer.hours.toFixed(1)} Std.</div>
              {topCustomer.revenue > 0 && (
                <div className="text-[11px] text-accent">{formatEuro(topCustomer.revenue)}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bar Chart: Stunden pro Tag */}
      <div className="mb-6 rounded-lg border border-divider bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Stunden pro Tag</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#525252', fontSize: 10 }} axisLine={{ stroke: '#262626' }} tickLine={false} />
              <YAxis tick={{ fill: '#525252', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip suffix=" h" />} cursor={{ fill: '#262626' }} />
              {period === 'week' && (
                <ReferenceLine y={target / 7} stroke="#a3a3a3" strokeDasharray="3 3" />
              )}
              <Bar dataKey="hours" fill="#ffffff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Donut + Wochentage */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {/* Donut: Kunden */}
        <div className="rounded-lg border border-divider bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-muted" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Pro Kunde</span>
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
                    <Tooltip content={<ChartTooltip suffix=" h" />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {customerData.slice(0, 4).map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 truncate text-ink">{c.name}</span>
                    <span className="tabular-nums text-muted">{c.hours.toFixed(1)}h</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Wochentage */}
        <div className="rounded-lg border border-divider bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-muted" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Pro Wochentag</span>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#525252', fontSize: 10 }} axisLine={{ stroke: '#262626' }} tickLine={false} />
                <YAxis tick={{ fill: '#525252', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip suffix=" h" />} cursor={{ fill: '#262626' }} />
                <Bar dataKey="hours" fill="#a3a3a3" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top-Projekte Tabelle */}
      <div className="rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Top-Projekte</span>
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
                  <div className="text-sm font-bold text-ink">{p.hours.toFixed(1)} h</div>
                  <div className="text-[11px] text-muted">
                    {p.share.toFixed(0)}%{p.revenue > 0 ? ` · ${formatEuro(p.revenue)}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
