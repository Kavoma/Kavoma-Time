import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListPlus, Plus, Trash2, Copy } from 'lucide-react';
import type { Customer, Project, TimeEntry } from '../types';
import { CustomSelect } from './CustomSelect';
import { Checkbox } from './Checkbox';
import { newNumericId } from '../sync/ids';
import { NO_PROJECT_ID, NO_PROJECT_OPTION } from '../utils/projects';
import { rateFor } from '../utils/outstanding';

interface Props {
  open: boolean;
  customers: Customer[];
  projects: Project[];
  defaultCustomerId?: number;
  onSave: (entries: TimeEntry[]) => void;
  onCancel: () => void;
}

/** Eine Zeile der Erfassungstabelle — alles als Text, geprüft wird beim Speichern. */
interface Zeile {
  key: number;
  datum: string;      // JJJJ-MM-TT
  von: string;        // HH:MM oder leer
  bis: string;        // HH:MM oder leer
  dauer: string;      // „1,5", „1:30", „90m" — nur wenn Von/Bis leer
  projektId: number;
  beschreibung: string;
}

function heuteISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Liest eine Dauer in Sekunden.
 *
 * Erlaubt, was man beim Nachtragen aus Notizen abtippt: „1,5" bzw. „1.5"
 * (Stunden), „1:30" (Stunden:Minuten), „90m" / „90 min" (Minuten), „2h".
 */
function parseDauer(eingabe: string): number | null {
  const s = eingabe.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  m = /^(\d+(?:[.,]\d+)?)(m|min)$/.exec(s);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 60);
  m = /^(\d+(?:[.,]\d+)?)(h|std)?$/.exec(s);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 3600);
  return null;
}

