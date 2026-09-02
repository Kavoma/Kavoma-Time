import { TrendingUp, TrendingDown, Euro, Wallet, Activity, CalendarRange } from 'lucide-react';
import { Tooltip } from '../../Tooltip';
import { FinanceForecast, formatEuro, PnLTotals } from '../../../utils/financeAnalytics';

interface Props {
  totals: PnLTotals;
  forecast: FinanceForecast;
  rangeLabel: string;
  forecastYear: number;
}

interface CardProps {
  label: string;
  value: number;
  icon: typeof Euro;
  sub?: string;
  highlight?: 'positive' | 'negative' | 'neutral';
}

function Card({ label, value, icon: Icon, sub, highlight = 'neutral' }: CardProps) {
  const valueClass =
    highlight === 'negative' ? 'text-danger' :
    highlight === 'positive' && value > 0 ? 'text-success' :
    'text-ink';
  return (
    <div className="kv-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="kv-label">{label}</span>
        <Icon size={14} className="text-muted" />
      </div>
      <div className={`font-display text-3xl font-bold tabular-nums leading-none ${valueClass}`}>
        {formatEuro(value)}
      </div>
      {sub && <div className="mt-2 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function ProfitLossHero({ totals, forecast, rangeLabel, forecastYear }: Props) {
  const profitHighlight = totals.profit < 0 ? 'negative' : totals.profit > 0 ? 'positive' : 'neutral';
  const forecastProfitHighlight = forecast.profitForecast < 0 ? 'negative' : 'positive';

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="kv-label">{rangeLabel}</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="Einnahmen" value={totals.revenue} icon={Euro} />
        <Card label="Ausgaben" value={totals.expenses} icon={Wallet} />
        <Card label="Gewinn / Verlust" value={totals.profit} icon={profitHighlight === 'negative' ? TrendingDown : TrendingUp} highlight={profitHighlight} />
      </div>

      {/* Forecast-Karte: immer Jahres-fix */}
      <div className="mt-3 rounded-lg border border-divider bg-paper/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarRange size={14} className="text-muted" />
            <span className="kv-label">
              Hochrechnung Jahresende {forecastYear}
            </span>
            <Tooltip
              variant="rich"
              trigger="hover-click"
              content={
                <div>
                  <p className="mb-1.5">
                    Die Hochrechnung nutzt immer das gesamte laufende Jahr,
                    unabhängig vom oben gewählten Zeitraum.
                  </p>
                  <p className="mb-1.5">
                    <strong>Einnahmen:</strong> Ø pro Arbeitstag × verbleibende
                    Arbeitstage (basierend auf bisherigem Tracking-Muster).
                  </p>
                  <p>
                    <strong>Ausgaben:</strong> Ø pro Kalendertag × verbleibende
                    Kalendertage — Ausgaben fallen nicht nur an Arbeitstagen an.
                  </p>
                </div>
              }
            >
              <span className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-divider hover:text-ink">
                <Activity size={11} />
              </span>
            </Tooltip>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted tabular-nums">
            Noch {forecast.daysRemaining} Tage
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div className="kv-label">Einnahmen-Prognose</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">
              {formatEuro(forecast.revenueForecast)}
            </div>
            <div className="mt-1 text-[11px] text-muted">YTD {formatEuro(forecast.revenueYtd)}</div>
          </div>
          <div>
            <div className="kv-label">Ausgaben-Prognose</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">
              {formatEuro(forecast.expensesForecast)}
            </div>
            <div className="mt-1 text-[11px] text-muted">YTD {formatEuro(forecast.expensesYtd)}</div>
          </div>
          <div>
            <div className="kv-label">Gewinn-Prognose</div>
            <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${forecastProfitHighlight === 'negative' ? 'text-danger' : 'text-success'}`}>
              {formatEuro(forecast.profitForecast)}
            </div>
            <div className="mt-1 text-[11px] text-muted">YTD {formatEuro(forecast.profitYtd)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
