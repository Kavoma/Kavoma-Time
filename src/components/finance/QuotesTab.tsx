import { useMemo, useState } from 'react';
import {
  Check, Download, Edit2, FileText, Plus, Search, Send, Trash2, X,
} from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { Quote } from '../../types';
import {
  QUOTE_PREFIX_VORGABE, QUOTE_STATE_LABEL, angebotZuRechnungsentwurf,
  istAbrechenbar, kennzahlen, neuesAngebot, quoteState, type QuoteState,
} from '../../utils/quotes';
import { downloadQuotePdf } from '../../utils/pdfLazy';
import { QuoteEditModal } from './QuoteEditModal';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import type { FinanceTab } from '../../views/FinanceView';

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const datum = (ts: number) =>
  new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const STAND_KLASSE: Record<QuoteState, string> = {
  draft:     'bg-warning-soft text-warning',
  sent:      'bg-info-soft text-info',
  accepted:  'bg-success-soft text-success',
  declined:  'bg-neutral-soft text-muted',
  expired:   'bg-danger-soft text-danger',
  invoiced:  'bg-success-soft text-success',
};

const FILTER: { id: QuoteState | 'alle'; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'draft', label: 'Entwürfe' },
  { id: 'sent', label: 'Versendet' },
  { id: 'accepted', label: 'Angenommen' },
  { id: 'expired', label: 'Abgelaufen' },
  { id: 'invoiced', label: 'Abgerechnet' },
];

interface Props {
  /** Nach der Umwandlung in den Rechnungs-Reiter springen. */
  onGoToInvoices?: (tab: FinanceTab, invoiceId: string) => void;
}

/**
 * Angebote — der Schritt vor der Rechnung.
 *
 * Der eigentliche Wert steckt in einem einzigen Knopf: „Rechnung daraus
 * machen". Alles davor ist Verwaltung, die man auch in einem Textdokument
 * hinbekäme; erst die Umwandlung erspart das Abtippen und hält die Spur
 * zwischen Angebot und Rechnung.
 */
