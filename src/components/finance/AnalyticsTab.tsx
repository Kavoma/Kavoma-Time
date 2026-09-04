import { lazy, Suspense, useMemo, useState } from 'react';
import { useAppState } from '../../state/AppStateContext';
import {
  computeExpenseCategories, computeFinanceForecast, computePnL, computeVatBreakdown,
  totalsFromPnL,
  AccountingMode,
} from '../../utils/financeAnalytics';
import { AnalyticsRange, AnalyticsRangePicker, resolveRange } from './analytics/AnalyticsRangePicker';
import { ProfitLossHero } from './analytics/ProfitLossHero';
import { VatBreakdown } from './analytics/VatBreakdown';

// Die beiden einzigen Stellen ausserhalb der Statistik, die `recharts` ziehen.
// Blieben sie fest verdrahtet, läge die Bibliothek trotz der nachgeladenen
// Statistik-Ansicht wieder im Startbündel — die Auswertung hängt über
// `FinanceView` daran.
const TrendChart = lazy(() =>
  import('./analytics/TrendChart').then((m) => ({ default: m.TrendChart })),
);
const ExpensesByCategory = lazy(() =>
  import('./analytics/ExpensesByCategory').then((m) => ({ default: m.ExpensesByCategory })),
);

/** Platzhalter in Diagrammhöhe, damit beim Nachladen nichts springt. */
function DiagrammLaedt() {
  return <div className="kv-card flex h-72 items-center justify-center kv-label">Diagramm wird geladen…</div>;
}

function isoFromTs(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function describeRange(r: AnalyticsRange): string {
  if (r.mode === 'year') return `Jahr ${r.year}`;
  if (r.mode === 'quarter') return `Q${r.quarter} ${r.year}`;
  if (r.customFrom && r.customTo) {
    const a = new Date(r.customFrom).toLocaleDateString('de-DE');
    const b = new Date(r.customTo).toLocaleDateString('de-DE');
    return `${a} – ${b}`;
  }
  return 'Freier Zeitraum';
}

export function AnalyticsTab() {
  const { state } = useAppState();
  const currentYear = new Date().getFullYear();

  const [range, setRange] = useState<AnalyticsRange>(() => ({
    mode: 'year',
    year: currentYear,
    quarter: (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
    customFrom: isoFromTs(new Date(currentYear, 0, 1).getTime()),
    customTo: isoFromTs(Date.now()),
  }));
  const [accountingMode, setAccountingMode] = useState<AccountingMode>('cash');
  const [vatYear, setVatYear] = useState(currentYear);

  // Aktive DateRange ableiten
  const dateRange = useMemo(() => resolveRange(range), [range]);

  // Aggregationen (alle pure)
  const pnlEntries = useMemo(
    () => state ? computePnL(state, dateRange, accountingMode) : [],
    [state, dateRange, accountingMode],
  );
  const totals = useMemo(() => totalsFromPnL(pnlEntries), [pnlEntries]);
  const forecast = useMemo(
    () => state ? computeFinanceForecast(state) : null,
    [state],
  );
  const vatQuarters = useMemo(
    () => state ? computeVatBreakdown(state, vatYear, accountingMode) : [],
    [state, vatYear, accountingMode],
  );
  const categoryExpenses = useMemo(
    () => state ? computeExpenseCategories(state, dateRange) : [],
    [state, dateRange],
  );

  if (!state || !forecast) return null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Auswertung</h2>
          <p className="mt-1 text-[12px] text-muted">
            Einnahmen, Ausgaben und Gewinn-/Verlust-Rechnung, wahlweise nach Ist- oder Soll-Versteuerung.
          </p>
        </div>
      </div>

      <AnalyticsRangePicker
        value={range}
        onChange={setRange}
        accountingMode={accountingMode}
        onAccountingModeChange={setAccountingMode}
      />

      <ProfitLossHero
        totals={totals}
        forecast={forecast}
        rangeLabel={describeRange(range)}
        forecastYear={currentYear}
      />

      <Suspense fallback={<DiagrammLaedt />}>
        <TrendChart entries={pnlEntries} />
      </Suspense>

      <VatBreakdown
        year={vatYear}
        onYearChange={setVatYear}
        quarters={vatQuarters}
      />

      <Suspense fallback={<DiagrammLaedt />}>
        <ExpensesByCategory data={categoryExpenses} />
      </Suspense>
    </div>
  );
}
