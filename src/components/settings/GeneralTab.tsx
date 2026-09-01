import { useEffect, useRef, useState } from 'react';
import { Clock, Keyboard, BellRing } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { NumberInput } from '../NumberInput';
import { SettingsCard } from './SettingsCard';
import { Switch } from './Switch';

// Wandelt ein KeyboardEvent in einen Electron-Accelerator-String um
function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;

  let mapped = key;
  if (key === ' ') mapped = 'Space';
  else if (key === 'Escape') mapped = 'Esc';
  else if (key === 'ArrowUp') mapped = 'Up';
  else if (key === 'ArrowDown') mapped = 'Down';
  else if (key === 'ArrowLeft') mapped = 'Left';
  else if (key === 'ArrowRight') mapped = 'Right';
  else if (key.length === 1) mapped = key.toUpperCase();

  parts.push(mapped);
  return parts.join('+');
}

function prettyAccelerator(acc: string): string {
  return acc
    .replace(/CommandOrControl/g, 'Strg')
    .replace(/CmdOrCtrl/g, 'Strg')
    .replace(/Control/g, 'Strg')
    .replace(/Command/g, '⌘')
    .replace(/\+/g, ' + ');
}

const NAV_SHORTCUTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'Strg/⌘ + 1', label: 'Tracker' },
  { key: 'Strg/⌘ + 2', label: 'Projekte' },
  { key: 'Strg/⌘ + 3', label: 'Kunden' },
  { key: 'Strg/⌘ + 4', label: 'Statistik' },
  { key: 'Strg/⌘ + 5', label: 'Finanzen' },
  { key: 'Strg/⌘ + 6', label: 'Einstellungen' },
];

