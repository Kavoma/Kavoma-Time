/**
 * Rechnerei hinter dem Wischen zum Löschen (macOS-Trackpad).
 *
 * Liegt getrennt von der Komponente, damit sich die Schwellen ohne DOM prüfen
 * lassen — und weil Fast Refresh nur greift, solange eine Datei ausschließlich
 * Komponenten exportiert.
 */

/** Ab hier löst das Loslassen die Aktion aus. */
export const DELETE_THRESHOLD = 88;
/** Weiter lässt sich die Zeile nicht ziehen — der Rest ist Widerstand. */
export const OFFSET_MAX = 140;
/** So lange ohne weiteres Ereignis gilt die Geste als beendet. */
export const GESTURE_END_MS = 140;

/**
 * Waagerecht oder senkrecht? Das Trackpad liefert bei einer Wischgeste beides,
 * die überwiegende Richtung entscheidet — sonst würde jedes leicht schräge
 * Scrollen die Zeile mitziehen.
 */
export function isHorizontalSwipe(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) > Math.abs(deltaY);
}

/**
 * Neue Position der Zeile.
 *
 * Mit der macOS-Standardeinstellung ("natürliches Scrollen") liefert ein Wisch
 * nach rechts ein negatives `deltaX` — dieselbe Richtung, in die auch das
 * Zurückblättern im Browser geht. Wer natürliches Scrollen abgeschaltet hat,
 * wischt entsprechend nach links.
 */
export function nextSwipeOffset(current: number, deltaX: number): number {
  return Math.max(0, Math.min(OFFSET_MAX, current - deltaX));
}

/** Ob das Loslassen bei dieser Position löscht. */
export function reachesDeleteThreshold(offset: number): boolean {
  return offset >= DELETE_THRESHOLD;
}
