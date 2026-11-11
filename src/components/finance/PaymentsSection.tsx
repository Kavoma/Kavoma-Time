import { useState } from 'react';
import { Banknote, Check, Info, Plus, Trash2, X } from 'lucide-react';
import type { Invoice, Payment } from '../../types';
import {
  ZAHLUNGSSTAND_LABEL, gesamtforderung, gezahlt, offen, zahlungsstand,
} from '../../utils/payments';

interface Props {
  invoice: Invoice;
  onTogglePaid: (id: string) => void;
  onAddPayment: (id: string, daten: {
    amount: number; paidAt: number; method?: Payment['method']; note?: string;
  }) => void;
  onRemovePayment: (id: string, zahlungId: string) => void;
}

const METHODEN: { id: NonNullable<Payment['method']>; label: string }[] = [
  { id: 'transfer', label: 'Überweisung' },
  { id: 'cash', label: 'Bar' },
  { id: 'card', label: 'Karte' },
  { id: 'other', label: 'Sonstiges' },
];

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const datum = (ts: number) =>
  new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** `<input type="date">` will JJJJ-MM-TT — aus den Kalenderfeldern, nicht aus UTC. */
function alsFeldwert(ts: number): string {
  const d = new Date(ts);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Und zurück — `new Date('2026-09-03')` läse UTC und verschöbe den Tag. */
function ausFeldwert(wert: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/**
 * Beträge werden deutsch eingegeben. `parseFloat('1.234,50')` läse 1.234 —
 * also erst die Tausenderpunkte weg, dann das Komma zum Punkt.
 */
function parseBetrag(text: string): number | null {
  const roh = text.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(roh) || roh === '' || roh === '.') return null;
  const n = Number(roh);
  return Number.isFinite(n) ? n : null;
}

/**
 * Die Zahlungen einer Rechnung.
 *
 * Der Ein-Klick-Weg bleibt: „Vollständig bezahlt" bucht den ganzen Rest auf
 * heute. Das ist der Normalfall, und niemand will dafür ein Formular. Erst wer
 * eine Teilzahlung oder ein abweichendes Datum erfassen will, klappt das
 * Formular auf.
 */
export function PaymentsSection({ invoice, onTogglePaid, onAddPayment, onRemovePayment }: Props) {
  const [formularOffen, setFormularOffen] = useState(false);
  const [betrag, setBetrag] = useState('');
  const [am, setAm] = useState(() => alsFeldwert(Date.now()));
  const [methode, setMethode] = useState<Payment['method']>('transfer');
  const [notiz, setNotiz] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const forderung = gesamtforderung(invoice);
  const bezahlt = gezahlt(invoice);
  const rest = offen(invoice);
  const stand = zahlungsstand(invoice);
  const zahlungen = invoice.payments ?? [];
  // Bei Überzahlung würde ein Balken über 100 % hinauslaufen; gekappt sagt er
  // dasselbe, und die Zahl daneben nennt den Überschuss.
  const anteil = forderung > 0 ? Math.min(Math.max(bezahlt / forderung, 0), 1) : 0;

  const oeffneFormular = () => {
    setBetrag(rest > 0 ? rest.toFixed(2).replace('.', ',') : '');
    setAm(alsFeldwert(Date.now()));
    setMethode('transfer');
    setNotiz('');
    setFehler(null);
    setFormularOffen(true);
  };

  const speichern = () => {
    const wert = parseBetrag(betrag);
    if (wert === null || wert <= 0) {
      setFehler('Bitte einen Betrag größer als null eintragen.');
      return;
    }
    const ts = ausFeldwert(am);
    if (ts === null) {
      setFehler('Bitte ein gültiges Datum wählen.');
      return;
    }
    onAddPayment(invoice.id, {
      amount: wert,
      paidAt: ts,
      method: methode,
      note: notiz.trim() || undefined,
    });
    setFormularOffen(false);
  };

  const tonKlasse =
    stand === 'bezahlt' ? 'border-success-line bg-success-soft'
      : stand === 'ueberzahlt' ? 'border-info-line bg-info-soft'
        : stand === 'teilweise' ? 'border-warning-line bg-warning-soft'
          : 'border-divider bg-paper';

  return (
    <div className={`rounded-lg border p-3 ${tonKlasse}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
            stand === 'bezahlt' || stand === 'ueberzahlt'
              ? 'bg-success-soft text-success' : 'bg-neutral-soft text-muted'
          }`}>
            {stand === 'bezahlt' || stand === 'ueberzahlt'
              ? <Check size={14} strokeWidth={3} /> : <Banknote size={14} />}
          </div>
          <div>
            <div className="text-[12px] font-bold text-ink">{ZAHLUNGSSTAND_LABEL[stand]}</div>
            <div className="text-[10px] text-muted">
              {euro(bezahlt)} von {euro(forderung)}
              {rest > 0 && <> · noch <strong className="text-ink">{euro(rest)}</strong></>}
              {rest < 0 && <> · <strong className="text-info">{euro(-rest)}</strong> zu viel</>}
            </div>
          </div>
        </div>
        {stand !== 'bezahlt' && stand !== 'ueberzahlt' ? (
          <button type="button" className="kv-btn kv-btn-quiet" onClick={() => onTogglePaid(invoice.id)}>
            <Check size={12} /> Vollständig bezahlt
          </button>
        ) : (
          <button type="button" className="kv-btn kv-btn-quiet" onClick={() => onTogglePaid(invoice.id)}>
            <X size={12} /> Alle Zahlungen entfernen
          </button>
        )}
      </div>

      {forderung > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-divider" aria-hidden="true">
          <div
            className={`h-full rounded-full transition-[width] ${
              stand === 'teilweise' ? 'bg-warning-solid' : 'bg-success-solid'
            }`}
            style={{ width: `${anteil * 100}%` }}
          />
        </div>
      )}

      {zahlungen.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {zahlungen.map((p) => (
            <li
              key={p.id}
              className="group flex items-center justify-between gap-2 rounded-md bg-paper/60 px-2.5 py-1.5 text-[11px]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-bold tabular-nums text-ink">{euro(p.amount)}</span>
                <span className="text-muted">{datum(p.paidAt)}</span>
                {p.method && (
                  <span className="text-muted">
                    · {METHODEN.find((m) => m.id === p.method)?.label}
                  </span>
                )}
                {p.note && <span className="truncate text-muted">· {p.note}</span>}
                {p.source === 'switch' && (
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-soft px-1.5 text-[9px] font-bold uppercase tracking-wider text-muted"
                    title="Aus dem früheren Ja/Nein-Schalter übernommen — Betrag und Datum sind erschlossen, nicht erfasst."
                  >
                    <Info size={9} /> übernommen
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label={`Zahlung vom ${datum(p.paidAt)} entfernen`}
                className="kv-icon-btn opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onRemovePayment(invoice.id, p.id)}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {formularOffen ? (
        <div className="mt-3 rounded-md border border-divider bg-paper p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="kv-label">Betrag (€)</span>
              <input
                className="kv-input mt-1 w-full" inputMode="decimal" autoFocus
                value={betrag} onChange={(e) => setBetrag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') speichern(); }}
              />
            </label>
            <label className="block">
              <span className="kv-label">Eingegangen am</span>
              <input
                type="date" className="kv-input mt-1 w-full"
                value={am} onChange={(e) => setAm(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="kv-label">Weg</span>
              <select
                className="kv-input mt-1 w-full" value={methode}
                onChange={(e) => setMethode(e.target.value as Payment['method'])}
              >
                {METHODEN.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="kv-label">Notiz</span>
              <input
                className="kv-input mt-1 w-full" placeholder="optional"
                value={notiz} onChange={(e) => setNotiz(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') speichern(); }}
              />
            </label>
          </div>
          {fehler && <p role="alert" className="mt-2 text-[11px] text-danger">{fehler}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" className="kv-btn kv-btn-primary" onClick={speichern}>
              Zahlung erfassen
            </button>
            <button type="button" className="kv-btn kv-btn-quiet" onClick={() => setFormularOffen(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="kv-btn kv-btn-quiet mt-3" onClick={oeffneFormular}>
          <Plus size={12} /> Zahlung erfassen
        </button>
      )}
    </div>
  );
}