export function GeneralTab() {
  const { state, setState } = useAppState();
  const [listening, setListening] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Shortcut-Recording
  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListening(false);
        return;
      }
      const acc = eventToAccelerator(e);
      if (!acc) return;
      setState(s => s ? { ...s, shortcuts: { ...s.shortcuts, startPause: acc } } : null);
      window.api?.setStartPauseShortcut(acc);
      setListening(false);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as any);
  }, [listening, setState]);

  if (!state) return null;

  const afkEnabled = state.afkPauseEnabled !== false;
  const overlayEnabled = state.timerOverlayEnabled !== false;
  // Unter macOS gibt es das Overlay nicht — die laufende Zeit steht dort in der
  // Menüleiste. Ein Schalter ohne Wirkung wäre schlimmer als kein Schalter.
  const overlaySupported = window.api?.overlaySupported !== false;

  const updateTarget = (h: number) => setState(s => s ? { ...s, weeklyTargetHours: h } : null);
  const updateAfkEnabled = (next: boolean) => setState(s => s ? { ...s, afkPauseEnabled: next } : null);
  const updateAfkMinutes = (m: number) => {
    const next = Math.min(240, Math.max(1, m));
    setState(s => s ? { ...s, afkTimeoutMinutes: next } : null);
  };
  const updateOverlay = (next: boolean) => setState(s => s ? { ...s, timerOverlayEnabled: next } : null);

  const reminderEnabled = state.endOfDayReminderEnabled === true;
  const stopOnShutdown = state.stopOnShutdownEnabled !== false;
  const reminderHour = state.endOfDayReminderHour ?? 18;
  const reminderMinute = state.endOfDayReminderMinute ?? 30;

  const updateReminderEnabled = (next: boolean) => setState(s => s ? { ...s, endOfDayReminderEnabled: next } : null);
  const updateReminderHour = (h: number) => {
    const next = Math.min(23, Math.max(0, h));
    setState(s => s ? { ...s, endOfDayReminderHour: next } : null);
  };
  const updateReminderMinute = (m: number) => {
    const next = Math.min(59, Math.max(0, m));
    setState(s => s ? { ...s, endOfDayReminderMinute: next } : null);
  };
  const updateStopOnShutdown = (next: boolean) => setState(s => s ? { ...s, stopOnShutdownEnabled: next } : null);

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard icon={Clock} title="Timer & Workflow">
        <div className="flex flex-col divide-y divide-divider/60">
          {/* Wochenziel */}
          <div className="flex items-center justify-between gap-4 pb-4">
            <div>
              <div className="text-sm font-bold text-ink">Wochenziel</div>
              <div className="mt-0.5 text-xs text-muted">Soll-Stunden, gegen die der Fortschritt im Tracker gemessen wird.</div>
            </div>
            <div className="flex items-center gap-2">
              <NumberInput
                min={1}
                max={168}
                value={state.weeklyTargetHours}
                onChange={updateTarget}
                className="w-20"
              />
              <span className="text-xs text-muted">h / Woche</span>
            </div>
          </div>

          {/* AFK-Pause */}
          <div className="flex items-start justify-between gap-4 py-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">Pausen erkennen</div>
              <div className="mt-0.5 text-xs text-muted">
                War der Rechner länger unbenutzt, gesperrt oder im Ruhezustand, während die Zeiterfassung lief, fragt die App beim Zurückkommen, ob die Zeit abgezogen werden soll.
              </div>
              <div className={`mt-3 flex items-center gap-2 ${afkEnabled ? '' : 'opacity-45'}`}>
                <NumberInput
                  min={1}
                  max={240}
                  value={state.afkTimeoutMinutes ?? 10}
                  onChange={updateAfkMinutes}
                  disabled={!afkEnabled}
                  className="w-20"
                />
                <span className="text-xs text-muted">Minuten ohne Aktivität</span>
              </div>
            </div>
            <Switch checked={afkEnabled} onChange={updateAfkEnabled} ariaLabel="Pausenerkennung aktivieren" />
          </div>

          {/* Timer Overlay — nur Windows/Linux */}
          {overlaySupported && (
            <div className="flex items-start justify-between gap-4 pt-4">
              <div>
                <div className="text-sm font-bold text-ink">Timer-Overlay</div>
                <div className="mt-0.5 text-xs text-muted">
                  Kleines Overlay-Fenster im Hintergrund, ziehbar mit Snap in die nächste Bildschirmecke.
                </div>
              </div>
              <Switch checked={overlayEnabled} onChange={updateOverlay} ariaLabel="Timer-Overlay anzeigen" />
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard icon={BellRing} title="Vergessene Timer">
        <div className="flex flex-col divide-y divide-divider/60">
          {/* Feierabend-Erinnerung */}
          <div className="flex items-start justify-between gap-4 pb-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">Abends erinnern</div>
              <div className="mt-0.5 text-xs text-muted">
                Läuft zu dieser Uhrzeit noch eine Zeiterfassung, meldet sich die App einmal — bevor daraus über Nacht ein Vierzehn-Stunden-Eintrag wird.
              </div>
              <div className={`mt-3 flex items-center gap-2 ${reminderEnabled ? '' : 'opacity-45'}`}>
                <NumberInput
                  min={0}
                  max={23}
                  value={reminderHour}
                  onChange={updateReminderHour}
                  disabled={!reminderEnabled}
                  className="w-16"
                />
                <span className="text-xs text-muted">:</span>
                <NumberInput
                  min={0}
                  max={59}
                  value={reminderMinute}
                  onChange={updateReminderMinute}
                  disabled={!reminderEnabled}
                  className="w-16"
                />
                <span className="text-xs text-muted">Uhr</span>
              </div>
            </div>
            <Switch checked={reminderEnabled} onChange={updateReminderEnabled} ariaLabel="Feierabend-Erinnerung aktivieren" />
          </div>

          {/* Beim Herunterfahren stoppen */}
          <div className="flex items-start justify-between gap-4 pt-4">
            <div>
              <div className="text-sm font-bold text-ink">Beim Herunterfahren stoppen</div>
              <div className="mt-0.5 text-xs text-muted">
                Wird der Rechner heruntergefahren oder abgemeldet, endet eine laufende Zeiterfassung automatisch — ohne Rückfrage, dafür bleibt dann keine Zeit.
              </div>
            </div>
            <Switch checked={stopOnShutdown} onChange={updateStopOnShutdown} ariaLabel="Beim Herunterfahren stoppen" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard icon={Keyboard} title="Tastenkürzel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-ink">Start / Pause</div>
            <div className="mt-0.5 text-xs text-muted">Global aktiv, auch wenn die App im Hintergrund läuft.</div>
          </div>
          <button
            ref={buttonRef}
            onClick={() => setListening(l => !l)}
            className={`min-w-44 cursor-pointer rounded-md border px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${
              listening
                ? 'border-accent bg-paper text-accent animate-pulse'
                : 'border-divider bg-paper text-ink hover:border-ink'
            }`}
          >
            {listening ? 'Taste drücken…' : prettyAccelerator(state.shortcuts.startPause)}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted">Esc bricht die Aufnahme ab.</p>

        <div className="mt-6 border-t border-divider pt-4">
          <div className="mb-3 kv-label">Navigation (Schnellzugriff)</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {NAV_SHORTCUTS.map(sc => (
              <div key={sc.key} className="flex items-center justify-between">
                <span className="text-xs text-ink">{sc.label}</span>
                <kbd className="rounded border border-divider bg-paper px-1.5 py-0.5 text-[10px] font-bold text-muted shadow-sm">{sc.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
