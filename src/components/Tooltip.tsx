import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
type TooltipVariant = 'compact' | 'rich';
type TooltipTrigger = 'hover' | 'hover-click';

interface TooltipProps {
  children: React.ReactNode;
  /** Für compact: kurzer Hint-Text. Für rich: beliebiger ReactNode (mehrzeilig erlaubt). */
  content: React.ReactNode;
  position?: TooltipPosition;
  /**
   * 'compact' (Default) = bisheriges Verhalten: einzeilig, uppercase, kein Portal.
   * 'rich' = Mehrzeilen-Erklärung, Portal, max-w-xs, Text selektierbar.
   */
  variant?: TooltipVariant;
  /**
   * 'hover' (Default) = öffnet bei Hover/Focus, schließt bei Leave/Blur.
   * 'hover-click' = wie hover, aber Click pinnt den Tooltip offen bis Outside-Click oder Esc.
   * Nur sinnvoll mit variant='rich'.
   */
  trigger?: TooltipTrigger;
}

const PORTAL_GAP = 8;
const PORTAL_PAD = 8;
const HOVER_DELAY = 400;

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = 'top',
  variant = 'compact',
  trigger = 'hover',
}) => {
  const [isHover, setIsHover] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Portal-Position (nur für variant='rich')
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; placement: TooltipPosition }>({
    top: 0, left: 0, placement: position,
  });

  const isVisible = isHover || isPinned;

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsHover(true), HOVER_DELAY);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHover(false);
  };

  const togglePin = useCallback((e: React.MouseEvent) => {
    if (trigger !== 'hover-click') return;
    e.preventDefault();
    e.stopPropagation();
    setIsPinned((p) => !p);
  }, [trigger]);

  // Outside-Click + Esc schließen den gepinnten Tooltip
  useEffect(() => {
    if (!isPinned) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setIsPinned(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPinned(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isPinned]);

  // Portal-Positionierung (variant='rich')
  const updatePosition = useCallback(() => {
    const wrap = wrapperRef.current;
    const pop = popupRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const popHeight = pop?.offsetHeight ?? 80;
    const popWidth = pop?.offsetWidth ?? 280;

    // Initial gewünschtes Placement; bei Platzmangel flippen
    let placement: TooltipPosition = position;
    if (placement === 'top' && rect.top < popHeight + PORTAL_GAP + PORTAL_PAD) placement = 'bottom';
    else if (placement === 'bottom' && window.innerHeight - rect.bottom < popHeight + PORTAL_GAP + PORTAL_PAD) placement = 'top';
    else if (placement === 'left' && rect.left < popWidth + PORTAL_GAP + PORTAL_PAD) placement = 'right';
    else if (placement === 'right' && window.innerWidth - rect.right < popWidth + PORTAL_GAP + PORTAL_PAD) placement = 'left';

    let top = 0;
    let left = 0;
    switch (placement) {
      case 'top':
        top = rect.top - popHeight - PORTAL_GAP;
        left = rect.left + rect.width / 2 - popWidth / 2;
        break;
      case 'bottom':
        top = rect.bottom + PORTAL_GAP;
        left = rect.left + rect.width / 2 - popWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - popHeight / 2;
        left = rect.left - popWidth - PORTAL_GAP;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - popHeight / 2;
        left = rect.right + PORTAL_GAP;
        break;
    }

    // Im Viewport halten
    left = Math.min(Math.max(PORTAL_PAD, left), window.innerWidth - popWidth - PORTAL_PAD);
    top = Math.min(Math.max(PORTAL_PAD, top), window.innerHeight - popHeight - PORTAL_PAD);

    setPopupPos({ top, left, placement });
  }, [position]);

  useLayoutEffect(() => {
    if (variant === 'rich' && isVisible) updatePosition();
  }, [variant, isVisible, content, updatePosition]);

  useEffect(() => {
    if (variant !== 'rich' || !isVisible) return;
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [variant, isVisible, updatePosition]);

  if (!content) return <>{children}</>;

  // ─────────── COMPACT (Legacy, unverändertes Verhalten) ───────────
  if (variant === 'compact') {
    const positionClasses: Record<TooltipPosition, string> = {
      top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
      bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
      left: 'right-full top-1/2 -translate-y-1/2 mr-2',
      right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };
    const offset = 4;
    const initialX = position === 'left' ? offset : position === 'right' ? -offset : 0;
    const initialY = position === 'top' ? offset : position === 'bottom' ? -offset : 0;

    return (
      <div
        ref={wrapperRef}
        className="relative inline-flex items-center"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: initialX, y: initialY }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ position: 'absolute' }}
              role="tooltip"
              className={`kv-glass z-[10001] px-2.5 py-1.5 border border-divider text-[9px] font-black uppercase tracking-[0.15em] text-ink rounded-md shadow-[0_8px_30px_rgb(0,0,0,0.5)] pointer-events-none whitespace-nowrap ${positionClasses[position]}`}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─────────── RICH (Portal, mehrzeilig, klickbar) ───────────
  const wrapperEvents = trigger === 'hover-click'
    ? {
        onMouseEnter: showTooltip,
        onMouseLeave: hideTooltip,
        onFocus: showTooltip,
        onBlur: hideTooltip,
        onClick: togglePin,
      }
    : {
        onMouseEnter: showTooltip,
        onMouseLeave: hideTooltip,
        onFocus: showTooltip,
        onBlur: hideTooltip,
      };

  return (
    <span ref={wrapperRef as React.RefObject<HTMLSpanElement>} className="relative inline-flex items-center" {...wrapperEvents}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, scale: 0.96, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                top: popupPos.top,
                left: popupPos.left,
                maxWidth: 320,
                zIndex: 10001,
              }}
              role="tooltip"
              className="kv-glass rounded-lg border border-divider px-3 py-2.5 text-[11px] leading-relaxed text-ink shadow-[0_12px_40px_rgb(0,0,0,0.5)]"
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
};
