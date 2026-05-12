import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Invoice, DunningReminder } from '../types';

interface Props {
  invoice: Invoice | null;
  onConfirm: (reminder: DunningReminder) => void;
  onCancel: () => void;
}

const LEVEL_DEFAULTS: Record<1 | 2 | 3, { fee: number; label: string }> = {
  1: { fee: 0,    label: '1. Zahlungserinnerung' },
  2: { fee: 5,    label: '2. Mahnung' },
  3: { fee: 10,   label: '3. Letzte Mahnung' },
};

export function DunningModal({ invoice, onConfirm, onCancel }: Props) {
  const [fee, setFee]     = useState('0');
  const [notes, setNotes] = useState('');

  // Nächstes Level basierend auf bisherigen Mahnungen
  const nextLevel: 1 | 2 | 3 = (() => {
    if (!invoice) return 1;
    const highest = invoice.reminders.reduce((m, r) => Math.max(m, r.level), 0);
    return (Math.min(highest + 1, 3) as 1 | 2 | 3);
  })();

  useEffect(() => {
    if (invoice) {
      setFee(String(LEVEL_DEFAULTS[nextLevel].fee));
      setNotes('');
    }
  }, [invoice, nextLevel]);

  const submit = () => {
    if (!invoice) return;
    const feeNum = parseFloat(fee.replace(',', '.'));
    onConfirm({
      level: nextLevel,
      sentAt: Date.now(),
      fee: !isNaN(feeNum) && feeNum > 0 ? feeNum : 0,
      notes: notes.trim() || undefined,
    });
  };

  const daysOverdue = invoice ? Math.floor((Date.now() - invoice.dueDate) / 86_400_000) : 0;

  return (
    <AnimatePresence>
      {invoice && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 w-full max-w-md rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">{LEVEL_DEFAULTS[nextLevel].label}</h3>
              <p className="text-[13px] leading-relaxed text-muted">
                Rechnung <strong className="text-ink">{invoice.number}</strong> ist seit <strong className="text-ink">{Math.max(0, daysOverdue)} Tagen</strong> überfällig.
              </p>

              <div className="mt-4 rounded-md border border-divider bg-paper p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Bisherige Mahnungen</div>
                {invoice.reminders.length === 0 ? (
                  <div className="mt-1 text-xs text-muted">Noch keine</div>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs tabular-nums">
                    {invoice.reminders.map((r, i) => (
                      <li key={i} className="text-muted">
                        Stufe {r.level} · {new Date(r.sentAt).toLocaleDateString('de-DE')} · {r.fee.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="mt-4 mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Mahngebühr (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="w-full rounded-md border border-divider bg-paper px-3 py-2 text-sm tabular-nums text-ink outline-none focus:border-accent"
              />

              <label className="mt-3 mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Notiz</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
                className="w-full rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted transition-colors hover:bg-divider hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                className="cursor-pointer rounded-md bg-red-500/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-400 transition-all hover:bg-red-500 hover:text-white active:scale-95"
              >
                Mahnung verbuchen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
