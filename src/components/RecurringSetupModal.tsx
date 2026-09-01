import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Repeat, X } from 'lucide-react';
import type { RecurringCadence } from '../types';

interface Props {
  open: boolean;
  onConfirm: (cadence: RecurringCadence, dayOfPeriod: number) => void;
  onCancel: () => void;
}

const CADENCE_LABELS: Record<RecurringCadence, string> = {
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  yearly: 'Jährlich',
};

export function RecurringSetupModal({ open, onConfirm, onCancel }: Props) {
  const [cadence, setCadence] = useState<RecurringCadence>('monthly');
  const [day, setDay] = useState(1);

  useEffect(() => {
    if (open) {
      setCadence('monthly');
      setDay(1);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[65] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-scrim backdrop-blur-sm" onClick={onCancel} />
          <motion.div
            className="relative z-10 w-full max-w-md overflow-hidden kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between border-b border-divider px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-info-soft">
                  <Repeat size={15} className="text-info" />
                </div>
                <div>
                  <div className="text-sm font-bold">Wiederkehrende Rechnung einrichten</div>
                  <div className="text-[11px] text-muted">Erstellt automatisch Entwürfe beim App-Start.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Schließen"
                title="Schließen"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-5 py-4">
              <div>
                <label className="mb-2 block kv-label">
                  Rhythmus
                </label>
                <div className="flex gap-1 rounded-md border border-divider bg-paper p-1">
                  {(Object.keys(CADENCE_LABELS) as RecurringCadence[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCadence(c)}
                      className={`flex-1 cursor-pointer rounded px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                        cadence === c ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {CADENCE_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block kv-label">
                  Tag im {cadence === 'monthly' ? 'Monat' : cadence === 'quarterly' ? 'Quartal' : 'Jahr (Monat 1)'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={day}
                  onChange={(e) => setDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="h-10 w-24 rounded-md border border-divider bg-paper px-3 text-sm tabular-nums text-ink outline-none focus:border-accent font-bold"
                />
                <div className="mt-1 text-[10px] text-muted">
                  Maximal 28, um Konflikte mit kurzen Monaten (Februar) zu vermeiden.
                </div>
              </div>

              <div className="rounded-md border border-info-line bg-info-soft px-3 py-2 text-[11px] text-info">
                Die App muss zum Stichtag laufen, damit der Entwurf erzeugt wird. Verpasste Zyklen
                werden beim nächsten Start nachgeholt (maximal 12 Perioden auf einmal).
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-5 py-3">
              <button
                onClick={onCancel}
                className="cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted hover:bg-divider hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={() => onConfirm(cadence, day)}
                className="cursor-pointer rounded-md bg-ink px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent active:scale-95"
              >
                Einrichten
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
