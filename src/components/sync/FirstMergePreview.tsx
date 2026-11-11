import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowLeftRight, CloudDownload, HardDrive, Loader2, ShieldCheck } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { applyOps, summarizeOps } from '../../sync/merge';
import type { Op } from '../../sync/types';
import { writeEncryptedBackup } from '../../utils/backupFile';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wird gerufen, sobald der Bestand steht und der Abgleich aufnehmen darf. */
  onSettled: () => void;
}

type Wahl = 'zusammenfuehren' | 'nur-lokal' | 'nur-cloud';

/**
 * Erstabgleich, wenn auf beiden Seiten schon Daten liegen.
 *
 * Blind zusammenzuführen wäre der Fehler, den ein eingespieltes Backup heute
 * schon macht — nur andersherum. Deshalb: erst rechnen, dann zeigen, dann
 * fragen. Und in jedem Fall vorher sichern.
 */
export function FirstMergePreview({ open, onClose, onSettled }: Props) {
  const { state, setState } = useAppState();
  const [ops, setOps] = useState<Op[] | null>(null);
  const [upTo, setUpTo] = useState(0);
  const [bilanz, setBilanz] = useState<Record<string, { added: number; changed: number; removed: number }> | null>(null);
  const [wahl, setWahl] = useState<Wahl>('zusammenfuehren');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !state) return;
    let abgebrochen = false;
    setFehler(null); setBilanz(null); setOps(null);

    window.api?.syncFetchAll()
      .then(({ ops: fremd, upTo: seq }) => {
        if (abgebrochen) return;
        const liste = fremd as Op[];
        setOps(liste);
        setUpTo(seq);
        setBilanz(summarizeOps(state, liste));
      })
      .catch((e) => { if (!abgebrochen) setFehler(e?.message ?? 'Cloud-Daten nicht lesbar.'); });

    return () => { abgebrochen = true; };
  }, [open, state]);

  if (!state) return null;

  const uebernehmen = async () => {
    setLaeuft(true); setFehler(null);
    try {
      // Nicht verhandelbar: Vor dem Zusammenführen liegt eine Sicherung des
      // lokalen Standes auf der Platte. Wenn hier etwas schiefgeht, ist der
      // Weg zurück eine Datei, kein Bedauern.
      await writeEncryptedBackup('kavoma-time-vor-erstabgleich');

      if (wahl === 'zusammenfuehren' && ops) {
        setState(() => applyOps(state, ops).state);
      } else if (wahl === 'nur-cloud' && ops) {
        // Lokalen Bestand fallen lassen und allein aus den Ops aufbauen.
        const leer = { ...state, entries: [], customers: [], projects: [], invoices: [],
                       invoiceTemplates: [], recurringInvoices: [], attachments: [],
                       vendorInvoices: [], contracts: [], syncVersions: {} };
        setState(() => applyOps(leer, ops).state);
      }
      // Bei „nur-lokal" bleibt alles wie es ist; der Zeiger springt trotzdem
      // ans Ende, damit die verworfenen Ops nicht gleich wieder eintrudeln.

      await window.api?.syncAcceptCursor(upTo);
      await window.api?.syncStart();
      onSettled();
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Erstabgleich fehlgeschlagen.');
    } finally { setLaeuft(false); }
  };

  const zeilen = Object.entries(bilanz ?? {});
  const nichtsZuTun = bilanz !== null && zeilen.length === 0;

  const option = (v: Wahl, Icon: typeof ArrowLeftRight, titel: string, text: string) => (
    <label className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${
      wahl === v ? 'border-accent bg-accent/[0.06]' : 'border-divider hover:border-muted'}`}>
      <input type="radio" name="erstabgleich" className="mt-1" checked={wahl === v} onChange={() => setWahl(v)} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-bold text-ink"><Icon size={13} /> {titel}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{text}</p>
      </div>
    </label>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div className="absolute inset-0 kv-scrim" />
          <motion.div
            className="relative z-10 mx-4 w-full max-w-lg kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.15, ease: 'easeOut' }}>

            <header className="flex items-center gap-2 border-b border-divider px-5 py-4">
              <ArrowLeftRight size={16} className="text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Erstabgleich</h2>
            </header>

            <div className="space-y-4 px-5 py-5">
              {!bilanz && !fehler && (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" /> Cloud-Bestand wird gelesen…
                </p>
              )}

              {nichtsZuTun && (
                <p className="text-xs leading-relaxed text-muted">
                  In der Cloud liegt noch nichts. Dieses Gerät wird zur Ausgangslage —
                  es gibt nichts zusammenzuführen.
                </p>
              )}

              {zeilen.length > 0 && (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    Auf beiden Seiten liegen Daten. So sähe die Zusammenführung aus:
                  </p>
                  <div className="overflow-hidden rounded-md border border-divider">
                    <table className="w-full text-xs">
                      <thead className="bg-paper text-[10px] uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold">Bereich</th>
                          <th className="px-3 py-2 text-right font-bold">Neu</th>
                          <th className="px-3 py-2 text-right font-bold">Geändert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zeilen.map(([bereich, z]) => (
                          <tr key={bereich} className="border-t border-divider">
                            <td className="px-3 py-2 text-ink">{bereich}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-success">
                              {z.added > 0 ? `+${z.added}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-warning">
                              {z.changed > 0 ? z.changed : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2">
                    {option('zusammenfuehren', ArrowLeftRight, 'Zusammenführen (empfohlen)',
                      'Beide Bestände behalten. Wo dieselbe Sache auf beiden Geräten geändert wurde, gewinnt die neuere — nachlesbar im Konfliktprotokoll.')}
                    {option('nur-lokal', HardDrive, 'Nur dieses Gerät behalten',
                      'Der Cloud-Stand wird für dieses Gerät verworfen. Auf dem anderen Gerät bleibt er erhalten.')}
                    {option('nur-cloud', CloudDownload, 'Nur Cloud-Stand übernehmen',
                      'Was hier lokal liegt, wird ersetzt. Die Sicherung unten bleibt dein Weg zurück.')}
                  </div>
                </>
              )}

              <div className="flex items-start gap-2 rounded-md border border-divider bg-paper p-3">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" />
                <p className="text-[11px] leading-relaxed text-muted">
                  Vor dem Übernehmen wird eine verschlüsselte Sicherung deines jetzigen
                  Standes geschrieben — in jedem Fall, auch bei „Zusammenführen".
                </p>
              </div>

              {fehler && (
                <p className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {fehler}
                </p>
              )}
            </div>

            <footer className="flex justify-end gap-2 border-t border-divider px-5 py-4">
              <button type="button" disabled={laeuft} onClick={onClose}
                className="kv-btn kv-btn-quiet">
                Später
              </button>
              <button type="button" disabled={laeuft || (!bilanz && !fehler)} onClick={uebernehmen}
                className="kv-btn kv-btn-primary">
                {laeuft ? <Loader2 size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />}
                {nichtsZuTun ? 'Abgleich starten' : 'Übernehmen'}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
