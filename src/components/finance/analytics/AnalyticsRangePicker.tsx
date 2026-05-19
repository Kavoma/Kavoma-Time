import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { DatePicker } from '../../DatePicker';
import { Tooltip } from '../../Tooltip';
import { AccountingMode, DateRange, rangeForQuarter, rangeForYear } from '../../../utils/financeAnalytics';

export type RangeMode = 'year' | 'quarter' | 'custom';

export interface AnalyticsRange {
  mode: RangeMode;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  customFrom: string;   // ISO YYYY-MM-DD
  customTo: string;     // ISO YYYY-MM-DD
}

interface Props {
  value: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
  accountingMode: AccountingMode;
  onAccountingModeChange: (mode: AccountingMode) => void;
}

const MODE_LABELS: Record<RangeMode, string> = {
  year: 'Jahr',
  quarter: 'Quartal',
  custom: 'Frei',
};

// Ermittelt die effektive DateRange anhand AnalyticsRange.
// Wird auch aus AnalyticsTab importiert – daher exported.
export function resolveRange(r: AnalyticsRange): DateRange {
  if (r.mode === 'year') return rangeForYear(r.year);
  if (r.mode === 'quarter') return rangeForQuarter(r.year, r.quarter);
  const from = new Date(r.customFrom);
  const to   = new Date(r.customTo);
  const fromTs = Number.isFinite(from.getTime()) ? from.getTime() : 0;
  // to ist exklusiv -> +1 Tag, damit der Endtag selbst noch zählt
  const toTs = Number.isFinite(to.getTime()) ? to.getTime() + 86_400_000 : 0;
  return { from: Math.min(fromTs, toTs), to: Math.max(fromTs, toTs) };
}

export function AnalyticsRangePicker({ value, onChange, accountingMode, onAccountingModeChange }: Props) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const setMode = (mode: RangeMode) => {
    if (mode === value.mode) return;
    onChange({ ...value, mode });
  };

  const stepYear = (delta: number) => {
    onChange({ ...value, year: value.year + delta });
  };

  const setQuarter = (quarter: 1 | 2 | 3 | 4) => {
    onChange({ ...value, quarter });
  };

  return (
    <div className="mb-6 rounded-lg border border-divider bg-surface p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Modus-Toggle */}
        <div className="flex items-center gap-1 rounded-md border border-divider bg-paper p-0.5">
          {(['year', 'quarter', 'custom'] as RangeMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`cursor-pointer rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                value.mode === m ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Jahres-Stepper (immer sichtbar wenn year oder quarter) */}
        {value.mode !== 'custom' && (
          <div className="flex items-center gap-1 rounded-md border border-divider bg-paper">
            <button
              type="button"
              onClick={() => stepYear(-1)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted hover:text-ink"
              aria-label="Vorheriges Jahr"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="min-w-[3rem] text-center text-sm font-bold tabular-nums">{value.year}</div>
            <button
              type="button"
              onClick={() => stepYear(1)}
              disabled={value.year >= currentYear + 1}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Nächstes Jahr"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Quartals-Auswahl */}
        {value.mode === 'quarter' && (
          <div className="flex items-center gap-1 rounded-md border border-divider bg-paper p-0.5">
            {([1, 2, 3, 4] as const).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuarter(q)}
                className={`cursor-pointer rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  value.quarter === q ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                }`}
              >
                Q{q}
              </button>
            ))}
          </div>
        )}

        {/* Freie Range */}
        {value.mode === 'custom' && (
          <div className="flex items-center gap-2">
            <DatePicker
              value={value.customFrom}
              onChange={(v) => onChange({ ...value, customFrom: v })}
            />
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">bis</span>
            <DatePicker
              value={value.customTo}
              onChange={(v) => onChange({ ...value, customTo: v })}
            />
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Ist/Soll-Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-divider bg-paper p-0.5">
            <button
              type="button"
              onClick={() => onAccountingModeChange('cash')}
              className={`cursor-pointer rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                accountingMode === 'cash' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              Ist (Cash)
            </button>
            <button
              type="button"
              onClick={() => onAccountingModeChange('accrual')}
              className={`cursor-pointer rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                accountingMode === 'accrual' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              Soll (Accrual)
            </button>
          </div>
          <Tooltip
            variant="rich"
            trigger="hover-click"
            position="left"
            content={
              <div>
                <div className="mb-1.5 font-bold uppercase tracking-widest text-[10px] text-muted">Versteuerungs-Modus</div>
                <p className="mb-2">
                  <strong>Ist (Cash):</strong> Nur tatsächlich bezahlte Rechnungen
                  zählen als Einnahme. So sieht es dein Steuerberater bei
                  Ist-Versteuerung — der Tag der Zahlung ist der Stichtag.
                </p>
                <p>
                  <strong>Soll (Accrual):</strong> Alle finalisierten Rechnungen
                  ab Erstellungsdatum zählen, auch unbezahlte. Zeigt die
                  Auftragslage, weicht aber vom Bankkonto ab.
                </p>
                <p className="mt-2 text-muted">
                  Ausgaben sind in beiden Modi identisch — alle Eingangsrechnungen
                  des Zeitraums.
                </p>
              </div>
            }
          >
            <button
              type="button"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-divider hover:text-ink"
              aria-label="Erklärung Ist/Soll"
            >
              <Info size={13} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
