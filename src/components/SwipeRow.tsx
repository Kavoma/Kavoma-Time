import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  GESTURE_END_MS,
  isHorizontalSwipe,
  nextSwipeOffset,
  reachesDeleteThreshold,
} from '../utils/swipeGesture';

interface SwipeRowProps {
  /** Aus, solange die Auswahl aktiv ist oder das System keine Trackpad-Geste liefert. */
  enabled: boolean;
  onSwipeDelete: () => void;
  accentColor: string;
  selected: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * Eintragszeile, die sich mit zwei Fingern nach rechts wegwischen lässt.
 *
 * Das Trackpad liefert die Geste als `wheel`-Ereignis mit `deltaX`. React hängt
 * `onWheel` passiv ein, dort ließe sich das Scrollen nicht unterdrücken —
 * deshalb ein eigener Listener mit `passive: false`.
 *
 * Eine Rückfrage gibt es bewusst nicht: Wer wischt, will löschen. Der Fehlgriff
 * wird über die Rückgängig-Leiste aufgefangen, nicht über einen Dialog, der
 * jedes Mal im Weg steht.
 */
export function SwipeRow({
  enabled,
  onSwipeDelete,
  accentColor,
  selected,
  onContextMenu,
  onDoubleClick,
  onClick,
  children,
}: SwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const rowRef = useRef<HTMLLIElement>(null);
  const offsetRef = useRef(0);
  const endTimerRef = useRef<number | null>(null);
  // Der Callback wechselt bei jedem Render die Identität; als Ref muss der
  // Listener deshalb nicht ständig neu eingehängt werden.
  const deleteRef = useRef(onSwipeDelete);
  useEffect(() => { deleteRef.current = onSwipeDelete; }, [onSwipeDelete]);

  useEffect(() => {
    const node = rowRef.current;
    if (!node || !enabled) {
      offsetRef.current = 0;
      setOffset(0);
      return;
    }

    const finish = () => {
      endTimerRef.current = null;
      const reached = reachesDeleteThreshold(offsetRef.current);
      offsetRef.current = 0;
      setOffset(0);
      if (reached) deleteRef.current();
    };

    const handleWheel = (e: WheelEvent) => {
      // Senkrechtes Scrollen gehört der Liste, nicht der Zeile.
      if (!isHorizontalSwipe(e.deltaX, e.deltaY)) return;
      e.preventDefault();

      const next = nextSwipeOffset(offsetRef.current, e.deltaX);
      offsetRef.current = next;
      setOffset(next);

      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = window.setTimeout(finish, GESTURE_END_MS);
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', handleWheel);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    };
  }, [enabled]);

  const armed = reachesDeleteThreshold(offset);

  return (
    <li ref={rowRef} className="relative overflow-hidden rounded-md">
      {/* Liegt hinter der Zeile und wird beim Wischen sichtbar. */}
      {offset > 0 && (
        <div
          className={`absolute inset-0 flex items-center gap-2 rounded-md px-4 text-[11px] font-bold uppercase tracking-widest transition-colors ${
            armed ? 'bg-red-500/25 text-red-300' : 'bg-red-500/10 text-red-400/70'
          }`}
          aria-hidden
        >
          <Trash2 size={14} />
          Löschen
        </div>
      )}

      <div
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
        className={`group relative flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2.5 transition-colors cursor-pointer ${
          selected ? 'bg-divider ring-1 ring-ink/25' : 'bg-surface hover:bg-divider'
        }`}
        style={{
          borderLeftColor: accentColor,
          transform: offset > 0 ? `translateX(${offset}px)` : undefined,
          // Während der Geste folgt die Zeile dem Finger ohne Verzögerung;
          // beim Zurückschnappen darf es weich sein.
          transition: offset > 0 ? 'none' : 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {children}
      </div>
    </li>
  );
}
