import { useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, Check, Download, FileSpreadsheet, FolderOpen, Loader2, Scale,
} from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import {
  DATEV_VORGABEN, KONTEN_VORGABEN, buildDatevExport, datevDateiname,
  type DatevSettings, type Kontenrahmen,
} from '../../utils/datevExport';
import { buildZ3Export } from '../../utils/z3Export';
import type { VendorInvoiceCategory } from '../../types';

const KATEGORIEN: { id: VendorInvoiceCategory; label: string }[] = [
  { id: 'hardware', label: 'Hardware' },
  { id: 'software', label: 'Software' },
  { id: 'office', label: 'Büro' },
  { id: 'travel', label: 'Reise' },
  { id: 'service', label: 'Dienstleistung' },
  { id: 'other', label: 'Sonstiges' },
];

type Meldung = { art: 'ok' | 'warnung' | 'fehler'; text: string; details?: string[] };

/**
 * Die beiden steuerlichen Exporte.
 *
 * Sie stehen zusammen, weil sie dieselbe Frage stellen — „welches Jahr?" —
 * und dasselbe Missverständnis auslösen: Beide sehen aus wie „die Buchhaltung
 * abgeben", gehen aber an verschiedene Leute. Der DATEV-Stapel geht an die
 * Kanzlei und wird dort gebucht; der Z3-Ordner geht an den Betriebsprüfer und
 * wird dort ausgewertet. Deshalb sagt jede Karte, wer der Empfänger ist.
 */
