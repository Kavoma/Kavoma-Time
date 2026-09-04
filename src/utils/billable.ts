// Abrechenbar oder nicht — die Trennung zwischen bezahlter Arbeit und allem
// anderen.
//
// Akquise, Buchhaltung, Werkzeugpflege und die eigene Fortbildung sind
// Arbeitszeit, aber kein Umsatz. Ohne die Unterscheidung sieht jede Statistik
// besser aus, als sie ist: Der effektive Stundensatz rechnet die unbezahlten
// Stunden mit, und wer seine Auslastung prüft, zählt die Steuererklärung als
// Kundenarbeit.

import type { TimeEntry } from '../types';

/**
 * **Fehlt das Feld, ist die Zeit abrechenbar.**
 *
 * So waren alle Einträge gemeint, die vor dieser Unterscheidung entstanden
 * sind, und so bleiben die Zahlen aus der Zeit davor unverändert. Nur ein
 * ausdrückliches `false` schliesst eine Zeit aus — Abwesenheit einer Angabe
 * ist keine Aussage.
 */
export function istAbrechenbar(entry: TimeEntry): boolean {
  return entry.billable !== false;
}

export function abrechenbareSekunden(entries: TimeEntry[]): number {
  return entries.reduce((s, e) => (istAbrechenbar(e) ? s + e.durationSeconds : s), 0);
}

export function interneSekunden(entries: TimeEntry[]): number {
  return entries.reduce((s, e) => (istAbrechenbar(e) ? s : s + e.durationSeconds), 0);
}

/**
 * Der abrechenbare Anteil in Prozent, gerundet.
 *
 * `null`, wenn gar keine Zeit erfasst ist — „0 %" wäre dort eine Aussage über
 * etwas, das es nicht gibt.
 */
export function abrechenbarerAnteil(entries: TimeEntry[]): number | null {
  const gesamt = entries.reduce((s, e) => s + e.durationSeconds, 0);
  if (gesamt <= 0) return null;
  return Math.round((abrechenbareSekunden(entries) / gesamt) * 100);
}

/**
 * Einen Eintrag umschalten.
 *
 * Beim Zurückschalten auf „abrechenbar" wird das Feld **entfernt** statt auf
 * `true` gesetzt: Der Vorgabewert steht dann wieder nirgends, und zwei Geräte
 * sehen dasselbe. Ein stehengelassenes `true` wäre gegenüber einem fehlenden
 * Feld eine Dauer-Änderung im Abgleich, die keine ist — derselbe Grund, aus
 * dem `paidAt` beim Zurücknehmen einer Zahlung gelöscht wird.
 */
export function mitAbrechenbarkeit(entry: TimeEntry, abrechenbar: boolean): TimeEntry {
  if (abrechenbar) {
    const { billable: _weg, ...ohne } = entry;
    return ohne as TimeEntry;
  }
  return { ...entry, billable: false };
}
