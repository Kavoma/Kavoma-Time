// ============================================================
// Kennungen, die sich auf zwei Geräten nicht in die Quere kommen
// ============================================================
// Fast alle Entitäten der App bekommen ihre ID aus `Date.now()`. Das ist für
// ein einzelnes Gerät völlig ausreichend, wird bei Synchronisierung aber zur
// stillen Verlustquelle: Erzeugen zwei Geräte in derselben Millisekunde je
// einen Eintrag, halten beide dieselbe ID — und „letzte Änderung gewinnt"
// macht aus zwei Einträgen einen.
//
// Die zusätzlichen drei Stellen kosten nichts, bleiben numerisch und
// chronologisch sortierbar (die App verlässt sich an mehreren Stellen darauf,
// dass eine größere ID „neuer" bedeutet) und senken die Trefferwahrscheinlichkeit
// auf ein Tausendstel dessen, was ohnehin schon unwahrscheinlich war.

/**
 * Neue numerische Kennung: Millisekunde + drei Zufallsstellen.
 *
 * Bleibt unterhalb von `Number.MAX_SAFE_INTEGER` (≈9,0e15) — `Date.now()`
 * liegt bei ≈1,8e12, mal 1000 also ≈1,8e15.
 */
export function newNumericId(now = Date.now()): number {
  const jitter = Math.floor(Math.random() * 1000);
  return now * 1000 + jitter;
}

/**
 * Zeitpunkt zurück aus einer Kennung von `newNumericId`.
 *
 * Alte Kennungen sind blanke `Date.now()`-Werte; die liegen um den Faktor 1000
 * niedriger und werden hier unverändert durchgereicht. Der Schwellenwert
 * entspricht dem Jahr 33658 in alter Zählung — eine echte Verwechslung ist
 * damit ausgeschlossen.
 */
const NEW_ID_THRESHOLD = 1e15;

export function timestampFromId(id: number): number {
  return id >= NEW_ID_THRESHOLD ? Math.floor(id / 1000) : id;
}