export function TaxExportTab() {
  const { state, setState } = useAppState();
  const [jahr, setJahr] = useState(() => new Date().getFullYear());
  const [laeuft, setLaeuft] = useState<'datev' | 'z3' | null>(null);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [kontenOffen, setKontenOffen] = useState(false);

  const datev = state?.datev ?? DATEV_VORGABEN;

  /** Die Jahre, in denen überhaupt etwas passiert ist — plus das laufende. */
  const jahre = useMemo(() => {
    const gefunden = new Set<number>([new Date().getFullYear()]);
    for (const i of state?.invoices ?? []) {
      if (i.status !== 'draft') gefunden.add(new Date(i.createdAt).getFullYear());
    }
    for (const v of state?.vendorInvoices ?? []) gefunden.add(new Date(v.invoiceDate).getFullYear());
    return [...gefunden].sort((a, b) => b - a);
  }, [state?.invoices, state?.vendorInvoices]);

  const setzeDatev = (patch: Partial<DatevSettings>) => {
    setState((s) => (s ? { ...s, datev: { ...(s.datev ?? DATEV_VORGABEN), ...patch } } : s));
  };

  const setzeKonto = (key: keyof DatevSettings['konten'], wert: string) => {
    setzeDatev({ konten: { ...datev.konten, [key]: wert } });
  };

  const setzeAufwand = (kat: VendorInvoiceCategory, wert: string) => {
    setzeDatev({ konten: { ...datev.konten, aufwand: { ...datev.konten.aufwand, [kat]: wert } } });
  };

  /** Kontenrahmen wechseln heißt: alle Vorgaben mitwechseln. */
  const setzeKontenrahmen = (kr: Kontenrahmen) => {
    setzeDatev({ kontenrahmen: kr, konten: KONTEN_VORGABEN[kr] });
  };

  const exportiereDatev = async () => {
    if (!state) return;
    setLaeuft('datev');
    setMeldung(null);
    try {
      const { bytes, buchungen, uebersprungen } = buildDatevExport({
        jahr,
        invoices: state.invoices,
        vendorInvoices: state.vendorInvoices,
        customers: state.customers,
        issuer: state.issuer,
        settings: datev,
      });
      if (buchungen === 0 && uebersprungen.length === 0) {
        setMeldung({ art: 'warnung', text: `Für ${jahr} gibt es keine Belege.` });
        return;
      }
      const res = await window.api!.exportWriteFile({
        dateiname: datevDateiname(jahr),
        bytes,
        titel: 'DATEV-Buchungsstapel speichern',
        filter: { name: 'DATEV-Buchungsstapel', extensions: ['csv'] },
      });
      if (res.canceled) return;
      if (!res.ok) throw new Error(res.error ?? 'Unbekannter Fehler');
      setMeldung({
        art: uebersprungen.length ? 'warnung' : 'ok',
        text: `${buchungen} Buchungssätze geschrieben` +
          (uebersprungen.length ? ` — ${uebersprungen.length} Beleg(e) blieben draußen:` : '.'),
        details: uebersprungen.map((u) => `${u.beleg || 'ohne Nummer'}: ${u.grund}`),
      });
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaeuft(null);
    }
  };

  const exportiereZ3 = async () => {
    if (!state) return;
    setLaeuft('z3');
    setMeldung(null);
    try {
      const { dateien, zeilen } = buildZ3Export({
        jahr,
        issuer: state.issuer,
        customers: state.customers,
        projects: state.projects,
        entries: state.entries,
        invoices: state.invoices,
        vendorInvoices: state.vendorInvoices,
      });
      if (Object.keys(zeilen).length === 0) {
        setMeldung({ art: 'warnung', text: `Für ${jahr} gibt es nichts zu übergeben.` });
        return;
      }
      const res = await window.api!.exportWriteFolder({
        ordnerName: `Z3-Datenexport-${jahr}`,
        dateien,
        titel: 'Wohin soll der Prüfungsordner?',
      });
      if (res.canceled) return;
      if (!res.ok) throw new Error(res.error ?? 'Unbekannter Fehler');
      setMeldung({
        art: 'ok',
        text: `Ordner geschrieben: ${res.directory}`,
        details: Object.entries(zeilen).map(([name, n]) => `${name}: ${n} Datensätze`),
      });
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaeuft(null);
    }
  };

  if (!window.api) {
    return (
      <p className="text-[13px] text-muted">
        Die steuerlichen Exporte schreiben Dateien und gibt es deshalb nur in der Desktop-App.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Steuerliche Exporte</h2>
          <p className="mt-1 text-[12px] text-muted">
            Für die Kanzlei und für die Betriebsprüfung — zwei Formate, zwei Empfänger.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="kv-label">Jahr</span>
          <select
            className="kv-input w-28"
            value={jahr}
            onChange={(e) => { setJahr(Number(e.target.value)); setMeldung(null); }}
          >
            {jahre.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </label>
      </div>

      {meldung && (
        <div
          role="status"
          className={`kv-card p-4 text-[13px] ${
            meldung.art === 'ok' ? 'border-success-line text-success'
              : meldung.art === 'warnung' ? 'border-warning-line text-warning'
                : 'border-danger-line text-danger'
          }`}
        >
          <div className="flex items-start gap-2">
            {meldung.art === 'ok' ? <Check size={15} className="mt-px shrink-0" />
              : <AlertTriangle size={15} className="mt-px shrink-0" />}
            <div className="min-w-0">
              <p className="font-semibold break-words">{meldung.text}</p>
              {meldung.details && meldung.details.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-muted">
                  {meldung.details.map((d) => <li key={d}>· {d}</li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === DATEV === */}
      <section className="kv-card p-5">
        <header className="flex items-start gap-3">
          <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">DATEV-Buchungsstapel</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Eine CSV-Datei im DATEV-Format (EXTF 700) für die Steuerkanzlei. Enthält
              Ausgangsrechnungen als Forderung gegen Erlös und Eingangsrechnungen als
              Aufwand gegen einen Sammelkreditor — jeweils brutto, die Steuer zieht das
              Automatikkonto heraus.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              <strong className="text-ink">Zahlungen sind standardmäßig nicht dabei.</strong>{' '}
              Die bucht die Kanzlei in aller Regel selbst aus dem Kontoauszug — beides zugleich
              ergäbe jeden Eingang doppelt. Wer das anders geregelt hat, schaltet es unten
              bei den Kontonummern ein.
            </p>
          </div>
        </header>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="kv-label">Beraternummer</span>
            <input
              className="kv-input mt-1 w-full" inputMode="numeric" placeholder="z. B. 1234567"
              value={datev.beraterNr}
              onChange={(e) => setzeDatev({ beraterNr: e.target.value.replace(/\D/g, '') })}
            />
          </label>
          <label className="block">
            <span className="kv-label">Mandantennummer</span>
            <input
              className="kv-input mt-1 w-full" inputMode="numeric" placeholder="z. B. 4711"
              value={datev.mandantenNr}
              onChange={(e) => setzeDatev({ mandantenNr: e.target.value.replace(/\D/g, '') })}
            />
          </label>
          <label className="block">
            <span className="kv-label">Kontenrahmen</span>
            <select
              className="kv-input mt-1 w-full"
              value={datev.kontenrahmen}
              onChange={(e) => setzeKontenrahmen(e.target.value as Kontenrahmen)}
            >
              <option value="03">SKR 03</option>
              <option value="04">SKR 04</option>
            </select>
          </label>
        </div>

        <p className="mt-3 flex items-start gap-2 text-[12px] text-muted">
          <Building2 size={14} className="mt-px shrink-0" />
          <span>
            Berater- und Mandantennummer stehen auf jedem Schreiben der Kanzlei. Ohne sie
            lässt sich der Stapel importieren, wird dort aber keinem Mandanten zugeordnet.
          </span>
        </p>

        <button
          type="button"
          className="kv-btn kv-btn-quiet mt-4"
          onClick={() => setKontenOffen((o) => !o)}
          aria-expanded={kontenOffen}
        >
          {kontenOffen ? 'Kontonummern ausblenden' : 'Kontonummern anzeigen'}
        </button>

        {kontenOffen && (
          <div className="kv-raised mt-3 p-4">
            <p className="mb-4 flex items-start gap-2 text-[12px] text-warning">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>
                Diese Nummern sind Vorgaben, keine Wahrheit. Welches Konto gilt, entscheidet
                der Kontenrahmen der Kanzlei — stimme sie einmal ab, bevor du den ersten
                Stapel schickst.
              </span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Konto label="Erlöse 19 %" value={datev.konten.erloese19} onChange={(v) => setzeKonto('erloese19', v)} />
              <Konto label="Erlöse 7 %" value={datev.konten.erloese7} onChange={(v) => setzeKonto('erloese7', v)} />
              <Konto label="Erlöse ohne USt" value={datev.konten.erloese0} onChange={(v) => setzeKonto('erloese0', v)} />
              <Konto label="Sammelkreditor" value={datev.konten.kreditorSammel} onChange={(v) => setzeKonto('kreditorSammel', v)} />
            </div>
            <p className="kv-label mt-5 mb-2">Aufwandskonten je Belegkategorie</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {KATEGORIEN.map((k) => (
                <Konto
                  key={k.id} label={k.label} value={datev.konten.aufwand[k.id]}
                  onChange={(v) => setzeAufwand(k.id, v)}
                />
              ))}
            </div>
            <p className="kv-label mt-5 mb-2">Geldkonten (nur für Zahlungsbuchungen)</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Konto label="Bank" value={datev.konten.bank} onChange={(v) => setzeKonto('bank', v)} />
              <Konto label="Kasse" value={datev.konten.kasse} onChange={(v) => setzeKonto('kasse', v)} />
            </div>

            <label className="mt-5 flex items-start gap-2 text-[12px]">
              <input
                type="checkbox" className="mt-0.5"
                checked={datev.zahlungenBuchen}
                onChange={(e) => setzeDatev({ zahlungenBuchen: e.target.checked })}
              />
              <span>
                Zahlungseingänge mitbuchen (Geldkonto an Debitor)
                <span className="block text-muted">
                  Aus ist die Vorgabe. Bucht die Kanzlei die Bank selbst — der Normalfall —,
                  stünde sonst jeder Zahlungseingang zweimal in der Buchführung. Nur einschalten,
                  wenn das ausdrücklich abgesprochen ist.
                </span>
              </span>
            </label>

            <label className="mt-4 flex items-start gap-2 text-[12px]">
              <input
                type="checkbox" className="mt-0.5"
                checked={datev.festschreibung}
                onChange={(e) => setzeDatev({ festschreibung: e.target.checked })}
              />
              <span>
                Stapel als festgeschrieben übergeben
                <span className="block text-muted">
                  Aus ist die Vorgabe: Ein festgeschriebener Stapel lässt sich in DATEV nicht
                  mehr korrigieren, und der erste Import ist selten auf Anhieb richtig.
                </span>
              </span>
            </label>
          </div>
        )}

        <button
          type="button"
          className="kv-btn kv-btn-primary mt-5"
          disabled={laeuft !== null}
          onClick={exportiereDatev}
        >
          {laeuft === 'datev' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Buchungsstapel {jahr} schreiben
        </button>
      </section>

      {/* === Z3 === */}
      <section className="kv-card p-5">
        <header className="flex items-start gap-3">
          <Scale size={18} className="mt-0.5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Z3-Datenexport für die Betriebsprüfung</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Ein Ordner nach dem Beschreibungsstandard der Finanzverwaltung: Rechnungen,
              Positionen, Eingangsrechnungen, Debitoren und der Leistungsnachweis als CSV,
              dazu eine <code>index.xml</code>, die jede Spalte beschreibt. Das ist das
              Format, das Prüfsoftware wie IDEA erwartet.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Übergeben wird nur das gewählte Jahr, und von den Kunden nur die, die darin
              Umsatz hatten — persönliche Daten gibt man nicht großzügiger heraus, als man muss.
            </p>
          </div>
        </header>
        <button
          type="button"
          className="kv-btn kv-btn-outline mt-5"
          disabled={laeuft !== null}
          onClick={exportiereZ3}
        >
          {laeuft === 'z3' ? <Loader2 size={15} className="animate-spin" /> : <FolderOpen size={15} />}
          Prüfungsordner {jahr} anlegen
        </button>
      </section>
    </div>
  );
}

function Konto({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="kv-label">{label}</span>
      <input
        className="kv-input mt-1 w-full" inputMode="numeric" value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    </label>
  );
}
