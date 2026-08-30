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
          className="fixed bottom-6 left-1/2 z-[55] flex items-center gap-4 rounded-lg border border-divider bg-surface px-4 py-3 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]"
          initial={{ opacity: 0, y: 12, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 12, x: '-50%' }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <span className="text-[13px] text-ink">{message}</span>
          <button
            onClick={onUndo}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-accent transition-colors hover:bg-divider"
          >
            <Undo2 size={13} />
            Rückgängig
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
