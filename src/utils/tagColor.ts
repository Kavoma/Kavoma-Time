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
 * Returnt zwei Töne: `bg` (gedämpfter Hintergrund), `text` (kräftiger Vordergrund),
 * `border` (subtile Border). Designt für die dunkle App-Palette.
 */
export function tagColors(tag: string): { bg: string; text: string; border: string } {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) {
    return { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', border: 'rgba(100,116,139,0.3)' };
  }
  const hue = djb2(normalized) % 360;
  return {
    bg: `hsl(${hue} 60% 55% / 0.15)`,
    text: `hsl(${hue} 70% 75%)`,
    border: `hsl(${hue} 60% 55% / 0.35)`,
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
