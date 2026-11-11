import { Wallet } from 'lucide-react';
import type { OutstandingAmounts } from '../../utils/outstanding';
import { DrawerSection } from './DrawerParts';

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const stunden = (sek: number) =>
  `${(sek / 3600).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} h`;

/**
 * „Was schuldet mir der Kunde noch?" — für Kunden- und Projekt-Detail.
 *
 * Nicht abgerechnete Zeit und offene Rechnungen stehen getrennt: Für das eine
 * muss man eine Rechnung schreiben, für das andere auf Zahlung warten.
 */
export function OutstandingCard({ amounts, vatRate }: { amounts: OutstandingAmounts; vatRate: number }) {
  const {
    unbilledSeconds, unbilledSecondsWithoutRate, unbilledNet, unbilledGross,
    openInvoicesAmount, openInvoiceCount, totalGross,
  } = amounts;

  return (
    <DrawerSection title="Noch offen" icon={Wallet}>
      <div className="rounded-md border border-divider bg-paper/40 text-[12px]">
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div>
            <div className="font-bold text-ink">Noch nicht abgerechnet</div>
            <div className="text-[11px] text-muted">
              {unbilledSeconds > 0 ? stunden(unbilledSeconds) : 'Keine offenen Stunden'}
              {vatRate > 0 && unbilledGross > 0 && <> · netto {euro(unbilledNet)}</>}
            </div>
            {unbilledSecondsWithoutRate > 0 && (
              <div className="text-[11px] text-warning">
                {stunden(unbilledSecondsWithoutRate)} ohne Stundensatz — nicht im Betrag enthalten
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-bold tabular-nums text-ink">{euro(unbilledGross)}</div>
            {vatRate > 0 && <div className="text-[10px] text-muted">inkl. {vatRate} % USt</div>}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-divider px-3 py-2.5">
          <div>
            <div className="font-bold text-ink">Offene Rechnungen</div>
            <div className="text-[11px] text-muted">
              {openInvoiceCount === 0 ? 'Alles bezahlt' : `${openInvoiceCount} ${openInvoiceCount === 1 ? 'Rechnung' : 'Rechnungen'} unbezahlt`}
            </div>
          </div>
          <div className={`shrink-0 font-bold tabular-nums ${openInvoicesAmount > 0 ? 'text-warning' : 'text-ink'}`}>
            {euro(openInvoicesAmount)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-divider bg-surface/50 px-3 py-2.5">
          <div className="font-bold uppercase tracking-wider text-[10px] text-muted">Summe</div>
          <div className="text-sm font-black tabular-nums text-ink">{euro(totalGross)}</div>
        </div>
      </div>
    </DrawerSection>
  );
}
