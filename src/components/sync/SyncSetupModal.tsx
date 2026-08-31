import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, Copy, KeyRound, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import type { SyncStatus } from '../../sync/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (status: SyncStatus) => void;
}

type Schritt = 'anmelden' | 'passphrase-neu' | 'passphrase-eingeben' | 'notfallcode';

/**
 * Einrichtung in drei Schritten: anmelden, Passphrase, Wiederherstellungscode.
 *
 * Bewusst **ohne Registrierung**: Es gibt genau ein Konto, und das wird in der
 * Supabase-Konsole angelegt. Ein Registrieren-Knopf in der App würde eine
 * Möglichkeit vorspiegeln, die serverseitig abgeschaltet ist.
 */
export function SyncSetupModal({ open, onClose, onDone }: Props) {
  const [schritt, setSchritt] = useState<Schritt>('anmelden');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [passphrase2, setPassphrase2] = useState('');
  const [code, setCode] = useState('');
  const [codeGesichert, setCodeGesichert] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSchritt('anmelden');
    setEmail(''); setPasswort(''); setPassphrase(''); setPassphrase2('');
    setCode(''); setCodeGesichert(false); setKopiert(false); setFehler(null);
  }, [open]);

  const anmelden = async () => {
    setLaeuft(true); setFehler(null);
    try {
      await window.api?.syncSignIn(email.trim(), passwort);
      // Gibt es für dieses Konto schon einen Schlüsselumschlag, ist dies das
      // zweite Gerät — dann wird die Passphrase abgefragt, nicht festgelegt.
      const vorhanden = await window.api?.syncHasKeys();
      setSchritt(vorhanden ? 'passphrase-eingeben' : 'passphrase-neu');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.');
    } finally { setLaeuft(false); }
  };

  const passphraseFestlegen = async () => {
    if (passphrase !== passphrase2) { setFehler('Die beiden Eingaben stimmen nicht überein.'); return; }
    if (passphrase.length < 12) { setFehler('Mindestens 12 Zeichen — sie schützt deinen gesamten Datenbestand.'); return; }
    setLaeuft(true); setFehler(null);
    try {
      const { recoveryCode } = await window.api!.syncSetupPassphrase(passphrase);
      setCode(recoveryCode);
      setSchritt('notfallcode');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Einrichtung fehlgeschlagen.');
    } finally { setLaeuft(false); }
  };

  const entsperren = async () => {
    setLaeuft(true); setFehler(null);
    try {
      const status = await window.api!.syncUnlock(passphrase);
      onDone(status);
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Entsperren fehlgeschlagen.');
    } finally { setLaeuft(false); }
  };

  const abschliessen = async () => {
    // Erstes Gerät: In der Cloud liegt nichts, es gibt nichts abzuwägen —
    // der Abgleich darf sofort aufnehmen.
    const status = await window.api!.syncStart().catch(() => window.api!.syncGetStatus());
    onDone(status);
    onClose();
  };

  const feld = 'h-10 w-full rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent';
  const knopf = 'flex h-10 items-center justify-center gap-2 rounded-md px-4 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-40';

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={laeuft ? undefined : onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />

          <motion.div
            className="relative z-10 mx-4 w-full max-w-md rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
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

              {schritt === 'passphrase-neu' && (
                <>
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-3">
                    <div className="mb-1 flex items-center gap-2 text-amber-300">
                      <AlertTriangle size={13} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Einmalige Entscheidung</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted">
                      Diese Passphrase verschlüsselt deine Daten, bevor sie das Gerät verlassen.
                      Sie wird <strong className="text-ink">nirgends gespeichert</strong> — auch nicht bei uns.
                      Geht sie verloren, sind die synchronisierten Daten unwiederbringlich weg.
                      Deshalb bekommst du gleich einen Wiederherstellungscode.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <input className={feld} type="password" placeholder="Passphrase (mind. 12 Zeichen)" value={passphrase}
                      autoFocus onChange={(e) => setPassphrase(e.target.value)} />
                    <input className={feld} type="password" placeholder="Passphrase wiederholen" value={passphrase2}
                      onChange={(e) => setPassphrase2(e.target.value)} />
                  </div>
                </>
              )}

              {schritt === 'passphrase-eingeben' && (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    Für dieses Konto ist bereits eine Passphrase eingerichtet. Gib sie ein, um
                    dieses Gerät hinzuzunehmen — der Wiederherstellungscode geht auch.
                  </p>
                  <input className={feld} type="password" placeholder="Passphrase oder Wiederherstellungscode"
                    value={passphrase} autoFocus onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && passphrase) entsperren(); }} />
                </>
              )}

              {schritt === 'notfallcode' && (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    Schreib ihn auf oder druck ihn aus. Er ist der <strong className="text-ink">einzige</strong> Weg
                    zurück, wenn du die Passphrase vergisst. Du siehst ihn nur dieses eine Mal.
                  </p>
                  <div className="rounded-md border border-divider bg-paper p-3">
                    <code className="block break-all font-mono text-sm font-bold leading-relaxed tracking-wider text-ink">
                      {code}
                    </code>
                  </div>
                  <button type="button" className={`${knopf} border border-divider text-muted hover:text-ink`}
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

              {fehler && (
                <p className="rounded-md border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">
                  {fehler}
                </p>
              )}
            </div>

            <footer className="flex justify-end gap-2 border-t border-divider px-5 py-4">
              {schritt !== 'notfallcode' && (
                <button type="button" className={`${knopf} text-muted hover:text-ink`} onClick={onClose} disabled={laeuft}>
                  Abbrechen
                </button>
              )}
              {schritt === 'anmelden' && (
                <button type="button" className={`${knopf} bg-ink text-paper`} onClick={anmelden}
                  disabled={laeuft || !email.trim() || !passwort}>
                  {laeuft ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />} Anmelden
                </button>
              )}
              {schritt === 'passphrase-neu' && (
                <button type="button" className={`${knopf} bg-ink text-paper`} onClick={passphraseFestlegen}
                  disabled={laeuft || !passphrase || !passphrase2}>
                  {laeuft ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Festlegen
                </button>
              )}
              {schritt === 'passphrase-eingeben' && (
                <button type="button" className={`${knopf} bg-ink text-paper`} onClick={entsperren}
                  disabled={laeuft || !passphrase}>
                  {laeuft ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Entsperren
                </button>
              )}
              {schritt === 'notfallcode' && (
                <button type="button" className={`${knopf} bg-ink text-paper`} onClick={abschliessen}
                  disabled={!codeGesichert}>
                  <Check size={13} /> Fertig
                </button>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
