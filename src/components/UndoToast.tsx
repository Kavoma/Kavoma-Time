import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2 } from 'lucide-react';

interface UndoToastProps {
  /** Text der Meldung; null blendet die Leiste aus. */
  message: string | null;
  onUndo: () => void;
}

/**
 * Kurzlebige Leiste am unteren Rand, die eine Löschung zurückholbar macht.
 *
 * Bewusst kein Dialog: Eine Rückfrage vor jedem Löschen bremst den Normalfall
 * aus, um den seltenen Fehlgriff abzufangen. Umgekehrt herum ist es richtiger.
 */
export function UndoToast({ message, onUndo }: UndoToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="fixed bottom-6 left-1/2 z-[55] flex items-center gap-4 kv-overlay px-4 py-3"
          initial={{ opacity: 0, y: 12, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 12, x: '-50%' }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <span className="text-[13px] text-ink">{message}</span>
          <button
            onClick={onUndo}
            className="kv-btn kv-btn-quiet"
          >
            <Undo2 size={13} />
            Rückgängig
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
