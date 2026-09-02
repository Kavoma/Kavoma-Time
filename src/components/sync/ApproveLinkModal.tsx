import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, Laptop, Loader2, MonitorSmartphone, X } from 'lucide-react';

export interface LinkAnfrage {
  id: string;
  name: string;
  platform: string;
}

interface Props {
  anfrage: LinkAnfrage | null;
  onClose: () => void;
}

const PLATTFORM: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

/**
 * Erscheint auf dem eingerichteten Gerät, sobald ein anderes sich verbinden will.
 *
 * Die Zahl wird hier **eingetippt, nicht angezeigt**. Stünde sie auf beiden
 * Bildschirmen, könnte man sie blind abnicken — der ganze Sinn ist, dass sie vom
 * anderen Gerät kommt und hier verglichen wird.
 */
export function ApproveLinkModal({ anfrage, onClose }: Props) {
  const [ziffern, setZiffern] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const eingabeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!anfrage) return;
    setZiffern(''); setFehler(null); setFertig(false);
    // Mit der eigenen öffentlichen Hälfte antworten — erst dadurch kann das
    // andere Gerät die Zahl überhaupt anzeigen. Der Schlüssel folgt erst nach
    // der Bestätigung unten.
    window.api?.syncRespondLink(anfrage.id).catch((e) => setFehler(e?.message ?? 'Anfrage nicht erreichbar.'));
    const t = setTimeout(() => eingabeRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [anfrage]);

  if (!anfrage) return null;

  const bestaetigen = async () => {
    setLaeuft(true); setFehler(null);
    try {
      await window.api!.syncApproveLink(anfrage.id, ziffern);
      setFertig(true);
      setTimeout(onClose, 1400);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Bestätigen fehlgeschlagen.');
      setZiffern('');
      eingabeRef.current?.focus();
    } finally { setLaeuft(false); }
  };

  const ablehnen = async () => {
    await window.api?.syncRejectLink(anfrage.id).catch(() => {});
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[60] flex items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
        <motion.div className="absolute inset-0 kv-scrim" />
        <motion.div
          className="relative z-10 mx-4 w-full max-w-md kv-overlay text-ink"
          initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.15, ease: 'easeOut' }}>

          <header className="flex items-center gap-2 border-b border-divider px-5 py-4">
            <MonitorSmartphone size={16} className="text-accent" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Neues Gerät verbinden</h2>
          </header>

          {fertig ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
                <Check size={22} className="text-success" />
              </div>
              <p className="text-sm font-bold">Verbunden</p>
              <p className="max-w-xs text-xs leading-relaxed text-muted">
                „{anfrage.name}" gleicht ab sofort mit ab.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-center gap-3 rounded-md border border-divider bg-paper px-3 py-2.5">
                  <Laptop size={15} className="shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">{anfrage.name}</div>
                    <div className="text-[11px] text-muted">{PLATTFORM[anfrage.platform] ?? anfrage.platform}</div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted">
                  Auf dem anderen Gerät steht eine sechsstellige Zahl. Tippe sie hier ein.
                </p>

                <input
                  ref={eingabeRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  value={ziffern}
                  placeholder="——————"
                  onChange={(e) => { setZiffern(e.target.value.replace(/\D/g, '').slice(0, 6)); setFehler(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && ziffern.length === 6) bestaetigen(); }}
                  className="h-16 w-full rounded-md border border-divider bg-paper text-center font-display text-3xl font-bold tabular-nums tracking-[0.4em] text-ink outline-none placeholder:tracking-[0.3em] placeholder:text-muted/40 focus:border-accent"
                />

                <p className="text-[11px] leading-relaxed text-muted">
                  Stimmen die Zahlen nicht überein, brich ab. Sie werden auf beiden Geräten
                  unabhängig berechnet — weichen sie voneinander ab, redet nicht dein Gerät
                  mit deinem Gerät.
                </p>

                {fehler && (
                  <p className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {fehler}
                  </p>
                )}
              </div>

              <footer className="flex justify-end gap-2 border-t border-divider px-5 py-4">
                <button type="button" onClick={ablehnen} disabled={laeuft}
                  className="flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold text-muted transition-colors hover:text-danger disabled:opacity-40">
                  <X size={13} /> Ablehnen
                </button>
                <button type="button" onClick={bestaetigen} disabled={laeuft || ziffern.length !== 6}
                  className="flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-xs font-bold text-paper disabled:opacity-40">
                  {laeuft ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Verbinden
                </button>
              </footer>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
