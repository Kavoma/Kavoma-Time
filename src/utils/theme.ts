// ============================================================
// Erscheinungsbild anwenden
// ============================================================
// Eine Stelle, die entscheidet, welches Thema WIRKT. Der AppState hält die
// Absicht („System"), dieses Modul löst sie auf („gerade dunkel") und
// schreibt sie an das Wurzelelement, wo CSS sie lesen kann.
//
// Warum ein eigenes Modul und nicht ein Effekt im Provider: Es wird zweimal
// gebraucht. Einmal beim Start, bevor React etwas gerendert hat — sonst
// blitzt ein dunkles Fenster auf, während der Store noch geladen wird —
// und einmal bei jeder Änderung. Beide Wege müssen dasselbe tun.

export type Appearance = 'system' | 'light' | 'dark';
export type Accent = 'neutral' | 'crimson';

/**
 * Letzte bekannte Wahl, damit der erste Frame schon stimmt.
 *
 * Bewusst `localStorage` und nicht der electron-store: Der wird asynchron
 * über IPC gelesen, und genau die Wartezeit ist das Problem, das hier
 * gelöst wird. Ein falscher Hinweis ist harmlos — der geladene AppState
 * korrigiert ihn Millisekunden später.
 */
const HINT_KEY = 'kavoma_appearance_hint';

export const ACCENTS: ReadonlyArray<{ key: Accent; label: string; swatch: string }> = [
  { key: 'neutral', label: 'Neutral',  swatch: '#a3a3a3' },
  { key: 'crimson', label: 'Dunkelrot', swatch: '#9f1239' },
];

export const APPEARANCES: ReadonlyArray<{ key: Appearance; label: string }> = [
  { key: 'light',  label: 'Hell' },
  { key: 'dark',   label: 'Dunkel' },
  { key: 'system', label: 'System' },
];

function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Aus der Absicht wird das Thema, das gerade gilt. */
export function resolveAppearance(appearance: Appearance): 'light' | 'dark' {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return prefersDark() ? 'dark' : 'light';
}

/**
 * Schreibt Thema und Akzent an das Wurzelelement und meldet das aufgelöste
 * Thema zurück — der Aufrufer reicht es an den Main-Prozess weiter, damit
 * Fensterrahmen und Titelleiste mitziehen.
 */
export function applyTheme(appearance: Appearance, accent: Accent, glass = true): 'light' | 'dark' {
  const resolved = resolveAppearance(appearance);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.accent = accent;
  // Nur der Aus-Fall wird markiert. „An" ist die Vorgabe und braucht kein
  // Attribut — so bleibt das DOM im Normalfall unbeschriftet.
  if (glass) delete root.dataset.glass;
  else root.dataset.glass = 'off';
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify({ appearance, accent, glass }));
  } catch { /* localStorage gesperrt — dann eben ein Aufblitzen beim nächsten Start */ }
  return resolved;
}

/**
 * Wendet die zuletzt bekannte Wahl an, bevor React rendert.
 *
 * Ohne Hinweis bleibt das Wurzelelement unmarkiert; `style.css` zeigt dann
 * das dunkle Thema, das bis 1.1.x das einzige war.
 */
export function applyStoredHint(): void {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return;
    const hint = JSON.parse(raw) as { appearance?: Appearance; accent?: Accent; glass?: boolean };
    const appearance = hint.appearance === 'light' || hint.appearance === 'dark' || hint.appearance === 'system'
      ? hint.appearance
      : 'system';
    const accent = hint.accent === 'crimson' ? 'crimson' : 'neutral';
    applyTheme(appearance, accent, hint.glass !== false);
  } catch { /* kaputter Hinweis ist kein Grund, den Start abzubrechen */ }
}

/**
 * Meldet, wenn das Betriebssystem sein Thema wechselt.
 *
 * Nur im Modus „System" von Belang; der Aufrufer entscheidet, ob er
 * zuhört. Gibt die Abmeldung zurück.
 */
export function watchSystemAppearance(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
