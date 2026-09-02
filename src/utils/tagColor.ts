// Deterministische HSL-Farbe aus Tag-Text — gleiches Tag = gleiche Farbe,
// ohne dass ein Tag-Pool oder explizite Zuweisung nötig wäre.

/** djb2-Hash → 32-Bit Integer */
function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Liefert ein farbiges Tag-Token (Hue + sanfte Saturation/Lightness) als CSS-Strings.
 * Die Farbe ist stabil über App-Restarts hinweg, weil sie aus dem Text gehasht wird.
 *
 * Returnt drei Töne: `bg` (gedämpfter Hintergrund), `text` (kräftiger Vordergrund),
 * `border` (subtile Border).
 *
 * Die Helligkeiten liegen doppelt vor. Ein Ton, der auf Schwarz freundlich
 * wirkt (75 % Lightness), ist auf Weiß nicht mehr lesbar — dieselbe Hue
 * braucht im Hellmodus rund 32 %. Die Auswahl übernimmt `light-dark()`:
 * Es folgt dem `color-scheme`, das `style.css` am Wurzelelement setzt, und
 * kommt damit ohne JavaScript und ohne Kenntnis des AppState aus.
 */
export function tagColors(tag: string): { bg: string; text: string; border: string } {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) {
    return {
      bg: 'light-dark(rgba(100,116,139,0.12), rgba(100,116,139,0.15))',
      text: 'light-dark(#475569, #94a3b8)',
      border: 'light-dark(rgba(100,116,139,0.28), rgba(100,116,139,0.3))',
    };
  }
  const hue = djb2(normalized) % 360;
  return {
    bg: `light-dark(hsl(${hue} 65% 45% / 0.12), hsl(${hue} 60% 55% / 0.15))`,
    text: `light-dark(hsl(${hue} 70% 32%), hsl(${hue} 70% 75%))`,
    border: `light-dark(hsl(${hue} 55% 45% / 0.30), hsl(${hue} 60% 55% / 0.35))`,
  };
}

/** Alle vorhandenen Tags aus einer Liste von Entitäten extrahieren (deduped, sortiert). */
export function collectTags<T extends { tags?: string[] }>(items: T[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (Array.isArray(item.tags)) {
      for (const t of item.tags) {
        const trimmed = t.trim();
        if (trimmed) set.add(trimmed);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}
