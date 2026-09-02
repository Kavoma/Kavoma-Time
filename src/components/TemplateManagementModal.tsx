import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, X, Trash2, Repeat, Calendar } from 'lucide-react';
import type { InvoiceTemplate, RecurringInvoice, Customer } from '../types';

interface Props {
  open: boolean;
  templates: InvoiceTemplate[];
  recurrings: RecurringInvoice[];
  customers: Customer[];
  onDelete: (templateId: string) => void;
  onDeleteRecurring: (recurringId: string) => void;
  onToggleRecurring: (recurringId: string) => void;
  onClose: () => void;
}

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('de-DE');
const fmtEuro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export function TemplateManagementModal({
  open, templates, recurrings, customers, onDelete, onDeleteRecurring, onToggleRecurring, onClose,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 kv-scrim" onClick={onClose} />
          <motion.div
            className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center justify-between border-b border-divider px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15">
                  <Bookmark size={15} className="text-violet-300" />
                </div>
                <div>
                  <div className="text-sm font-bold">Rechnungs-Vorlagen</div>
                  <div className="text-[11px] text-muted">
                    {templates.length} Vorlage{templates.length === 1 ? '' : 'n'} · {recurrings.length} Wiederkehrend
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                title="Schließen"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {templates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
                  <Bookmark size={28} className="opacity-40" />
                  <div className="text-sm font-bold">Noch keine Vorlagen</div>
                  <div className="max-w-xs text-[11px]">
                    Beim Erstellen einer Rechnung kannst du im Bereich „Vorlagen &amp; Wiederkehrend" den aktuellen Stand speichern.
                  </div>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {templates.map((t) => {
                    const customer = customers.find((c) => c.id === t.customerId);
                    const subtotal = t.items.reduce((s, it) => s + it.total, 0);
                    const templateRecurrings = recurrings.filter((r) => r.templateId === t.id);
                    return (
                      <li
                        key={t.id}
                        className="rounded-lg border border-divider bg-paper/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Bookmark size={13} className="text-violet-300" />
                              <span className="text-sm font-bold">{t.name}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                              <span>{customer?.name ?? 'Kein Kunde'}</span>
                              <span>·</span>
                              <span>{t.items.length} Position{t.items.length === 1 ? '' : 'en'}</span>
                              <span>·</span>
                              <span className="tabular-nums">{fmtEuro(subtotal)}</span>
                              <span>·</span>
                              <span>Fällig: {t.dueDays} Tage</span>
                            </div>
                          </div>

                          {confirmDeleteId === t.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="kv-btn kv-btn-quiet"
                              >
                                Nein
                              </button>
                              <button
                                onClick={() => {
                                  templateRecurrings.forEach((r) => onDeleteRecurring(r.id));
                                  onDelete(t.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="kv-btn kv-btn-danger"
                              >
                                Endgültig
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(t.id)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                              title="Vorlage löschen"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        {templateRecurrings.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1 rounded-md border border-divider bg-surface/60 p-2">
                            {templateRecurrings.map((r) => (
                              <div key={r.id} className="flex items-center justify-between text-[11px]">
                                <div className="flex items-center gap-2">
                                  <Repeat size={11} className={r.active ? 'text-info' : 'text-muted'} />
                                  <span className="font-bold uppercase tracking-widest text-muted">
                                    {r.cadence === 'monthly' ? 'Monatlich' : r.cadence === 'quarterly' ? 'Quartal' : 'Jährlich'}
                                  </span>
                                  <span className="text-muted">Tag {r.dayOfPeriod}</span>
                                  <Calendar size={10} className="text-muted" />
                                  <span className="text-muted tabular-nums">nächste Fälligkeit: {fmtDate(r.nextDueAt)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => onToggleRecurring(r.id)}
                                    className={`cursor-pointer rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${ r.active ? 'bg-info-soft text-info hover:bg-info-soft' : 'bg-neutral-soft text-muted hover:bg-neutral-soft' }`}
                                  >
                                    {r.active ? 'Aktiv' : 'Pausiert'}
                                  </button>
                                  <button
                                    onClick={() => onDeleteRecurring(r.id)}
                                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-divider px-5 py-3 text-right">
              <button
                onClick={onClose}
                className="kv-btn kv-btn-primary"
              >
                Schließen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
