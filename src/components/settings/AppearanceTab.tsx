import { Palette, Sun, Moon, Monitor, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { SettingsCard } from './SettingsCard';
import { Switch } from './Switch';
import { InfoTooltip } from './InfoTooltip';
import { ACCENTS, resolveAppearance, type Accent, type Appearance } from '../../utils/theme';

const APPEARANCE_ICON: Record<Appearance, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const APPEARANCE_OPTIONS: ReadonlyArray<{ key: Appearance; label: string; hint: string }> = [
  { key: 'light',  label: 'Hell',   hint: 'Immer helles Thema' },
  { key: 'dark',   label: 'Dunkel', hint: 'Immer dunkles Thema' },
  { key: 'system', label: 'System', hint: 'Folgt dem Betriebssystem' },
];

export function AppearanceTab() {
  const { state, setState } = useAppState();
  if (!state) return null;

  const appearance: Appearance = state.appearance ?? 'system';
  const accent: Accent = state.accent ?? 'neutral';
  const glass = state.glassEnabled !== false;
  const resolved = resolveAppearance(appearance);

  const updateAppearance = (next: Appearance) => setState(s => s ? { ...s, appearance: next } : null);
  const updateAccent = (next: Accent) => setState(s => s ? { ...s, accent: next } : null);
  const updateGlass = (next: boolean) => setState(s => s ? { ...s, glassEnabled: next } : null);

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard icon={Palette} title="Erscheinungsbild">
        <div className="flex flex-col gap-5">
          {/* Thema */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-ink">Thema</span>
              <InfoTooltip>
                Gilt auf allen Geräten. Thema und Akzent gehören zur Person, nicht
                zum Rechner, und werden deshalb abgeglichen.
              </InfoTooltip>
            </div>
            <div
              role="radiogroup"
              aria-label="Thema"
              className="mt-3 grid grid-cols-3 gap-2"
            >
              {APPEARANCE_OPTIONS.map(opt => {
                const Icon = APPEARANCE_ICON[opt.key];
                const isActive = appearance === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => updateAppearance(opt.key)}
                    className={`flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[10px] border text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                      isActive
                        ? 'border-accent bg-raised text-ink'
                        : 'border-divider bg-paper text-muted hover:border-ink hover:text-ink'
                    }`}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {appearance === 'system' && (
              <div className="mt-2 text-[11px] text-muted">
                Das System zeigt gerade das {resolved === 'dark' ? 'dunkle' : 'helle'} Thema.
              </div>
            )}
          </div>

          {/* Akzent */}
          <div className="border-t border-divider pt-5">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-ink">Akzent</span>
              <InfoTooltip>
                Färbt Primäraktion, Auswahl und den aktiven Reiter. Eine freie
                Farbwahl gibt es nicht: Jede angebotene Kombination ist in beiden
                Themen auf Lesbarkeit geprüft.
              </InfoTooltip>
            </div>
            <div role="radiogroup" aria-label="Akzentfarbe" className="mt-3 flex flex-wrap gap-2">
              {ACCENTS.map(a => {
                const isActive = accent === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => updateAccent(a.key)}
                    className={`flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                      isActive
                        ? 'border-accent bg-raised text-ink'
                        : 'border-divider bg-paper text-muted hover:border-ink hover:text-ink'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full border border-divider"
                      style={{ background: a.swatch }}
                    />
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Glas */}
          <div className="border-t border-divider pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold text-ink">Dezentes Glas</span>
                <InfoTooltip>
                  Lässt Seitenleiste, Titelleiste und schwebende Leisten durchscheinen.
                  Aus ist eine vollwertige Einstellung: Dieselben Flächen stehen dann
                  deckend da, keine Funktion hängt daran. Gilt nur auf diesem Gerät,
                  weil Unschärfe Rechenzeit kostet.
                </InfoTooltip>
              </div>
              <Switch checked={glass} onChange={updateGlass} ariaLabel="Dezentes Glas" />
            </div>
          </div>

          {/* Vorschau der Rollen — bewusst klein und nüchtern, keine Galerie. */}
          <div className="border-t border-divider pt-5">
            <div className="kv-label mb-3 flex items-center gap-1.5">
              <Layers size={11} aria-hidden="true" />Vorschau
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="kv-btn kv-btn-primary">Primäraktion</button>
              <button type="button" className="kv-btn kv-btn-outline">Sekundär</button>
              <button type="button" className="kv-btn kv-btn-quiet">Ruhig</button>
              <button type="button" className="kv-btn kv-btn-danger">Löschen</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="kv-badge bg-success-soft text-success">Bezahlt</span>
              <span className="kv-badge bg-warning-soft text-warning">Offen</span>
              <span className="kv-badge bg-danger-soft text-danger">Überfällig</span>
              <span className="kv-badge bg-info-soft text-info">Entwurf</span>
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
