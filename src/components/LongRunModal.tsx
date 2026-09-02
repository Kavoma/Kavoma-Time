import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlarmClock } from 'lucide-react';

interface LongRunModalProps {
  /** Laufzeit in Sekunden; null heißt: keine Warnung offen. */
  seconds: number | null;
  onStop: () => void;
  onKeepRunning: () => void;
}

export function LongRunModal({ seconds, onStop, onKeepRunning }: LongRunModalProps) {
  const hours = seconds === null ? 0 : Math.floor(seconds / 3600);

  return (
    <AnimatePresence>
      {seconds !== null && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 kv-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 mx-4 w-full max-w-sm kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <AlarmClock size={18} />
              </div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
                Läuft seit {hours} Stunden
              </h3>
              <p className="text-[13px] leading-relaxed text-muted">
                Die Zeiterfassung läuft ungewöhnlich lange. Wurde das Stoppen vergessen? Beim
                Stoppen wird die bisherige Zeit als Eintrag gesichert — korrigieren lässt sie sich
                danach immer noch.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onKeepRunning}
                className="kv-btn kv-btn-quiet"
              >
                Weiterlaufen lassen
              </button>
              <button
                onClick={onStop}
                className="kv-btn kv-btn-outline"
              >
                Jetzt stoppen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
