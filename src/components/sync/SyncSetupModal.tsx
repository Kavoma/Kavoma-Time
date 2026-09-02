import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, Check, Copy, KeyRound, Laptop, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import type { SyncStatus } from '../../sync/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (status: SyncStatus) => void;
}

type Schritt = 'anmelden' | 'notfallcode' | 'verbinden' | 'notfallcode-eingeben';

/**
 * Einrichtung ohne Passphrase.
 *
 * Erstes Gerät: anmelden, Wiederherstellungscode sichern, fertig.
 * Zweites Gerät: anmelden, sechsstellige Zahl am ersten Gerät bestätigen.
 *
 * Bewusst **ohne Registrierung** — es gibt genau ein Konto, und das wird in der
 * Supabase-Konsole angelegt. Ein Registrieren-Knopf würde eine Möglichkeit
 * vorspiegeln, die serverseitig abgeschaltet ist.
 */
export function SyncSetupModal({ open, onClose, onDone }: Props) {
  const [schritt, setSchritt] = useState<Schritt>('anmelden');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [code, setCode] = useState('');
  const [codeGesichert, setCodeGesichert] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [zahl, setZahl] = useState<string | null>(null);
  const [notfallEingabe, setNotfallEingabe] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSchritt('anmelden'); setEmail(''); setPasswort(''); setCode('');
    setCodeGesichert(false); setKopiert(false); setZahl(null);
    setNotfallEingabe(''); setFehler(null);
  }, [open]);

  // Die Zahl kann erst erscheinen, wenn das andere Gerät geantwortet hat.
  useEffect(() => {
    if (schritt !== 'verbinden') return;
    const abCode = window.api?.onSyncLinkCode?.(({ code: c }) => setZahl(c));
    const abFertig = window.api?.onSyncLinkDone?.(async ({ ok, error }) => {
      if (!ok) { setFehler(error ?? 'Verbinden fehlgeschlagen.'); return; }
      const status = await window.api!.syncGetStatus();
      onDone(status);
      onClose();
    });
    return () => { abCode?.(); abFertig?.(); };
  }, [schritt, onDone, onClose]);

  useEffect(() => {
    if (!open && schritt === 'verbinden') window.api?.syncCancelLink?.();
  }, [open, schritt]);

  const anmelden = async () => {
    setLaeuft(true); setFehler(null);
    try {
      await window.api?.syncSignIn(email.trim(), passwort);
      const vorhanden = await window.api?.syncHasKeys();
      if (vorhanden) {
        setSchritt('verbinden');
        await window.api?.syncStartLink();
      } else {
        const { recoveryCode } = await window.api!.syncInitializeKey();
        setCode(recoveryCode);
        setSchritt('notfallcode');
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.');
    } finally { setLaeuft(false); }
  };

  const mitNotfallcode = async () => {
    setLaeuft(true); setFehler(null);
    try {
      await window.api!.syncCancelLink();
      const status = await window.api!.syncUnlock(notfallEingabe);
      onDone(status);
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Code wurde nicht angenommen.');
    } finally { setLaeuft(false); }
  };

  const abschliessen = async () => {
    const status = await window.api!.syncGetStatus();
    onDone(status);
    onClose();
  };

  const schliessen = () => { void window.api?.syncCancelLink?.(); onClose(); };

  const feld = 'h-10 w-full rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent';
  const knopf = 'flex h-10 items-center justify-center gap-2 rounded-md px-4 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-40';

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div className="absolute inset-0 kv-scrim" onClick={laeuft ? undefined : schliessen}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />

          <motion.div
            className="relative z-10 mx-4 w-full max-w-md kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.15, ease: 'easeOut' }}>

            <header className="flex items-center gap-2 border-b border-divider px-5 py-4">
              <ShieldCheck size={16} className="text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Synchronisierung einrichten</h2>
            </header>

            <div className="space-y-4 px-5 py-5">
              {schritt === 'anmelden' && (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    Melde dich mit dem Konto an, unter dem deine Geräte zusammenlaufen sollen.
                  </p>
                  <div className="space-y-2">
                    <input className={feld} type="email" placeholder="E-Mail" value={email} autoFocus
                      onChange={(e) => setEmail(e.target.value)} />
                    <input className={feld} type="password" placeholder="Passwort" value={passwort}
                      onChange={(e) => setPasswort(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && email && passwort) anmelden(); }} />
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted">
                    Kein Konto? Es wird in der Supabase-Konsole angelegt — die Registrierung
                    aus der App heraus ist bewusst abgeschaltet.
                  </p>
                </>
              )}

              {schritt === 'notfallcode' && (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    Fertig. Deine Daten werden ab jetzt verschlüsselt abgeglichen.
                  </p>
                  <div className="rounded-md border border-warning-line bg-warning-soft p-3">
                    <div className="mb-1 flex items-center gap-2 text-warning">
                      <AlertTriangle size={13} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Einmalig. Bitte aufschreiben.</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted">
                      Weitere Geräte nimmst du gleich mit einer sechsstelligen Zahl dazu; dafür
                      brauchst du diesen Code nicht. Er ist der Weg zurück, wenn dir
                      <strong className="text-ink"> alle </strong>
                      Geräte abhandenkommen. Dann gibt es sonst keinen.
                    </p>
                  </div>
                  <div className="rounded-md border border-divider bg-paper p-3">
                    <code className="block break-all font-mono text-sm font-bold leading-relaxed tracking-wider text-ink">
                      {code}
                    </code>
                  </div>
                  <button type="button" className={`${knopf} w-full border border-divider text-muted hover:text-ink`}
                    onClick={() => { navigator.clipboard?.writeText(code); setKopiert(true); }}>
                    {kopiert ? <Check size={13} /> : <Copy size={13} />}
                    {kopiert ? 'Kopiert' : 'In die Zwischenablage'}
                  </button>
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
                    <input type="checkbox" checked={codeGesichert} className="mt-0.5"
                      onChange={(e) => setCodeGesichert(e.target.checked)} />
                    <span>Ich habe den Code an einem sicheren Ort gesichert.</span>
                  </label>
                </>
              )}

              {schritt === 'verbinden' && (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    Dieses Konto ist schon auf einem anderen Gerät eingerichtet. Öffne dort
                    Kavoma Time — die Anfrage erscheint von selbst — und tippe diese Zahl ein:
                  </p>
                  <div className="rounded-md border border-divider bg-paper py-6 text-center">
                    {zahl ? (
                      <span className="font-display text-4xl font-bold tabular-nums tracking-[0.3em] text-ink">
                        {zahl}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2 text-xs text-muted">
                        <Loader2 size={14} className="animate-spin" /> Warte auf das andere Gerät…
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted">
                    Die Zahl ist kein Passwort — sie darf ruhig jemand mithören. Sie belegt nur,
                    dass wirklich deine beiden Geräte miteinander reden und niemand dazwischen sitzt.
                  </p>
                  <button type="button" onClick={() => setSchritt('notfallcode-eingeben')}
                    className="flex items-center gap-1 text-xs text-muted underline decoration-divider transition-colors hover:text-ink">
                    Anderes Gerät nicht zur Hand? Wiederherstellungscode verwenden <ArrowRight size={11} />
                  </button>
                </>
              )}

              {schritt === 'notfallcode-eingeben' && (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    Gib den Wiederherstellungscode ein, den du beim Einrichten notiert hast.
                    Groß- und Kleinschreibung sowie Bindestriche sind egal.
                  </p>
                  <input className={`${feld} font-mono`} type="text" autoFocus
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    value={notfallEingabe} onChange={(e) => setNotfallEingabe(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && notfallEingabe) mitNotfallcode(); }} />
                  <button type="button" onClick={() => setSchritt('verbinden')}
                    className="text-xs text-muted underline decoration-divider transition-colors hover:text-ink">
                    Zurück zur Zahl
                  </button>
                </>
              )}

              {fehler && (
                <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
                  {fehler}
                </p>
              )}
            </div>

            <footer className="flex justify-end gap-2 border-t border-divider px-5 py-4">
              {schritt !== 'notfallcode' && (
                <button type="button" className={`${knopf} text-muted hover:text-ink`} onClick={schliessen} disabled={laeuft}>
                  Abbrechen
                </button>
              )}
              {schritt === 'anmelden' && (
                <button type="button" className={`${knopf} bg-ink text-paper`} onClick={anmelden}
                  disabled={laeuft || !email.trim() || !passwort}>
                  {laeuft ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />} Anmelden
                </button>
              )}
              {schritt === 'notfallcode' && (
                <button type="button" className={`${knopf} bg-ink text-paper`} onClick={abschliessen}
                  disabled={!codeGesichert}>
                  <Check size={13} /> Fertig
                </button>
              )}
              {schritt === 'verbinden' && (
                <span className="flex items-center gap-2 px-2 text-[11px] text-muted">
                  <Laptop size={13} /> Warte auf Bestätigung…
                </span>
              )}
              {schritt === 'notfallcode-eingeben' && (
                <button type="button" className={`${knopf} bg-ink text-paper`} onClick={mitNotfallcode}
                  disabled={laeuft || !notfallEingabe.trim()}>
                  {laeuft ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Entsperren
                </button>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
