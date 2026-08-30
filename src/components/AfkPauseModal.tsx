import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coffee } from 'lucide-react';
import type { DetectedPause } from '../types';

interface AfkPauseModalProps {
  pause: DetectedPause | null;
  /** Pause abziehen — und dabei entweder weiterlaufen oder stoppen. */
  onSubtract: (continueRunning: boolean) => void;
  /** Zeit behalten, es war doch Arbeitszeit. */
  onKeep: () => void;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLength(pause: DetectedPause): string {
  const minutes = Math.max(1, Math.round((pause.ended - pause.began) / 60000));
  if (minutes < 60) return `${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} Stunden` : `${hours} Std. ${rest} Min.`;
}

// Der Text muss zum Grund passen: „unbenutzt" stimmt nicht, wenn der Deckel
// zu war, und „im Ruhezustand" stimmt nicht, wenn nur niemand getippt hat.
function describeReason(reason: DetectedPause['reason']): string {
  if (reason === 'sleep') return 'war im Ruhezustand';
  if (reason === 'lock') return 'war gesperrt';
  return 'wurde nicht benutzt';
}

export function AfkPauseModal({ pause, onSubtract, onKeep }: AfkPauseModalProps) {
  return (
    <AnimatePresence>
      {pause && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 mx-4 w-full max-w-md rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Coffee size={18} />
              </div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">Pause erkannt</h3>
              <p className="text-[13px] leading-relaxed text-muted">
                Der Rechner {describeReason(pause.reason)} — {formatLength(pause)} von{' '}
                <span className="font-bold text-ink">{formatClock(pause.began)}</span> bis{' '}
                <span className="font-bold text-ink">{formatClock(pause.ended)}</span>, während die
                Zeiterfassung lief.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Beim Abziehen endet der bisherige Eintrag um {formatClock(pause.began)}. Wird
                weitergearbeitet, entsteht ab {formatClock(pause.ended)} ein zweiter Eintrag mit
                denselben Angaben.
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={() => onSubtract(true)}
                className="w-full cursor-pointer rounded-md bg-accent/15 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-accent transition-all hover:bg-accent hover:text-white active:scale-95"
              >
                Abziehen und weiterarbeiten
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => onSubtract(false)}
                  className="flex-1 cursor-pointer rounded-md border border-divider px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition-colors hover:bg-divider"
                >
                  Abziehen und stoppen
                </button>
                <button
                  onClick={onKeep}
                  className="flex-1 cursor-pointer rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted transition-colors hover:bg-divider hover:text-ink"
                >
                  Zeit behalten
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
