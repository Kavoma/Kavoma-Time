import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Calendar } from 'lucide-react';
import { Invoice, DunningReminder } from '../types';
import { DatePicker } from './DatePicker';

interface Props {
  invoice: Invoice | null;
  onConfirm: (reminder: DunningReminder) => void;
  onCancel: () => void;
}

const LEVEL_DEFAULTS: Record<1 | 2 | 3, { fee: number; label: string }> = {
  1: { fee: 0,    label: 'Zahlungserinnerung' },
  2: { fee: 5,    label: '1. Mahnung' },
  3: { fee: 10,   label: '2. Mahnung (Letzte)' },
};

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function DunningModal({ invoice, onConfirm, onCancel }: Props) {
  const [fee, setFee]     = useState('0');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 7));

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
      setDueDate(addDaysISO(todayISO(), 7));
    }
  }, [invoice, nextLevel]);

  const submit = () => {
    if (!invoice) return;
    const feeNum = parseFloat(fee.replace(',', '.'));
    onConfirm({
      level: nextLevel,
      sentAt: Date.now(),
      newDueDate: new Date(dueDate + 'T12:00:00').getTime(),
      fee: !isNaN(feeNum) && feeNum > 0 ? feeNum : 0,
      notes: notes.trim() || undefined,
    });
  };

  const daysOverdue = invoice ? Math.floor((Date.now() - invoice.dueDate) / 86_400_000) : 0;
  const currentFees = invoice?.reminders.reduce((sum, r) => sum + r.fee, 0) || 0;
  const feeNum = parseFloat(fee.replace(',', '.'));
  const newTotal = (invoice?.total || 0) + currentFees + (isNaN(feeNum) ? 0 : feeNum);

  const fmtEuro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <AnimatePresence>
      {invoice && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 kv-scrim"
            onClick={onCancel}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 w-full max-w-md kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft">
                <AlertTriangle size={18} className="text-danger" />
              </div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">{LEVEL_DEFAULTS[nextLevel].label}</h3>
              <p className="text-[13px] leading-relaxed text-muted">
                Rechnung <strong className="text-ink">{invoice.number}</strong> ist seit <strong className="text-ink">{Math.max(0, daysOverdue)} Tagen</strong> überfällig.
              </p>

              <div className="mt-4 rounded-md border border-divider bg-paper p-3">
                <div className="kv-label">Zusammenfassung</div>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-muted">
                    <span>Rechnungsbetrag:</span>
                    <span className="font-bold text-ink">{fmtEuro(invoice.total)}</span>
                  </div>
                  {currentFees > 0 && (
                    <div className="flex justify-between text-muted">
                      <span>Bisherige Gebühren:</span>
                      <span className="font-bold text-ink">{fmtEuro(currentFees)}</span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t border-divider pt-1 text-sm font-bold text-danger">
                    <span>Gesamtforderung neu:</span>
                    <span>{fmtEuro(newTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 block kv-label">
                    {nextLevel === 1 ? 'Bearbeitungsgebühr' : 'Mahngebühr'} (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="h-11 rounded-md border border-divider bg-paper px-3 text-sm font-bold tabular-nums text-ink outline-none focus:border-accent"
                  />
                  <span className="mt-1 text-[9px] text-muted italic">Umsatzsteuerfrei gemäß BGB</span>
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 block kv-label">Neue Frist bis</label>
                  <DatePicker value={dueDate} onChange={setDueDate} />
                </div>
              </div>

              <label className="mt-4 mb-2 block kv-label">Interne Notiz</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
                className="h-11 w-full rounded-md border border-divider bg-paper px-3 text-sm font-bold text-ink placeholder:text-muted outline-none focus:border-accent"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="kv-btn kv-btn-quiet"
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                className="kv-btn kv-btn-danger"
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