function zeitInSekunden(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

/** Dauer einer Zeile, oder ein Fehlertext. */
function zeilenDauer(z: Zeile): number | string {
  if (z.von || z.bis) {
    const a = zeitInSekunden(z.von);
    const b = zeitInSekunden(z.bis);
    if (a === null || b === null) return 'Von und Bis ausfüllen';
    let diff = b - a;
    if (diff <= 0) diff += 24 * 3600; // über Mitternacht
    return diff;
  }
  const d = parseDauer(z.dauer);
  if (d === null) return z.dauer ? 'Dauer nicht lesbar' : 'Zeit fehlt';
  if (d <= 0) return 'Dauer muss größer 0 sein';
  return d;
}

const fmtStd = (sek: number) => `${Math.floor(sek / 3600)}:${String(Math.round((sek % 3600) / 60)).padStart(2, '0')}`;

/**
 * Viele Einträge auf einmal nachtragen.
 *
 * Für den Fall „alles vorher auf Papier gemacht": Kunde einmal wählen, dann
 * Zeile für Zeile Datum, Zeit und Tätigkeit eintippen. Enter in der letzten
 * Beschreibung legt die nächste Zeile an und übernimmt Datum und Projekt.
 */
export function BulkEntryModal({ open, customers, projects, defaultCustomerId, onSave, onCancel }: Props) {
  const [kundeId, setKundeId] = useState(0);
  const [abrechenbar, setAbrechenbar] = useState(true);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [fehler, setFehler] = useState('');
  const naechsterKey = useRef(1);
  const fokusNeu = useRef<number | null>(null);

  const kunde = customers.find((c) => c.id === kundeId);
  const kundenProjekte = useMemo(() => projects.filter((p) => p.customerId === kundeId), [projects, kundeId]);

  const neueZeile = (vorlage?: Zeile): Zeile => ({
    key: naechsterKey.current++,
    datum: vorlage?.datum ?? heuteISO(),
    von: '', bis: '', dauer: '',
    projektId: vorlage?.projektId ?? kundenProjekte[0]?.id ?? NO_PROJECT_ID,
    beschreibung: '',
  });

  useEffect(() => {
    if (!open) return;
    const id = defaultCustomerId || customers[0]?.id || 0;
    setKundeId(id);
    setAbrechenbar(true);
    setFehler('');
    const erstesProjekt = projects.find((p) => p.customerId === id)?.id ?? NO_PROJECT_ID;
    naechsterKey.current = 1;
    setZeilen([{ key: naechsterKey.current++, datum: heuteISO(), von: '', bis: '', dauer: '', projektId: erstesProjekt, beschreibung: '' }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Neue Zeile direkt fokussieren, damit man ohne Maus weitertippen kann.
  useEffect(() => {
    if (fokusNeu.current === null) return;
    const el = document.querySelector<HTMLInputElement>(`[data-bulk-datum="${fokusNeu.current}"]`);
    el?.focus();
    fokusNeu.current = null;
  }, [zeilen]);

  const aendern = (key: number, patch: Partial<Zeile>) =>
    setZeilen((zs) => zs.map((z) => (z.key === key ? { ...z, ...patch } : z)));

  const anhaengen = (nach?: Zeile) => {
    const z = neueZeile(nach ?? zeilen[zeilen.length - 1]);
    fokusNeu.current = z.key;
    setZeilen((zs) => {
      if (!nach) return [...zs, z];
      const i = zs.findIndex((x) => x.key === nach.key);
      return [...zs.slice(0, i + 1), z, ...zs.slice(i + 1)];
    });
  };

  const duplizieren = (z: Zeile) => {
    const kopie = { ...z, key: naechsterKey.current++ };
    setZeilen((zs) => {
      const i = zs.findIndex((x) => x.key === z.key);
      return [...zs.slice(0, i + 1), kopie, ...zs.slice(i + 1)];
    });
  };

  const entfernen = (key: number) => setZeilen((zs) => (zs.length > 1 ? zs.filter((z) => z.key !== key) : zs));

  const wechselKunde = (id: number) => {
    setKundeId(id);
    const erstes = projects.find((p) => p.customerId === id)?.id ?? NO_PROJECT_ID;
    setZeilen((zs) => zs.map((z) => ({ ...z, projektId: erstes })));
  };

  // Leere Zeilen (nichts eingetragen) werden beim Speichern ignoriert.
  const istLeer = (z: Zeile) => !z.von && !z.bis && !z.dauer && !z.beschreibung.trim();
  const auswertung = zeilen.map((z) => ({ z, dauer: istLeer(z) ? null : zeilenDauer(z) }));
  const gueltige = auswertung.filter((a): a is { z: Zeile; dauer: number } => typeof a.dauer === 'number');
  const summeSek = gueltige.reduce((s, a) => s + a.dauer, 0);
  const summeWert = gueltige.reduce((s, a) => {
    const satz = rateFor(projects.find((p) => p.id === a.z.projektId), kunde);
    return s + (a.dauer / 3600) * satz;
  }, 0);

  const speichern = () => {
    if (!kundeId) { setFehler('Kunde wählen'); return; }
    const kaputt = auswertung.find((a) => typeof a.dauer === 'string');
    if (kaputt) {
      setFehler(`Zeile ${zeilen.indexOf(kaputt.z) + 1}: ${kaputt.dauer}`);
      return;
    }
    if (gueltige.length === 0) { setFehler('Mindestens eine Zeile ausfüllen'); return; }

    // Zeilen nur mit Dauer bekommen eine Uhrzeit ab 09:00, hintereinander pro
    // Tag — sonst lägen mehrere Einträge eines Tages exakt übereinander.
    const tagesEnde = new Map<string, number>();
    const vergeben = new Set<number>();
    const eintraege: TimeEntry[] = gueltige.map(({ z, dauer }) => {
      let start: number;
      if (z.von) {
        start = new Date(`${z.datum}T${z.von.padStart(5, '0')}:00`).getTime();
      } else {
        start = tagesEnde.get(z.datum) ?? new Date(`${z.datum}T09:00:00`).getTime();
        tagesEnde.set(z.datum, start + dauer * 1000);
      }
      let id = newNumericId();
      while (vergeben.has(id)) id = newNumericId();
      vergeben.add(id);
      return {
        id,
        customerId: kundeId,
        projectId: z.projektId,
        description: z.beschreibung.trim(),
        startedAt: start,
        endedAt: start + dauer * 1000,
        durationSeconds: dauer,
        // Fehlt das Feld, gilt der Eintrag als abrechenbar — nur „nein" wird gespeichert.
        ...(abrechenbar ? {} : { billable: false }),
      };
    });

    onSave(eintraege);
  };

  const feld = 'h-9 w-full rounded-md border border-divider bg-paper px-2 text-[12px] tabular-nums text-ink outline-none focus:border-accent';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div className="absolute inset-0 kv-scrim" onClick={onCancel} />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Mehrere Einträge nachtragen"
            className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-divider px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/5">
                <ListPlus size={15} className="text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide">Mehrere Einträge nachtragen</h3>
                <p className="text-[11px] text-muted">
                  Pro Zeile entweder Von–Bis oder nur die Dauer („1,5", „1:30", „90m"). Enter in der Beschreibung legt die nächste Zeile an.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-4 border-b border-divider px-5 py-3">
              <CustomSelect
                id="bulkCustomer"
                label="Kunde"
                value={kundeId}
                options={customers}
                onChange={(v) => wechselKunde(v as number)}
              />
              <Checkbox
                checked={abrechenbar}
                onChange={setAbrechenbar}
                className="rounded-md border border-divider bg-paper px-3 py-2"
                label={<span className="text-[12px] font-bold text-ink">Abrechenbar</span>}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <table className="w-full border-separate border-spacing-y-1.5 text-left">
                <thead>
                  <tr className="kv-label">
                    <th className="w-8 font-normal">#</th>
                    <th className="w-36 font-normal">Datum</th>
                    <th className="w-24 font-normal">Von</th>
                    <th className="w-24 font-normal">Bis</th>
                    <th className="w-20 font-normal">Dauer</th>
                    <th className="w-44 font-normal">Projekt</th>
                    <th className="font-normal">Beschreibung</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {auswertung.map(({ z, dauer }, i) => {
                    const hatZeiten = Boolean(z.von || z.bis);
                    const kaputt = typeof dauer === 'string';
                    return (
                      <tr key={z.key} className="align-top">
                        <td className="pt-2 text-[11px] tabular-nums text-muted">{i + 1}</td>
                        <td className="pr-1.5">
                          <input
                            type="date" data-bulk-datum={z.key} className={feld}
                            value={z.datum} onChange={(e) => aendern(z.key, { datum: e.target.value })}
                          />
                        </td>
                        <td className="pr-1.5">
                          <input type="time" className={feld} value={z.von} onChange={(e) => aendern(z.key, { von: e.target.value })} />
                        </td>
                        <td className="pr-1.5">
                          <input type="time" className={feld} value={z.bis} onChange={(e) => aendern(z.key, { bis: e.target.value })} />
                        </td>
                        <td className="pr-1.5">
                          {hatZeiten ? (
                            <div className={`flex h-9 items-center px-1 text-[12px] font-bold tabular-nums ${kaputt ? 'text-muted' : 'text-accent'}`}>
                              {typeof dauer === 'number' ? fmtStd(dauer) : '–'}
                            </div>
                          ) : (
                            <input
                              type="text" inputMode="decimal" placeholder="1,5"
                              className={`${feld} ${kaputt && z.dauer ? 'border-danger-line' : ''}`}
                              value={z.dauer} onChange={(e) => aendern(z.key, { dauer: e.target.value })}
                            />
                          )}
                        </td>
                        <td className="pr-1.5">
                          <select
                            className={`${feld} cursor-pointer`}
                            value={z.projektId}
                            onChange={(e) => aendern(z.key, { projektId: Number(e.target.value) })}
                          >
                            <option value={NO_PROJECT_OPTION.id}>{NO_PROJECT_OPTION.name}</option>
                            {kundenProjekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="pr-1.5">
                          <input
                            type="text" placeholder="Woran hast du gearbeitet?" className={feld}
                            value={z.beschreibung}
                            onChange={(e) => aendern(z.key, { beschreibung: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); anhaengen(z); }
                            }}
                          />
                        </td>
                        <td>
                          <div className="flex h-9 items-center gap-0.5">
                            <button
                              type="button" title="Zeile duplizieren" aria-label="Zeile duplizieren"
                              onClick={() => duplizieren(z)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink"
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              type="button" title="Zeile entfernen" aria-label="Zeile entfernen"
                              onClick={() => entfernen(z.key)} disabled={zeilen.length === 1}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger disabled:cursor-default disabled:opacity-30"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button type="button" onClick={() => anhaengen()} className="kv-btn kv-btn-outline mt-2">
                <Plus size={12} /> Zeile hinzufügen
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3">
              <div className="text-[11px] text-muted">
                <span className="font-bold text-ink">{gueltige.length}</span> {gueltige.length === 1 ? 'Eintrag' : 'Einträge'}
                {' · '}<span className="font-bold tabular-nums text-ink">{fmtStd(summeSek)} h</span>
                {summeWert > 0 && abrechenbar && (
                  <> · ca. <span className="font-bold tabular-nums text-ink">
                    {summeWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span> nach Stundensatz</>
                )}
                {fehler && <span className="ml-3 font-bold text-danger">{fehler}</span>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onCancel} className="kv-btn kv-btn-quiet">Abbrechen</button>
                <button type="button" onClick={speichern} className="kv-btn kv-btn-primary">
                  {gueltige.length > 1 ? `${gueltige.length} Einträge speichern` : 'Speichern'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
