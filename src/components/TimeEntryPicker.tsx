import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock } from 'lucide-react';
import type { TimeEntry, Customer, Project, InvoiceItem } from '../types';

interface Props {
  open: boolean;
  entries: TimeEntry[];
  customers: Customer[];
  projects: Project[];
  customerId: number;
  projectId: number; // 0 = alle Projekte des Kunden
  serviceType: string;
  periodFrom: string; // ISO yyyy-mm-dd
  periodTo: string;
  onConfirm: (items: InvoiceItem[], entryIds: number[]) => void;
  onCancel: () => void;
}

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Multi-Select Sub-Modal: zeigt alle Zeit-Einträge im gewählten Zeitraum
 * für den gewählten Kunden + Projekt. Ausgewählte Einträge werden pro
 * Projekt gruppiert in Items übersetzt (Stundensatz pro Projekt).
 */
export function TimeEntryPicker({
  open,
  entries,
  customers,
  projects,
  customerId,
  projectId,
  serviceType,
  periodFrom,
  periodTo,
  onConfirm,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const customer = customers.find((c) => c.id === customerId);

  const fromTs = useMemo(() => new Date(periodFrom + 'T00:00:00').getTime(), [periodFrom]);
  const toTs = useMemo(() => new Date(periodTo + 'T23:59:59').getTime(), [periodTo]);

  const matched = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            e.customerId === customerId &&
            (projectId === 0 || e.projectId === projectId) &&
            e.startedAt >= fromTs &&
            e.startedAt <= toTs,
        )
        .sort((a, b) => a.startedAt - b.startedAt),
    [entries, customerId, projectId, fromTs, toTs],
  );

  useEffect(() => {
    if (open) setSelected(new Set(matched.map((e) => e.id)));
  }, [open, matched]);

  const toggleAll = () => {
    if (selected.size === matched.length) setSelected(new Set());
    else setSelected(new Set(matched.map((e) => e.id)));
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const rateFor = (entry: TimeEntry): number => {
    // 0 ist ein gültiger Stundensatz (Pro-Bono / interne Tickets) — deshalb
    // nicht falsy-Check, sondern auf null/undefined prüfen, damit ein
    // bewusst auf 0 gesetzter Projekt-Satz nicht fälschlich auf den
    // Kunden-Satz zurückfällt.
    const project = projects.find((p) => p.id === entry.projectId);
    if (project?.hourlyRate != null && Number.isFinite(project.hourlyRate)) {
      return project.hourlyRate;
    }
    if (customer?.hourlyRate != null && Number.isFinite(customer.hourlyRate)) {
      return customer.hourlyRate;
    }
    return 0;
  };

  const confirm = () => {
    const chosen = matched.filter((e) => selected.has(e.id));
    if (chosen.length === 0) {
      onConfirm([], []);
      return;
    }

    // Pro Projekt gruppieren → ein Item pro Projekt-Stundensatz-Block
    const byProject = new Map<number, TimeEntry[]>();
    chosen.forEach((e) => {
      if (!byProject.has(e.projectId)) byProject.set(e.projectId, []);
      byProject.get(e.projectId)!.push(e);
    });

    const items: InvoiceItem[] = Array.from(byProject.entries()).map(([pid, ents]) => {
      const project = projects.find((p) => p.id === pid);
      const rate = project?.hourlyRate ?? customer?.hourlyRate ?? 0;
      const hours = ents.reduce((s, e) => s + e.durationSeconds, 0) / 3600;
      const total = Number((hours * rate).toFixed(2));
      return {
        description: `${serviceType}${project ? ` (${project.name})` : ''} — Zeitraum ${new Date(periodFrom).toLocaleDateString('de-DE')} – ${new Date(periodTo).toLocaleDateString('de-DE')}`,
        quantity: Number(hours.toFixed(2)),
        unit: 'h',
        unitPrice: rate,
        total,
        kind: 'time' as const,
      };
    });

    onConfirm(items, chosen.map((e) => e.id));
  };

  const totalHours = matched
    .filter((e) => selected.has(e.id))
    .reduce((s, e) => s + e.durationSeconds, 0) / 3600;
  const totalAmount = matched
    .filter((e) => selected.has(e.id))
    .reduce((s, e) => s + (e.durationSeconds / 3600) * rateFor(e), 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-divider px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/15">
                  <Clock size={15} className="text-blue-300" />
                </div>
                <div>
                  <div className="text-sm font-bold">Zeit-Einträge auswählen</div>
                  <div className="text-[11px] text-muted">
                    {customer?.name ?? 'Kunde'} · {fmtDate(fromTs)} – {fmtDate(toTs)}
                  </div>
                </div>
              </div>
              <button
                onClick={onCancel}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink"
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-divider bg-paper/40 px-5 py-2 text-[11px]">
              <button
                type="button"
                onClick={toggleAll}
                className="flex cursor-pointer items-center gap-1.5 font-bold uppercase tracking-widest text-muted hover:text-ink"
              >
                <Check
                  size={12}
                  className={selected.size === matched.length && matched.length > 0 ? 'text-green-400' : ''}
                />
                {selected.size === matched.length && matched.length > 0 ? 'Alle abwählen' : 'Alle wählen'}
              </button>
              <div className="text-muted tabular-nums">
                {selected.size} von {matched.length} ausgewählt
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {matched.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
                  <Clock size={24} className="opacity-40" />
                  <div className="text-sm font-bold">Keine Einträge im Zeitraum</div>
                  <div className="text-[11px]">Passe Kunde, Projekt oder Zeitraum an.</div>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {matched.map((e) => {
                    const project = projects.find((p) => p.id === e.projectId);
                    const isSel = selected.has(e.id);
                    const hours = (e.durationSeconds / 3600).toFixed(2);
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => toggleOne(e.id)}
                          className={`flex w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left text-[12px] transition-all ${
                            isSel ? 'border-blue-400/50 bg-blue-500/5' : 'border-divider bg-paper/40 hover:border-ink/30'
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border ${
                              isSel ? 'border-blue-400 bg-blue-400 text-paper' : 'border-divider'
                            }`}
                          >
                            {isSel && <Check size={11} strokeWidth={3} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-ink">
                              {e.description || '(keine Beschreibung)'}
                            </div>
                            <div className="text-[10px] text-muted">
                              {fmtDate(e.startedAt)} · {project?.name ?? 'Kein Projekt'}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right tabular-nums">
                            <div className="font-bold text-ink">{hours} h</div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-divider bg-paper/40 px-5 py-3">
              <div className="text-[11px] text-muted">
                Summe:{' '}
                <span className="font-bold tabular-nums text-ink">
                  {totalHours.toFixed(2)} h · {totalAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted hover:bg-divider hover:text-ink"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirm}
                  disabled={selected.size === 0}
                  className="cursor-pointer rounded-md bg-ink px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Übernehmen ({selected.size})
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
