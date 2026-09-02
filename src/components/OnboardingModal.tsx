import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, HardDrive, RefreshCw, FileText } from 'lucide-react';
import { Checkbox } from './Checkbox';

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
  onOpenPrivacy: () => void;
}

export function OnboardingModal({ open, onComplete, onOpenPrivacy }: OnboardingModalProps) {
  const [autoUpdates, setAutoUpdates] = useState<boolean>(true);
  const [agreed, setAgreed] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    const fn = window.api?.getAutoUpdateEnabled;
    if (typeof fn !== 'function') return;
    fn().then(setAutoUpdates).catch(() => undefined);
  }, [open]);

  const submit = async () => {
    if (!agreed) return;
    try {
      await window.api?.setAutoUpdateEnabled?.(autoUpdates);
    } catch (e) {
      console.error(e);
    }
    try {
      await window.api?.setOnboardingCompleted?.();
      onComplete();
    } catch (e) {
      console.error('Onboarding-Status konnte nicht persistiert werden:', e);
      // Bewusst kein onComplete() — sonst sieht der Nutzer das Modal beim
      // nächsten Start wieder, weil der Status nicht gespeichert wurde.
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 kv-scrim" />

          <motion.div
            className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-divider bg-surface text-ink shadow-[0_30px_80px_-12px_rgba(0,0,0,0.75)]"
            initial={{ opacity: 0, scale: 0.95, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 18 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label="Willkommen bei Kavoma Time"
          >
            <div className="border-b border-divider px-7 py-5">
              <div className="kv-label">Willkommen</div>
              <h2 className="mt-1 font-display text-2xl font-black tracking-tight">Kavoma Time</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Bevor es losgeht — kurz, was du über deine Daten wissen solltest.
              </p>
            </div>

            <div className="overflow-y-auto px-7 py-6">
              <ul className="space-y-4 text-[13px] leading-relaxed text-muted">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                    <HardDrive size={15} />
                  </span>
                  <div>
                    <div className="font-bold text-ink">Deine Daten bleiben lokal.</div>
                    Zeiten, Kunden und Rechnungen werden ausschließlich auf diesem Rechner gespeichert
                    (verschlüsselt mit AES-256 und an dein Windows-Benutzerkonto gebunden).
                    Es findet keine Übertragung an uns oder Drittanbieter statt.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                    <RefreshCw size={15} />
                  </span>
                  <div>
                    <div className="font-bold text-ink">Automatische Update-Prüfung</div>
                    Standardmäßig prüft die App beim Start auf neue Versionen via GitHub.
                    Dabei werden IP-Adresse, ein User-Agent und die App-Version übertragen.
                    Du kannst das jederzeit in den Einstellungen ändern.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                    <ShieldCheck size={15} />
                  </span>
                  <div>
                    <div className="font-bold text-ink">Deine Rechte</div>
                    Du kannst deine Daten jederzeit exportieren (verschlüsselt oder als offenes JSON)
                    oder vollständig löschen — beides in den Einstellungen.
                  </div>
                </li>
              </ul>

              <div className="mt-6 rounded-lg border border-divider bg-paper/50 p-4">
                <label className="flex cursor-pointer items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-ink">Automatische Updates beim Start prüfen</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      Empfohlen für Sicherheits- und Funktions-Updates. Übertragung an GitHub (IP, User-Agent, Version).
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoUpdates}
                    onClick={() => setAutoUpdates(!autoUpdates)}
                    className={`relative mt-1 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${autoUpdates ? 'bg-ink' : 'bg-divider'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${autoUpdates ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </label>
              </div>

              <Checkbox
                checked={agreed}
                onChange={setAgreed}
                className="mt-4 items-start"
                label={
                  <span>
                    Ich habe die{' '}
                    <button
                      type="button"
                      onClick={onOpenPrivacy}
                      className="cursor-pointer text-ink underline decoration-divider underline-offset-2 hover:decoration-ink"
                    >
                      Datenschutzerklärung
                    </button>{' '}
                    zur Kenntnis genommen und stimme dem geschilderten Umgang mit meinen Daten zu.
                  </span>
                }
              />
            </div>

            <div className="flex justify-end border-t border-divider px-7 py-4">
              <button
                onClick={submit}
                disabled={!agreed}
                className="cursor-pointer rounded-md bg-ink px-6 py-2.5 text-xs font-bold text-paper transition-colors hover:bg-paper hover:text-ink hover:ring-2 hover:ring-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-paper disabled:hover:ring-0"
              >
                Verstanden & loslegen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
