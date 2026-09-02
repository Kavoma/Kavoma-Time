import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { TimeEntry } from '../types';

interface DeleteModalProps {
  entry: TimeEntry | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteModal({ entry, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Dialog */}
          <motion.div
            className="relative z-10 mx-4 w-full max-w-sm kv-overlay p-0 text-ink"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Icon */}
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft">
                <Trash2 size={18} className="text-danger" />
              </div>

              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
                Eintrag löschen?
              </h3>
              <p className="text-[13px] leading-relaxed text-muted">
                <span className="font-medium text-accent">"{entry.description || '(ohne Beschreibung)'}"</span> wird
                unwiderruflich gelöscht.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold text-muted transition-colors hover:bg-divider hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={onConfirm}
                className="cursor-pointer rounded-md bg-danger-soft px-4 py-2 text-xs font-bold text-danger transition-colors hover:bg-danger-solid hover:text-ink"
              >
                Löschen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
