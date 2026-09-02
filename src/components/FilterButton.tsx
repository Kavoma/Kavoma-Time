import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, Check } from 'lucide-react';

interface FilterButtonProps {
  /**
   * Wie viele Kriterien vom Normalzustand abweichen. Null bedeutet: Der
   * Knopf tritt zurück. Alles andere macht er sichtbar — sonst sucht man
   * später, warum eine Liste leer aussieht.
   */
  activeCount: number;
  /** Setzt alle Kriterien auf den Normalzustand zurück. */
  onReset: () => void;
  /** Die eigentlichen Kriterien. Jede Ansicht bringt ihre eigenen mit. */
  children: ReactNode;
}

/**
 * Sammelt Status, Sortierung und Sonderfilter hinter einem Knopf.
 *
 * Vorher standen sie alle gleichrangig in der Werkzeugleiste: In der
 * Projektliste waren es neun Bedienblöcke, von denen acht selten gebraucht
 * werden — und die häufigste Handlung, etwas zu finden, stand mittendrin.
 * Es geht dabei keine Funktion verloren; sie verteilt sich auf zwei Ebenen
 * statt auf eine.
 */
export function FilterButton({ activeCount, onReset, children }: FilterButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const isActive = activeCount > 0;

  // Schließen bei Escape und bei einem Klick daneben. Beides gehört
  // zusammen: Ein Popover, das sich nur über seinen eigenen Knopf schließen
  // lässt, fühlt sich wie ein Dialog an, der es nicht ist.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={`kv-btn ${isActive ? 'kv-btn-outline border-accent text-ink' : 'kv-btn-outline'}`}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        Filter
        {isActive && (
          <span className="kv-count" aria-label={`${activeCount} aktive Kriterien`}>
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label="Filter"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
            className="kv-popover right-0 top-[calc(100%+6px)] origin-top-right"
          >
            <div className="flex flex-col gap-4">{children}</div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-divider pt-3">
              <button
                type="button"
                onClick={onReset}
                disabled={!isActive}
                className="kv-btn kv-btn-quiet !h-8 !px-2.5 !text-xs"
              >
                Zurücksetzen
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
                className="kv-btn kv-btn-quiet !h-8 !px-2.5 !text-xs"
              >
                Fertig
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Benannte Gruppe innerhalb des Filter-Popovers. */
export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="kv-label mb-2">{title}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

interface FilterChoiceProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  /**
   * `radio` für eine Auswahl unter mehreren (Sortierung), `checkbox` für
   * mehrere gleichzeitig (Status). Die Rolle steuert nicht nur die
   * Semantik für Screenreader, sondern auch, was Nutzende erwarten.
   */
  role?: 'checkbox' | 'radio';
  disabled?: boolean;
}

/** Eine Zeile im Filter-Popover. */
export function FilterChoice({
  label, checked, onToggle, role = 'checkbox', disabled = false,
}: FilterChoiceProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'text-ink' : 'text-muted hover:bg-divider hover:text-ink'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${
          role === 'radio' ? 'rounded-full' : 'rounded-[4px]'
        } ${checked ? 'border-primary bg-primary text-on-primary' : 'border-divider'}`}
      >
        {checked && <Check size={10} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}
