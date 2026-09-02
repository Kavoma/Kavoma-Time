import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { getLiveDurationSeconds } from '../utils/trackerTimer';

type OverlayAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h === 0) return `${mm}:${ss}`;
  return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
}

export function TimerOverlay() {
  const { state } = useAppState();
  const [, setTick] = useState(0);
  const [anchor, setAnchor] = useState<OverlayAnchor>('top-right');
  const [isDragging, setIsDragging] = useState(false);
  const dragPointerRef = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.add('timer-overlay-body');
    return () => document.body.classList.remove('timer-overlay-body');
  }, []);

  // Synchronously set ignore mouse events on mount to avoid race condition
  useEffect(() => {
    // Check availability and call synchronously
    if (window.api && typeof window.api.setIgnoreMouseEvents === 'function') {
      try {
        window.api.setIgnoreMouseEvents(true, { forward: true });
      } catch (error) {
        console.error('Failed to set initial ignore mouse events:', error);
      }
    }

    window.api?.getOverlayAnchor?.().then(setAnchor).catch(() => undefined);
    const unsubscribeAnchor = window.api?.onOverlayAnchorChanged?.(setAnchor);

    return () => {
      // Cleanup: restore normal mouse events on unmount
      if (window.api && typeof window.api.setIgnoreMouseEvents === 'function') {
        try {
          window.api.setIgnoreMouseEvents(false, { forward: false });
        } catch (error) {
          console.error('Failed to restore mouse events on unmount:', error);
        }
      }
      unsubscribeAnchor?.();
    };
  }, []);

  useEffect(() => {
    if (!state?.isRunning) return;

    const interval = window.setInterval(() => setTick(tick => tick + 1), 1000);
    return () => window.clearInterval(interval);
  }, [state?.isRunning, state?.startedAt]);

  const liveDuration = state
    ? getLiveDurationSeconds({
        isRunning: state.isRunning,
        startedAt: state.startedAt,
        elapsedBefore: state.elapsedBefore,
      })
    : 0;

  const description = state?.currentDescription?.trim() || 'Tracking';
  const isTopAnchor = anchor.startsWith('top');

  const startDrag = async (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragPointerRef.current = event.pointerId;
    setIsDragging(true);
    await window.api?.startOverlayDrag?.({
      x: event.screenX,
      y: event.screenY,
    });
  };

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPointerRef.current !== event.pointerId) return;

    dragPointerRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.api?.endOverlayDrag?.();
  };

  const openMainWindow = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
    window.api?.showMainWindowFromOverlay?.();
  };

  return (
    <div className={`timer-overlay-shell ${isTopAnchor ? 'items-start' : 'items-end'}`}>
      <div className="timer-overlay-card">
        <div className={`flex ${isTopAnchor ? 'flex-col' : 'flex-col-reverse'} items-center`}>
          <div
            className={`timer-overlay-card-core timer-overlay-chip group/timer relative flex items-center gap-2.5 px-3.5 ${isDragging ? 'is-lifted cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={startDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            onDoubleClick={openMainWindow}
            onMouseEnter={() => window.api?.setIgnoreMouseEvents?.(false)}
            onMouseLeave={() => window.api?.setIgnoreMouseEvents?.(true, { forward: true })}
            onFocus={() => window.api?.setIgnoreMouseEvents?.(false)}
            onBlur={() => window.api?.setIgnoreMouseEvents?.(true, { forward: true })}
            onTouchStart={() => window.api?.setIgnoreMouseEvents?.(false)}
            onTouchEnd={() => window.api?.setIgnoreMouseEvents?.(true, { forward: true })}
          >
            <div className="relative flex h-2 w-2 shrink-0 items-center justify-center">
              {state?.isRunning && (
                <span className="timer-status-pulse absolute inset-0 rounded-full bg-success" aria-hidden="true" />
              )}
              {/* Ohne Leuchtschein: Ein glimmender Punkt ist Dekoration,
                  die Farbe allein sagt schon, was los ist. */}
              <span className={`relative h-2 w-2 rounded-full ${state?.isRunning ? 'bg-success' : 'bg-warning'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`font-display text-[19px] font-bold leading-none tabular-nums transition-colors duration-300 ${state?.isRunning ? 'text-ink' : 'text-muted'}`}>
                {formatHMS(liveDuration)}
              </div>
              <div className={`mt-0.5 max-w-[112px] truncate text-[11px] leading-tight ${state?.isRunning ? 'text-muted' : 'text-warning'}`}>
                {state?.isRunning ? description : 'Pausiert'}
              </div>
            </div>

            {/* BUTTONS - nested inside the core card but positioned outside to inherit hover/focus state correctly without expanding the hitbox of the card itself */}
            <div
              data-no-drag
              className={`absolute left-0 right-0 flex justify-end gap-2 px-2 opacity-0 pointer-events-none cursor-default transition-opacity duration-200 ease-out group-hover/timer:opacity-100 group-hover/timer:pointer-events-auto group-focus-within/timer:opacity-100 group-focus-within/timer:pointer-events-auto ${isTopAnchor ? 'top-full translate-y-[-8px] pt-3 group-hover/timer:translate-y-0 group-focus-within/timer:translate-y-0' : 'bottom-full translate-y-[8px] pb-3 group-hover/timer:translate-y-0 group-focus-within/timer:translate-y-0'}`}
            >
              <button
                type="button"
                title={state?.isRunning ? 'Pausieren' : 'Starten'}
                aria-label={state?.isRunning ? 'Pausieren' : 'Starten'}
                data-no-drag
                onClick={() => window.api?.sendTimerOverlayCommand?.('toggle')}
                className="timer-overlay-btn bg-ink text-paper hover:bg-accent"
              >
                {state?.isRunning ? <Pause size={14} fill="currentColor" aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}
              </button>
              <button
                type="button"
                title="Stoppen"
                aria-label="Stoppen"
                data-no-drag
                onClick={() => window.api?.sendTimerOverlayCommand?.('stop')}
                className="timer-overlay-btn bg-danger-soft text-danger hover:bg-danger-solid hover:text-on-solid"
              >
                <Square size={12} fill="currentColor" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
