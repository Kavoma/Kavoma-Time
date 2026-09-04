import { AlertTriangle, FileCode2 } from 'lucide-react';
import type { ParsedEInvoice } from '../../utils/eInvoiceRead';
import { taxCategoryLabel } from '../../utils/eInvoiceRead';

/**
 * Zeigt eine gelesene E-Rechnung so, wie ein Mensch sie prüfen würde.
 *
 * Das ist die zweite Hälfte der Empfangspflicht: Eine XRechnung als reine
 * XML-Datei ist zwar maschinenlesbar, aber für einen Menschen unlesbar. Wer sie
 * nur speichert, hat sie nicht empfangen, sondern abgelegt.
 *
 * Absichtlich **kein** Nachbau eines Rechnungsformulars. Gezeigt wird, was im
 * XML steht — und was nicht darin steht, bleibt sichtbar leer, statt mit einer
 * Null aufgefüllt zu werden. Der Unterschied zwischen „0,00 €" und „nicht
 * angegeben" entscheidet, ob man einer Zahl trauen kann.
 */

interface Props {
  invoice: ParsedEInvoice;
  /** Kompakte Fassung ohne Positionstabelle — für die Vorschau im Formular. */
  compact?: boolean;
}

function geld(value: number | undefined, currency: string): string {
  if (value === undefined) return '—';
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value);
  } catch {
    // Ein unbekannter Währungscode darf die Anzeige nicht kippen.
    return `${value.toFixed(2)} ${currency}`;
  }
}

function datum(ts: number | undefined): string {
  return ts === undefined ? '—' : new Date(ts).toLocaleDateString('de-DE');
}

function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-[11px] text-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-[12px] text-ink">{children}</span>
    </div>
  );
}

function Partei({ titel, partei }: { titel: string; partei: ParsedEInvoice['seller'] }) {
  const zeilen = [
    partei.street,
    partei.address2,
    [partei.zip, partei.city].filter(Boolean).join(' '),
    partei.country && partei.country !== 'DE' ? partei.country : null,
  ].filter(Boolean);

  return (
    <div className="kv-raised p-3">
      <div className="kv-label mb-1.5">{titel}</div>
      <div className="text-[13px] font-bold text-ink">{partei.name ?? '— kein Name angegeben —'}</div>
      {zeilen.length > 0 && (
        <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
          {zeilen.map((z, i) => <div key={i}>{z}</div>)}
        </div>
      )}
      {(partei.vatId || partei.taxId || partei.email) && (
        <div className="mt-2 space-y-0.5 border-t border-divider-soft pt-2 text-[11px] text-muted">
          {partei.vatId && <div>USt-IdNr.: <span className="font-mono text-ink">{partei.vatId}</span></div>}
          {partei.taxId && <div>Steuernr.: <span className="font-mono text-ink">{partei.taxId}</span></div>}
          {partei.email && <div className="break-all">{partei.email}</div>}
        </div>
      )}
    </div>
  );
}

