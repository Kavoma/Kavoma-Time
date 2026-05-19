import { useMemo } from 'react';
import { PieChart as PieChartIcon, AlertCircle } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import {
  CategoryExpense, formatEuro, VENDOR_CATEGORY_LABELS,
} from '../../../utils/financeAnalytics';
import { VendorInvoiceCategory } from '../../../types';

interface Props {
  data: CategoryExpense[];
}

const CATEGORY_COLORS: Record<VendorInvoiceCategory, string> = {
  hardware: '#60a5fa',
  software: '#a78bfa',
  office:   '#fbbf24',
  travel:   '#34d399',
  service:  '#f472b6',
  other:    '#a3a3a3',
};

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CategoryExpense }> }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-divider bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-bold text-ink">{VENDOR_CATEGORY_LABELS[d.category]}</div>
      <div className="tabular-nums text-muted">
        Summe: <span className="text-ink">{formatEuro(d.total)}</span>
      </div>
      <div className="tabular-nums text-muted">
        Anteil: <span className="text-ink">{(d.share * 100).toFixed(1)}%</span>
      </div>
      <div className="tabular-nums text-muted">
        {d.count} {d.count === 1 ? 'Beleg' : 'Belege'}
      </div>
    </div>
  );
}

export function ExpensesByCategory({ data }: Props) {
  const total = useMemo(() => data.reduce((s, d) => s + d.total, 0), [data]);

  return (
    <div className="rounded-lg border border-divider bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <PieChartIcon size={14} className="text-muted" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Ausgaben nach Kategorie</h3>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <AlertCircle size={18} className="text-muted" />
          <div className="text-sm font-bold text-muted">Keine Ausgaben im Zeitraum</div>
          <p className="max-w-md text-[12px] text-muted/80">
            Eingangsrechnungen im gewählten Zeitraum erscheinen hier mit Anteil pro Kategorie.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.category} fill={CATEGORY_COLORS[d.category]} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-divider pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              <span>Kategorie</span>
              <span>Summe</span>
            </div>
            {data.map((d) => (
              <div key={d.category} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[d.category] }}
                  />
                  <span className="truncate">{VENDOR_CATEGORY_LABELS[d.category]}</span>
                  <span className="shrink-0 text-[10px] text-muted">
                    · {d.count}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] tabular-nums text-muted">
                    {(d.share * 100).toFixed(0)}%
                  </span>
                  <span className="font-bold tabular-nums">{formatEuro(d.total)}</span>
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-divider pt-2 text-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Gesamt</span>
              <span className="font-display text-lg font-bold tabular-nums">{formatEuro(total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