export function QuotesTab({ onGoToInvoices }: Props = {}) {
  const { state, setState } = useAppState();
  const [filter, setFilter] = useState<QuoteState | 'alle'>('alle');
  const [suche, setSuche] = useState('');
  const [bearbeitet, setBearbeitet] = useState<Quote | null>(null);
  const [loeschKandidat, setLoeschKandidat] = useState<Quote | null>(null);

  const quotes = useMemo(() => state?.quotes ?? [], [state?.quotes]);
  const zahlen = useMemo(() => kennzahlen(quotes), [quotes]);

  const sichtbar = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return quotes
      .filter((q) => filter === 'alle' || quoteState(q) === filter)
      .filter((q) => {
        if (!s) return true;
        const kunde = state?.customers.find((c) => c.id === q.customerId)?.name ?? '';
        return q.number.toLowerCase().includes(s) || kunde.toLowerCase().includes(s);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [quotes, filter, suche, state?.customers]);

  if (!state) return null;

  const kundeVon = (id: number) => state.customers.find((c) => c.id === id);

  const anlegen = () => {
    const prefix = state.quotePrefix || QUOTE_PREFIX_VORGABE();
    setBearbeitet(neuesAngebot(quotes, prefix, state.issuer.vatRate));
  };

  const speichern = (q: Quote) => {
    setState((s) => {
      if (!s) return s;
      const vorhanden = s.quotes.some((x) => x.id === q.id);
      return {
        ...s,
        quotes: vorhanden ? s.quotes.map((x) => (x.id === q.id ? q : x)) : [...s.quotes, q],
      };
    });
    setBearbeitet(null);
  };

  const setzeStatus = (q: Quote, patch: Partial<Quote>) => {
    setState((s) => s ? { ...s, quotes: s.quotes.map((x) => x.id === q.id ? { ...x, ...patch } : x) } : s);
  };

  const loeschen = (q: Quote) => {
    setState((s) => s ? { ...s, quotes: s.quotes.filter((x) => x.id !== q.id) } : s);
    setLoeschKandidat(null);
  };

  /**
   * Aus dem Angebot wird ein Rechnungs**entwurf** — nicht sofort eine fertige
   * Rechnung. Die Nummer entsteht erst beim Finalisieren, bei eingeschalteter
   * Synchronisierung serverseitig. Hier eine zu vergeben, hiesse den Weg zu
   * umgehen, der Nummerndubletten verhindert.
   */
  const inRechnung = (q: Quote) => {
    const { invoice, quote } = angebotZuRechnungsentwurf(q);
    setState((s) => s ? {
      ...s,
      invoices: [...s.invoices, invoice],
      quotes: s.quotes.map((x) => (x.id === quote.id ? quote : x)),
    } : s);
    onGoToInvoices?.('invoices', invoice.id);
  };

  const pdf = (q: Quote) => {
    const kunde = kundeVon(q.customerId);
    if (!kunde) return;
    void downloadQuotePdf(q, state.issuer, kunde);
  };

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Angebote</h2>
          <p className="mt-1 text-[12px] text-muted">
            Was noch keine Rechnung ist. Aus einem angenommenen Angebot wird per Knopfdruck ein
            Rechnungsentwurf.
          </p>
        </div>
        <button type="button" className="kv-btn kv-btn-primary" onClick={anlegen}>
          <Plus size={14} /> Angebot anlegen
        </button>
      </div>

      {quotes.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kennzahl label="Offen" wert={String(zahlen.offen)} zusatz={euro(zahlen.offenerWert)} />
          <Kennzahl label="Angenommen" wert={String(zahlen.angenommen)} zusatz={euro(zahlen.angenommenerWert)} />
          <Kennzahl label="Abgelehnt / abgelaufen" wert={String(zahlen.abgelehnt + zahlen.abgelaufen)} />
          <Kennzahl
            label="Erfolgsquote"
            wert={zahlen.quote === null ? '—' : `${zahlen.quote} %`}
            zusatz={zahlen.quote === null ? 'noch nichts entschieden' : 'von den entschiedenen'}
          />
        </div>
      )}

      <div className="kv-toolbar mb-4">
        <div className="kv-segmented">
          {FILTER.map((f) => (
            <button
              key={f.id} type="button"
              className="kv-segment" aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="kv-input w-56 pl-8" placeholder="Nummer oder Kunde"
            value={suche} onChange={(e) => setSuche(e.target.value)}
          />
        </div>
      </div>

      {sichtbar.length === 0 ? (
        <p className="kv-card p-8 text-center text-[13px] text-muted">
          {quotes.length === 0
            ? 'Noch keine Angebote. Das erste legst du oben rechts an.'
            : 'Kein Angebot passt zu diesem Filter.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sichtbar.map((q) => {
            const stand = quoteState(q);
            const kunde = kundeVon(q.customerId);
            return (
              <li key={q.id} className="kv-card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{q.number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${STAND_KLASSE[stand]}`}>
                      {QUOTE_STATE_LABEL[stand]}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-muted">
                    {kunde?.name ?? 'Unbekannter Kunde'} · vom {datum(q.createdAt)} · gültig bis {datum(q.validUntil)}
                  </div>
                </div>

                <div className="text-right tabular-nums">
                  <div className="text-lg font-bold text-ink">{euro(q.total)}</div>
                  <div className="text-[10px] text-muted">{q.items.length} Position(en)</div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {q.status === 'draft' && (
                    <button
                      type="button" className="kv-btn kv-btn-outline"
                      onClick={() => setzeStatus(q, { status: 'sent', sentAt: Date.now() })}
                    >
                      <Send size={12} /> Versendet
                    </button>
                  )}
                  {stand === 'sent' || stand === 'expired' ? (
                    <>
                      <button
                        type="button" className="kv-btn kv-btn-outline"
                        onClick={() => setzeStatus(q, { status: 'accepted', decidedAt: Date.now() })}
                      >
                        <Check size={12} /> Angenommen
                      </button>
                      <button
                        type="button" className="kv-btn kv-btn-quiet"
                        onClick={() => setzeStatus(q, { status: 'declined', decidedAt: Date.now() })}
                      >
                        <X size={12} /> Abgelehnt
                      </button>
                    </>
                  ) : null}
                  {istAbrechenbar(q) && q.status !== 'invoiced' && (
                    <button type="button" className="kv-btn kv-btn-primary" onClick={() => inRechnung(q)}>
                      <FileText size={12} /> Rechnung daraus
                    </button>
                  )}
                  {q.status === 'invoiced' && (
                    <span className="text-[11px] text-muted">
                      Rechnungsentwurf angelegt
                    </span>
                  )}
                  <button
                    type="button" className="kv-icon-btn" aria-label={`${q.number} als PDF`}
                    onClick={() => pdf(q)} disabled={!kunde}
                  >
                    <Download size={13} />
                  </button>
                  <button
                    type="button" className="kv-icon-btn" aria-label={`${q.number} bearbeiten`}
                    onClick={() => setBearbeitet(q)}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button" className="kv-icon-btn" aria-label={`${q.number} löschen`}
                    onClick={() => setLoeschKandidat(q)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <QuoteEditModal
        open={bearbeitet !== null}
        quote={bearbeitet}
        onClose={() => setBearbeitet(null)}
        onSave={speichern}
      />

      <ConfirmDeleteModal
        open={loeschKandidat !== null}
        title="Angebot löschen"
        description={
          loeschKandidat
            ? `„${loeschKandidat.number}" wird endgültig entfernt. Ein Angebot ist kein Buchungsbeleg — ` +
              'anders als bei einer Rechnung ist das Löschen hier erlaubt.'
            : ''
        }
        onConfirm={() => loeschKandidat && loeschen(loeschKandidat)}
        onCancel={() => setLoeschKandidat(null)}
      />
    </>
  );
}

function Kennzahl({ label, wert, zusatz }: { label: string; wert: string; zusatz?: string }) {
  return (
    <div className="kv-card p-4">
      <div className="kv-label">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums text-ink">{wert}</div>
      {zusatz && <div className="text-[11px] text-muted">{zusatz}</div>}
    </div>
  );
}