export function EInvoiceView({ invoice, compact = false }: Props) {
  const w = invoice.currency;

  return (
    <div className="flex flex-col gap-3">
      {/* Herkunft — was für ein Dokument ist das überhaupt */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="kv-badge">
          <FileCode2 size={11} />
          {invoice.syntax === 'cii' ? 'CII' : 'UBL'}
        </span>
        {invoice.profileLabel && <span className="kv-badge">{invoice.profileLabel}</span>}
        {invoice.documentTypeLabel && (
          <span className={`kv-badge ${invoice.isCreditNote ? 'text-warning' : ''}`}>
            {invoice.documentTypeLabel}
          </span>
        )}
      </div>

      {invoice.warnings.length > 0 && (
        <div className="rounded-md border border-warning-line bg-warning-soft px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-warning">
            <AlertTriangle size={12} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Bitte nachsehen</span>
          </div>
          <ul className="space-y-1 text-[11px] leading-relaxed text-muted">
            {invoice.warnings.map((warnung, i) => <li key={i}>{warnung}</li>)}
          </ul>
        </div>
      )}

      <div className="kv-raised divide-y divide-divider-soft px-3 py-1">
        <Zeile label="Rechnungsnummer">
          <span className="font-mono">{invoice.number ?? '—'}</span>
        </Zeile>
        <Zeile label="Rechnungsdatum">{datum(invoice.issueDate)}</Zeile>
        <Zeile label="Fällig am">{datum(invoice.dueDate)}</Zeile>
        {(invoice.periodFrom !== undefined || invoice.periodTo !== undefined) && (
          <Zeile label="Leistungszeitraum">
            {datum(invoice.periodFrom)} — {datum(invoice.periodTo)}
          </Zeile>
        )}
        {invoice.buyerReference && (
          <Zeile label="Leitweg-ID / Referenz">
            <span className="font-mono">{invoice.buyerReference}</span>
          </Zeile>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Partei titel="Rechnungssteller" partei={invoice.seller} />
        <Partei titel="Rechnungsempfänger" partei={invoice.buyer} />
      </div>

      {!compact && invoice.lines.length > 0 && (
        <div className="kv-raised overflow-hidden">
          <div className="kv-label px-3 pt-3">Positionen</div>
          {/* Breite Tabellen scrollen in sich, die Seite bleibt ruhig. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-[12px]">
              <thead>
                <tr className="border-y border-divider text-[10px] uppercase tracking-wider text-muted">
                  <th className="px-3 py-1.5 text-left font-bold">Bezeichnung</th>
                  <th className="px-3 py-1.5 text-right font-bold">Menge</th>
                  <th className="px-3 py-1.5 text-right font-bold">Einzelpreis</th>
                  <th className="px-3 py-1.5 text-right font-bold">USt</th>
                  <th className="px-3 py-1.5 text-right font-bold">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider-soft">
                {invoice.lines.map((line, i) => (
                  <tr key={line.lineId ?? i}>
                    <td className="px-3 py-1.5 text-ink">{line.name ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {line.quantity === undefined ? '—' : `${line.quantity} ${line.unit ?? ''}`.trim()}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {geld(line.unitPrice, w)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {line.taxPercent === undefined ? '—' : `${line.taxPercent} %`}
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums text-ink">
                      {geld(line.lineTotal, w)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="kv-raised divide-y divide-divider-soft px-3 py-1">
        {invoice.lineTotal !== undefined && (
          <Zeile label="Summe Positionen"><span className="tabular-nums">{geld(invoice.lineTotal, w)}</span></Zeile>
        )}
        {invoice.allowanceTotal !== undefined && invoice.allowanceTotal !== 0 && (
          <Zeile label="Abschläge"><span className="tabular-nums">−{geld(invoice.allowanceTotal, w)}</span></Zeile>
        )}
        {invoice.chargeTotal !== undefined && invoice.chargeTotal !== 0 && (
          <Zeile label="Zuschläge"><span className="tabular-nums">{geld(invoice.chargeTotal, w)}</span></Zeile>
        )}
        <Zeile label="Netto"><span className="tabular-nums">{geld(invoice.taxBasisTotal, w)}</span></Zeile>

        {invoice.taxes.map((tax, i) => (
          <Zeile
            key={i}
            label={[
              'Umsatzsteuer',
              tax.ratePercent !== undefined ? `${tax.ratePercent} %` : null,
              taxCategoryLabel(tax.categoryCode),
            ].filter(Boolean).join(' · ')}
          >
            <span className="tabular-nums">{geld(tax.taxAmount, w)}</span>
          </Zeile>
        ))}

        <Zeile label="Brutto">
          <span className="text-[14px] font-bold tabular-nums">{geld(invoice.grandTotal, w)}</span>
        </Zeile>
        {invoice.prepaidAmount !== undefined && invoice.prepaidAmount !== 0 && (
          <Zeile label="Bereits gezahlt"><span className="tabular-nums">−{geld(invoice.prepaidAmount, w)}</span></Zeile>
        )}
        {invoice.duePayable !== undefined && invoice.duePayable !== invoice.grandTotal && (
          <Zeile label="Zahlbetrag">
            <span className="font-bold tabular-nums">{geld(invoice.duePayable, w)}</span>
          </Zeile>
        )}
      </div>

      {invoice.taxes.some((t) => t.exemptionReason) && (
        <div className="rounded-md border border-divider bg-paper px-3 py-2 text-[11px] leading-relaxed text-muted">
          {invoice.taxes.filter((t) => t.exemptionReason).map((t, i) => (
            <div key={i}>{t.exemptionReason}</div>
          ))}
        </div>
      )}

      {(invoice.paymentIban || invoice.paymentTerms) && (
        <div className="kv-raised divide-y divide-divider-soft px-3 py-1">
          {invoice.paymentIban && (
            <Zeile label="IBAN"><span className="font-mono">{invoice.paymentIban}</span></Zeile>
          )}
          {invoice.paymentBic && (
            <Zeile label="BIC"><span className="font-mono">{invoice.paymentBic}</span></Zeile>
          )}
          {invoice.paymentTerms && <Zeile label="Zahlungsbedingungen">{invoice.paymentTerms}</Zeile>}
        </div>
      )}

      {invoice.notes.length > 0 && (
        <div className="rounded-md border border-divider bg-paper px-3 py-2 text-[11px] leading-relaxed text-muted">
          {invoice.notes.map((note, i) => <div key={i}>{note}</div>)}
        </div>
      )}
    </div>
  );
}
