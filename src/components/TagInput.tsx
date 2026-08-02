import { useState, useRef, useEffect, useLayoutEffect, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import { tagColors } from '../utils/tagColor';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Vorschläge für Auto-Suggest. Alle bereits in der App verwendeten Tags. */
  suggestions?: string[];
  placeholder?: string;
  /** Read-only Anzeige (ohne Add/Remove-Buttons). */
  readOnly?: boolean;
  /** Wenn true: Chips kleiner für kompakte Listen-Darstellung. */
  compact?: boolean;
}

const SUGGEST_PAD = 8;

/**
 * Tag-Eingabe mit Free-Text + Auto-Suggest. Tag-Farbe wird deterministisch
 * aus dem Tag-Text gehasht — gleiches Tag in der ganzen App hat dieselbe Farbe.
 *
 * Add-Trigger: Enter, Comma, Tab oder Blur. Remove: Klick auf Chip-X oder
 * Backspace im leeren Input löscht den letzten Tag.
 *
 * Suggest-Popup ist via Portal an document.body — entkommt overflow-hidden-
 * Containern wie Drawer-Bodies.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Tag eingeben…',
  readOnly = false,
  compact = false,
}: TagInputProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 240 });

  const trimmed = text.trim();
  const filtered = trimmed
    ? suggestions.filter((s) => s.toLowerCase().includes(trimmed.toLowerCase()) && !value.includes(s)).slice(0, 8)
    : suggestions.filter((s) => !value.includes(s)).slice(0, 8);

  const canCreate = trimmed.length > 0 && !value.some((t) => t.toLowerCase() === trimmed.toLowerCase());
  const showCreate = canCreate && !filtered.some((s) => s.toLowerCase() === trimmed.toLowerCase());
  const itemCount = filtered.length + (showCreate ? 1 : 0);

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (value.some((existing) => existing.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
    setText('');
    setHighlight(0);
  };

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (open && filtered[highlight]) {
        e.preventDefault();
        addTag(filtered[highlight]);
        return;
      }
      if (trimmed) {
        e.preventDefault();
        addTag(trimmed);
      }
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      e.preventDefault();
      removeTag(value.length - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(0, itemCount - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Popup-Position berechnen
  const updatePos = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const popHeight = popupRef.current?.offsetHeight ?? 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < popHeight + SUGGEST_PAD && rect.top > spaceBelow;
    setPopupPos({
      top: placeAbove ? rect.top - popHeight - SUGGEST_PAD : rect.bottom + SUGGEST_PAD,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (open) updatePos();
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updatePos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const chipPad = compact ? 'px-1.5 py-0' : 'px-2 py-0.5';
  const chipText = compact ? 'text-[9px]' : 'text-[10px]';

  return (
    <div ref={wrapRef} className="relative">
      <div
        onClick={() => !readOnly && inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 rounded-md border ${
          readOnly ? 'border-transparent bg-transparent p-0' : 'border-divider bg-paper px-2 py-1.5 cursor-text focus-within:border-accent'
        }`}
      >
        {value.map((tag, idx) => {
          const c = tagColors(tag);
          return (
            <span
              key={`${tag}-${idx}`}
              className={`inline-flex items-center gap-1 rounded-full border ${chipPad} ${chipText} font-bold uppercase tracking-wider`}
              style={{ background: c.bg, color: c.text, borderColor: c.border }}
            >
              {tag}
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeTag(idx); }}
                  className="cursor-pointer opacity-60 hover:opacity-100"
                  aria-label={`Tag ${tag} entfernen`}
                >
                  <X size={9} />
                </button>
              )}
            </span>
          );
        })}
        {!readOnly && (
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true); setHighlight(0); }}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            placeholder={value.length === 0 ? placeholder : ''}
            className="min-w-[6rem] flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-muted"
          />
        )}
        {readOnly && value.length === 0 && (
          <span className="text-[11px] text-muted/60">—</span>
        )}
      </div>

      {!readOnly && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && itemCount > 0 && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'fixed',
                top: popupPos.top,
                left: popupPos.left,
                minWidth: popupPos.width,
                maxWidth: 320,
                zIndex: 1000,
              }}
              className="rounded-lg border border-divider bg-surface p-1 shadow-2xl"
            >
              {filtered.map((s, idx) => {
                const c = tagColors(s);
                const active = idx === highlight;
                return (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => addTag(s)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                      active ? 'bg-divider' : 'hover:bg-divider/60'
                    }`}
                  >
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                    >
                      {s}
                    </span>
                  </button>
                );
              })}
              {showCreate && (
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(filtered.length)}
                  onClick={() => addTag(trimmed)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                    highlight === filtered.length ? 'bg-divider' : 'hover:bg-divider/60'
                  }`}
                >
                  <Plus size={11} className="text-muted" />
                  <span className="text-muted">Neu:</span>
                  <span className="font-bold text-ink">{trimmed}</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
