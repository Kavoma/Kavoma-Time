import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TimeInputProps {
  /** HH:MM oder leer */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** 'sm' für Tabellenzeilen, 'md' wie die übrigen Formularfelder. */
  size?: 'sm' | 'md';
  /** Abstand der Vorschläge in Minuten. */
  step?: number;
  className?: string;
  disabled?: boolean;
}

const POPUP_WIDTH = 120;
const POPUP_HEIGHT = 240;
const POPUP_GAP = 6;
const VIEWPORT_PAD = 8;

/**
 * Liest, was man beim schnellen Tippen eingibt: „930", „9:30", „9.30", „9" →
 * „09:30" bzw. „09:00". Ungültiges ergibt `null`.
 */
function normalizeTime(raw: string): string | null {
  const s = raw.trim().replace(/[.,h]/g, ':');
  if (!s) return '';
  let h: number;
  let m: number;
  const mitDoppelpunkt = /^(\d{1,2}):(\d{0,2})$/.exec(s);
  if (mitDoppelpunkt) {
    h = Number(mitDoppelpunkt[1]);
    m = Number(mitDoppelpunkt[2] || 0);
  } else if (/^\d{1,4}$/.test(s)) {
    // „9" → 9:00, „930" → 9:30, „1730" → 17:30
    if (s.length <= 2) { h = Number(s); m = 0; }
    else { h = Number(s.slice(0, -2)); m = Number(s.slice(-2)); }
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Uhrzeit-Feld im Stil des eigenen `DatePicker` — statt der Systemauswahl von
 * Chromium, die weder zum Erscheinungsbild noch zum Hell/Dunkel-Modus passt.
 *
 * Man kann direkt tippen (wird beim Verlassen normalisiert) oder aus einer
 * Liste im Viertelstundentakt wählen.
 */
export function TimeInput({
  value, onChange, label, placeholder = '--:--', size = 'md', step = 15, className = '', disabled = false,
}: TimeInputProps) {
  const [entwurf, setEntwurf] = useState(value);
  const [offen, setOffen] = useState(false);
  const [ungueltig, setUngueltig] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => { setEntwurf(value); setUngueltig(false); }, [value]);

  const positionieren = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nachOben = window.innerHeight - rect.bottom < POPUP_HEIGHT + POPUP_GAP && rect.top > POPUP_HEIGHT;
    let left = rect.left;
    left = Math.min(left, window.innerWidth - POPUP_WIDTH - VIEWPORT_PAD);
    left = Math.max(VIEWPORT_PAD, left);
    setPos({ top: nachOben ? rect.top - POPUP_GAP - POPUP_HEIGHT : rect.bottom + POPUP_GAP, left });
  };

  useLayoutEffect(() => { if (offen) positionieren(); }, [offen]);

  useEffect(() => {
    if (!offen) return;
    const nachfuehren = () => positionieren();
    const aussen = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!containerRef.current?.contains(t) && !popupRef.current?.contains(t)) setOffen(false);
    };
    window.addEventListener('scroll', nachfuehren, true);
    window.addEventListener('resize', nachfuehren);
    document.addEventListener('mousedown', aussen);
    return () => {
      window.removeEventListener('scroll', nachfuehren, true);
      window.removeEventListener('resize', nachfuehren);
      document.removeEventListener('mousedown', aussen);
    };
  }, [offen]);

  // Gewählte (oder nächstliegende) Zeit beim Öffnen in die Mitte scrollen.
  useEffect(() => {
    if (!offen) return;
    const ziel = value || '09:00';
    requestAnimationFrame(() => {
      const liste = listRef.current;
      if (!liste) return;
      const knoepfe = Array.from(liste.querySelectorAll<HTMLButtonElement>('[data-zeit]'));
      const treffer = knoepfe.find((k) => (k.dataset.zeit ?? '') >= ziel) ?? knoepfe[knoepfe.length - 1];
      if (treffer) liste.scrollTop = treffer.offsetTop - liste.clientHeight / 2 + treffer.clientHeight / 2;
    });
  }, [offen, value]);

  const uebernehmen = () => {
    const norm = normalizeTime(entwurf);
    if (norm === null) { setUngueltig(true); return; }
    setUngueltig(false);
    setEntwurf(norm);
    if (norm !== value) onChange(norm);
  };

  const zeiten: string[] = [];
  for (let min = 0; min < 24 * 60; min += step) {
    zeiten.push(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
  }

  const hoehe = size === 'sm' ? 'h-9 text-[12px]' : 'h-11 text-sm font-bold';

  return (
    <div className={`flex flex-col ${className}`}>
      {label && <label className="mb-2 kv-label">{label}</label>}
      <div
        ref={containerRef}
        className={`flex w-full items-center rounded-md border bg-paper text-ink transition-colors focus-within:border-accent ${
          ungueltig ? 'border-danger-line' : 'border-divider'
        } ${hoehe} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <input
          type="text"
          inputMode="numeric"
          value={entwurf}
          placeholder={placeholder}
          onChange={(e) => { setEntwurf(e.target.value); setUngueltig(false); }}
          onFocus={(e) => e.target.select()}
          onBlur={uebernehmen}
          onKeyDown={(e) => {
            if (e.key === 'Enter') uebernehmen();
            if (e.key === 'ArrowDown') { e.preventDefault(); setOffen(true); }
            if (e.key === 'Escape' && offen) { e.stopPropagation(); setOffen(false); }
          }}
          disabled={disabled}
          className="min-w-0 flex-1 tabular-nums outline-none placeholder:text-muted/60"
          // Die globale Eingabefeld-Regel in style.css liegt ausserhalb jeder
          // @layer und schlägt damit jede Tailwind-Klasse — Rahmen und Abstand
          // des inneren Felds lassen sich nur inline zurücksetzen.
          style={{
            border: 'none', background: 'transparent', boxShadow: 'none',
            padding: `0 ${size === 'sm' ? '0.5rem' : '0.75rem'}`, height: '100%',
            fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'normal',
          }}
          aria-label={label ?? 'Uhrzeit'}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setOffen((o) => !o)}
          className="flex h-full shrink-0 cursor-pointer items-center px-2 text-muted hover:text-ink"
          aria-label="Uhrzeit auswählen"
        >
          <Clock size={size === 'sm' ? 12 : 14} />
        </button>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {offen && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.1 }}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPUP_WIDTH, height: POPUP_HEIGHT, zIndex: 1000 }}
              className="kv-overlay flex flex-col p-1.5"
            >
              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
                {zeiten.map((z) => (
                  <button
                    key={z}
                    type="button"
                    data-zeit={z}
                    onClick={() => { onChange(z); setEntwurf(z); setOffen(false); }}
                    className={`flex w-full cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-bold tabular-nums transition-colors ${
                      z === value ? 'bg-accent text-paper' : 'text-ink hover:bg-divider'
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
