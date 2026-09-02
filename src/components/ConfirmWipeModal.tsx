import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ConfirmWipeModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_PHRASE = 'LÖSCHEN';

export function ConfirmWipeModal({ open, onConfirm, onCancel }: ConfirmWipeModalProps) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!open) setInput('');
  }, [open]);

  const matches = input.trim() === CONFIRM_PHRASE;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 kv-scrim"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 mx-4 w-full max-w-sm rounded-lg border border-danger-line bg-surface p-0 text-ink shadow-[0_25px_60px_-12px_rgba(127,29,29,0.45)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmWipeTitle"
          >
            <div className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle size={18} />
              </div>
              <h3 id="confirmWipeTitle" className="mb-1.5 text-sm font-bold uppercase tracking-wide">Alle Daten löschen?</h3>
              <p className="text-[13px] leading-relaxed text-muted">
                Diese Aktion entfernt unwiderruflich <strong className="text-ink">alle</strong> in dieser App
                gespeicherten Daten: Zeiteinträge, Kunden, Projekte, Rechnungen sowie den lokalen Verschlüsselungsschlüssel.
                Anschließend startet die App neu.
              </p>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Tippe <span className="font-mono font-bold text-danger">{CONFIRM_PHRASE}</span> zum Bestätigen:
              </p>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="mt-2 w-full rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-danger-line focus:outline-none"
                placeholder={CONFIRM_PHRASE}
                aria-label={`Bitte ${CONFIRM_PHRASE} eingeben`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold text-muted transition-colors hover:bg-divider hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={onConfirm}
                disabled={!matches}
                className="cursor-pointer rounded-md bg-danger-soft px-4 py-2 text-xs font-bold text-danger transition-colors hover:bg-danger-solid hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-danger-soft disabled:hover:text-danger"
              >
                Endgültig löschen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
