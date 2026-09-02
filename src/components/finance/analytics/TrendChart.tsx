import { useMemo } from 'react';
import { useChartColors } from '../../../utils/chartColors';
import { LineChart as LineChartIcon, AlertCircle } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { formatEuro, PnLEntry } from '../../../utils/financeAnalytics';

interface Props {
  entries: PnLEntry[];
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { revenue: number; expenses: number; profit: number } }>; label?: string }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const profitColor = d.profit < 0 ? 'text-danger' : 'text-success';
  return (
    <div className="rounded-md border border-divider bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-bold text-ink">{label}</div>
      <div className="tabular-nums text-muted">
        Einnahmen: <span className="text-ink">{formatEuro(d.revenue)}</span>
      </div>
      <div className="tabular-nums text-muted">
        Ausgaben: <span className="text-ink">{formatEuro(d.expenses)}</span>
      </div>
      <div className="tabular-nums text-muted">
        Gewinn: <span className={profitColor}>{formatEuro(d.profit)}</span>
      </div>
    </div>
  );
}

export function TrendChart({ entries }: Props) {
  const chart = useChartColors();
  const data = useMemo(
    () => entries.map((e) => ({
      label: e.bucket.label,
      revenue: Math.round(e.revenue),
      expenses: Math.round(e.expenses),
      profit: Math.round(e.profit),
    })),
    [entries],
  );

  const hasAnyData = data.some((d) => d.revenue > 0 || d.expenses > 0);
  const granularityLabel = useMemo(() => {
    if (entries.length === 0) return '';
    // Heuristik anhand der Bucket-Breite
    const span = entries[0].bucket.to - entries[0].bucket.from;
    const day = 86_400_000;
    if (span <= day * 2) return 'pro Tag';
    if (span <= day * 35) return 'pro Monat';
    return 'pro Quartal';
  }, [entries]);

  return (
    <div className="mb-6 kv-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LineChartIcon size={14} className="text-muted" />
          <h3 className="kv-label">Trend</h3>
        </div>
        {granularityLabel && (
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted">{granularityLabel}</div>
        )}
      </div>

      {!hasAnyData ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <AlertCircle size={20} className="text-muted" />
          <div className="text-sm font-bold text-muted">Keine Daten im Zeitraum</div>
          <p className="max-w-md text-[12px] text-muted/80">
            Sobald Rechnungen oder Belege im gewählten Zeitraum liegen, erscheint hier
            der Verlauf von Einnahmen und Ausgaben.
          </p>
        </div>
      ) : (
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: chart.axis, fontSize: 11 }}
                axisLine={{ stroke: chart.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: chart.axis, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 11, color: chart.axis, letterSpacing: '0.04em' }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Einnahmen"
                stroke={chart.primary}
                strokeWidth={2}
                dot={{ r: 2.5, fill: chart.primary, stroke: "none" }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                name="Ausgaben"
                stroke={chart.secondary}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2.5, fill: chart.secondary, stroke: "none" }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
