import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban } from 'lucide-react';
import { Invoice } from '../types';

interface Props {
  invoice: Invoice | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function CancelInvoiceModal({ invoice, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => { if (invoice) setReason(''); }, [invoice]);

  return (
    <AnimatePresence>
      {invoice && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-sm"
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
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-warning-soft">
                <Ban size={18} className="text-warning" />
              </div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">Rechnung stornieren</h3>
              <p className="mb-4 text-[13px] leading-relaxed text-muted">
                Es wird automatisch eine Storno-Rechnung (negativer Betrag) angelegt. Die Original-Rechnung bleibt zur Dokumentation erhalten — GoBD-konform.
              </p>
              <div className="rounded-md border border-divider bg-paper p-3 text-xs">
                <div className="text-muted">Original-Rechnung</div>
                <div className="mt-1 font-bold tabular-nums">{invoice.number} · {invoice.total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
              </div>
              <label className="mt-4 mb-2 block kv-label">Stornogrund (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="z. B. Falscher Betrag / Adresse / nicht zustande gekommen"
                autoFocus
                className="w-full resize-none rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
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
                onClick={() => onConfirm(reason.trim())}
                className="cursor-pointer rounded-md bg-warning-soft px-4 py-2 text-xs font-bold uppercase tracking-widest text-warning transition-all hover:bg-warning-solid hover:text-ink active:scale-95"
              >
                Stornieren
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
