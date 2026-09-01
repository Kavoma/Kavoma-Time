import { ChevronLeft, ChevronRight, Download, Receipt, AlertCircle } from 'lucide-react';
import { downloadVatCsv, formatEuro, VatQuarter } from '../../../utils/financeAnalytics';

interface Props {
  year: number;
  onYearChange: (next: number) => void;
  quarters: VatQuarter[];
}

export function VatBreakdown({ year, onYearChange, quarters }: Props) {
  const totals = quarters.reduce(
    (acc, q) => {
      acc.collected += q.collected;
      acc.deductible += q.deductible;
      acc.payable += q.payable;
      acc.missing += q.vendorInvoicesWithoutVat;
      return acc;
    },
    { collected: 0, deductible: 0, payable: 0, missing: 0 },
  );

  const empty = totals.collected === 0 && totals.deductible === 0 && totals.missing === 0;

  return (
    <div className="mb-8 kv-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-muted" />
          <h3 className="kv-label">Vorsteuer-Übersicht</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-divider bg-paper">
            <button
              type="button"
              onClick={() => onYearChange(year - 1)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted hover:text-ink"
              aria-label="Vorheriges Jahr"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="min-w-[3rem] text-center text-sm font-bold tabular-nums">{year}</div>
            <button
              type="button"
              onClick={() => onYearChange(year + 1)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted hover:text-ink"
              aria-label="Nächstes Jahr"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => downloadVatCsv(quarters)}
            disabled={empty}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-ink transition-colors hover:bg-divider disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <AlertCircle size={18} className="text-muted" />
          <div className="text-sm font-bold text-muted">Keine USt-relevanten Belege im Jahr {year}</div>
          <p className="max-w-md text-[12px] text-muted/80">
            Sobald Ausgangs- oder Eingangsrechnungen erfasst sind, erscheinen hier
            Vereinnahmung, Vorsteuer und Zahllast pro Quartal.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider text-left kv-label">
                  <th className="py-2 pr-3">Quartal</th>
                  <th className="py-2 px-3 text-right">USt vereinnahmt</th>
                  <th className="py-2 px-3 text-right">Vorsteuer abziehbar</th>
                  <th className="py-2 pl-3 text-right">Zahllast</th>
                </tr>
              </thead>
              <tbody>
                {quarters.map((q) => (
                  <tr key={q.quarter} className="border-b border-divider/40">
                    <td className="py-2 pr-3 font-bold">Q{q.quarter} {year}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatEuro(q.collected, 2)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatEuro(q.deductible, 2)}</td>
                    <td className={`py-2 pl-3 text-right font-bold tabular-nums ${q.payable < 0 ? 'text-success' : ''}`}>
                      {formatEuro(q.payable, 2)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-paper/30 text-[12px]">
                  <td className="py-2 pr-3 font-bold uppercase tracking-widest">Jahr {year}</td>
                  <td className="py-2 px-3 text-right font-bold tabular-nums">{formatEuro(totals.collected, 2)}</td>
                  <td className="py-2 px-3 text-right font-bold tabular-nums">{formatEuro(totals.deductible, 2)}</td>
                  <td className={`py-2 pl-3 text-right font-bold tabular-nums ${totals.payable < 0 ? 'text-success' : ''}`}>
                    {formatEuro(totals.payable, 2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {totals.missing > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-[11px] text-warning">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>
                {totals.missing} {totals.missing === 1 ? 'Eingangsrechnung wurde' : 'Eingangsrechnungen wurden'} ohne
                USt-Angabe erfasst und mit 0 € Vorsteuer gewertet.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
