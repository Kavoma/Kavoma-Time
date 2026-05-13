import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { getLiveDurationSeconds } from '../utils/trackerTimer';

type OverlayAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

    return () => {
      // Cleanup: restore normal mouse events on unmount
      if (window.api && typeof window.api.setIgnoreMouseEvents === 'function') {
        try {
          window.api.setIgnoreMouseEvents(false, { forward: false });
        } catch (error) {
          console.error('Failed to restore mouse events on unmount:', error);
        }
      }
      window.api?.onOverlayAnchorChanged?.(setAnchor);
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

  const openMainWindow = () => {
    window.api?.showMainWindowFromOverlay?.();
  };

  return (
    <div className={`timer-overlay-shell ${isTopAnchor ? 'items-start' : 'items-end'}`}>
      <div className="timer-overlay-card">
        <div className={`flex ${isTopAnchor ? 'flex-col' : 'flex-col-reverse'} items-center`}>
          <div
            className={`timer-overlay-card-core group/timer relative flex h-[54px] w-[184px] items-center gap-3 rounded-[20px] border border-white/12 bg-[#101010]/80 px-4 shadow-[0_20px_70px_rgba(0,0,0,0.45),0_10px_20px_rgba(0,0,0,0.2)] backdrop-blur-3xl transition-transform duration-200 ${isDragging ? 'scale-105 rotate-[-1.5deg] cursor-grabbing shadow-[0_25px_80px_rgba(0,0,0,0.55)]' : 'cursor-grab hover:scale-[1.02]'}`}
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
            <div className={`h-2.5 w-2.5 rounded-full ${state?.isRunning ? 'bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.95)]' : 'bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.8)]'}`} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[24px] font-black leading-none tabular-nums tracking-normal text-white">
                {formatHMS(liveDuration)}
              </div>
              <div className="mt-0.5 max-w-[118px] truncate text-[8px] font-black uppercase tracking-[0.16em] text-white/40">
                {state?.isRunning ? description : 'Pausiert'}
              </div>
            </div>

            {/* BUTTONS - nested inside the core card but positioned outside to inherit hover state correctly without expanding the hitbox of the card itself */}
            <div 
              data-no-drag
              className={`absolute left-0 right-0 flex justify-end gap-2 px-2 opacity-0 pointer-events-none cursor-default transition-all duration-200 group-hover/timer:opacity-100 group-hover/timer:pointer-events-auto ${isTopAnchor ? 'top-full translate-y-[-8px] pt-3 group-hover/timer:translate-y-0' : 'bottom-full translate-y-[8px] pb-3 group-hover/timer:translate-y-0'}`}
            >
              <button
                type="button"
                title={state?.isRunning ? 'Pausieren' : 'Starten'}
                data-no-drag
                onClick={() => window.api?.sendTimerOverlayCommand?.('toggle')}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[14px] border border-white/10 bg-white text-black shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition-transform hover:scale-105 active:scale-95"
              >
                {state?.isRunning ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              </button>
              <button
                type="button"
                title="Stoppen"
                data-no-drag
                onClick={() => window.api?.sendTimerOverlayCommand?.('stop')}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[14px] border border-red-300/25 bg-red-500/95 text-white shadow-[0_12px_28px_rgba(127,29,29,0.32)] transition-transform hover:scale-105 active:scale-95"
              >
                <Square size={14} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
