import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database } from 'lucide-react';

interface ConfirmRestoreModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmRestoreModal({ open, onConfirm, onCancel }: ConfirmRestoreModalProps) {
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
            className="relative z-10 mx-4 w-full max-w-sm kv-overlay p-0 text-ink"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Database size={18} />
              </div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">Backup einspielen?</h3>
              <p className="text-[13px] leading-relaxed text-muted">
                Möchtest du wirklich alle aktuellen Daten mit diesem Backup überschreiben? 
                Dieser Vorgang kann nicht rückgängig gemacht werden.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="kv-btn kv-btn-quiet"
              >
                Abbrechen
              </button>
              <button
                onClick={onConfirm}
                className="kv-btn kv-btn-outline"
              >
                Wiederherstellen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
