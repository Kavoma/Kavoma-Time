import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { Quote } from '../../types';
import { useAppState } from '../../state/AppStateContext';
import { InvoiceItemsTable } from '../InvoiceItemsTable';
import { summiere } from '../../utils/quotes';

interface Props {
  open: boolean;
  quote: Quote | null;
  onClose: () => void;
  onSave: (quote: Quote) => void;
}

/** `<input type="date">` will JJJJ-MM-TT aus den Kalenderfeldern, nicht aus UTC. */
function alsFeldwert(ts: number): string {
  const d = new Date(ts);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function ausFeldwert(wert: string, rueckfall: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  if (!m) return rueckfall;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/**
 * Angebot anlegen und bearbeiten.
 *
 * Bewusst schlanker als die Rechnungsmaske: kein Leistungszeitraum, keine
 * Zeiterfassungs-Übernahme, keine Fälligkeit. Ein Angebot beschreibt, was
 * gemacht werden **soll** — es gibt noch keine geleistete Zeit, die man
 * übernehmen könnte.
 */
export function QuoteEditModal({ open, quote, onClose, onSave }: Props) {
  const { state } = useAppState();
  const [entwurf, setEntwurf] = useState<Quote | null>(null);
  const [gueltig, setGueltig] = useState('');

  useEffect(() => {
    if (open && quote) {
      setEntwurf({ ...quote, items: quote.items.map((i) => ({ ...i })) });
      setGueltig(alsFeldwert(quote.validUntil));
    }
  }, [open, quote]);

  if (!open || !entwurf || !state) return null;

  const kunden = state.customers.filter((c) => c.status !== 'archived' || c.id === entwurf.customerId);
  const projekte = state.projects.filter((p) => p.customerId === entwurf.customerId);
  const summen = summiere(entwurf.items, entwurf.vatRate);
  const kannSpeichern = entwurf.customerId > 0 && entwurf.items.length > 0;

  const speichern = () => {
    if (!kannSpeichern) return;
    onSave({
      ...entwurf,
      ...summen,
      validUntil: ausFeldwert(gueltig, entwurf.validUntil),
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <div className="kv-scrim absolute inset-0" onClick={onClose} />
        <motion.div
          role="dialog" aria-modal="true" aria-label="Angebot bearbeiten"
          className="kv-overlay relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        >
          <header className="flex items-center justify-between border-b border-divider px-5 py-3">
            <div>
              <h2 className="font-display text-lg font-black tracking-tight">
                Angebot {entwurf.number}
              </h2>
              <p className="text-[11px] text-muted">
                {entwurf.status === 'draft' ? 'Entwurf' : 'Bereits versendet — Änderungen wirken auf das PDF'}
              </p>
            </div>
            <button type="button" className="kv-icon-btn" aria-label="Schließen" onClick={onClose}>
              <X size={16} />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="kv-label">Kunde</span>
                <select
                  className="kv-input mt-1 w-full"
                  value={entwurf.customerId}
                  onChange={(e) => setEntwurf({
                    ...entwurf,
                    customerId: Number(e.target.value),
                    // Ein Projekt eines anderen Kunden wäre nach dem Wechsel falsch.
                    projectId: null,
                  })}
                >
                  <option value={0}>Bitte wählen …</option>
                  {kunden.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="kv-label">Projekt (optional)</span>
                <select
                  className="kv-input mt-1 w-full"
                  value={entwurf.projectId ?? ''}
                  onChange={(e) => setEntwurf({
                    ...entwurf,
                    projectId: e.target.value ? Number(e.target.value) : null,
                  })}
                >
                  <option value="">Ohne Projekt</option>
                  {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="kv-label">Gültig bis</span>
                <input
                  type="date" className="kv-input mt-1 w-full"
                  value={gueltig} onChange={(e) => setGueltig(e.target.value)}
                />
              </label>
            </div>

            <InvoiceItemsTable
              items={entwurf.items}
              onChange={(next) => setEntwurf({ ...entwurf, items: next })}
            />

            <label className="block">
              <span className="kv-label">Anmerkungen (erscheinen im PDF)</span>
              <textarea
                className="kv-input mt-1 h-24 w-full resize-y py-2"
                value={entwurf.notes}
                onChange={(e) => setEntwurf({ ...entwurf, notes: e.target.value })}
                placeholder="z. B. Annahmen, Ausschlüsse, Lieferzeit"
              />
            </label>

            <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-muted">Zwischensumme</dt>
                <dd className="tabular-nums">{summen.subtotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</dd>
              </div>
              {entwurf.vatRate > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">zzgl. {entwurf.vatRate} % USt.</dt>
                  <dd className="tabular-nums">{summen.vatAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-divider pt-1.5">
                <dt className="text-[11px] font-bold uppercase tracking-widest text-muted">Angebotssumme</dt>
                <dd className="text-base font-bold tabular-nums text-ink">
                  {summen.total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </dd>
              </div>
            </dl>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3">
            <p className="text-[11px] text-muted">
              {kannSpeichern ? '' : 'Kunde und mindestens eine Position sind nötig.'}
            </p>
            <div className="flex gap-2">
              <button type="button" className="kv-btn kv-btn-quiet" onClick={onClose}>Abbrechen</button>
              <button type="button" className="kv-btn kv-btn-primary" disabled={!kannSpeichern} onClick={speichern}>
                Speichern
              </button>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
