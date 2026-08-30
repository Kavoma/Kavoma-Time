import type { TimeEntry } from '../types';

/**
 * Bisher genutzte Beschreibungen, häufigste zuerst, bei Gleichstand die neuere.
 *
 * Eine reine Liste in Eingabereihenfolge ist als Vorschlag schwach: Was man
 * dreimal die Woche tippt, soll oben stehen — nicht das, was zufällig zuletzt
 * dran war.
 */
export function collectDescriptionSuggestions(entries: TimeEntry[], limit = 50): string[] {
  const counts = new Map<string, { count: number; newest: number }>();

  for (const entry of entries) {
    const description = (entry.description || '').trim();
    if (!description) continue;
    const current = counts.get(description);
    if (current) {
      current.count += 1;
      current.newest = Math.max(current.newest, entry.startedAt || 0);
    } else {
      counts.set(description, { count: 1, newest: entry.startedAt || 0 });
    }
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1].count - a[1].count) || (b[1].newest - a[1].newest))
    .slice(0, limit)
    .map(([description]) => description);
}
