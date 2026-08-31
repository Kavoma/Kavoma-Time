// ============================================================
// Versionsstempel — schreibt mit, wann welche Entität zuletzt geändert wurde
// ============================================================
// „Letzte Änderung gewinnt" braucht auf beiden Seiten eine Version. Die
// Domänen-Typen tragen keine und sollen auch keine bekommen: Eine `_rev` in
// `Invoice` landete im Backup, im DATEV-Export und im Rechnungs-PDF.
//
// Der Stempel entsteht deshalb in derselben State-Aktualisierung wie die
// Änderung selbst — nicht hinterher. Das hält die Tabelle immer im Gleichtakt
// mit den Daten und die Funktion rein genug für React 19 (der Updater wird im
// StrictMode zweimal aufgerufen und muss beide Male dasselbe liefern).

import type { AppState } from '../types';
import { diffState } from './diff';
import type { Op } from './types';

export function versionKey(entity: string, entityId: string): string {
  return `${entity}:${entityId}`;
}

/**
 * Vergleicht zwei Versionen. Gleichstand beim Zähler wird über die
 * Geräte-Kennung aufgelöst — irgendeine feste Regel muss es geben, und eine
 * willkürliche ist besser als eine, die von der Reihenfolge des Eintreffens
 * abhängt.
 */
export function isNewer(
  candidate: { l: number; d: string },
  existing: { l: number; d: string } | undefined,
): boolean {
  if (!existing) return true;
  if (candidate.l !== existing.l) return candidate.l > existing.l;
  return candidate.d > existing.d;
}

/**
 * Setzt Versionsstempel für alles, was sich zwischen `prev` und `next` geändert
 * hat, und zieht den Lamport-Zähler eins weiter.
 *
 * Gibt `next` unverändert zurück, wenn nichts Synchronisierbares betroffen ist
 * — ein Timer-Tick oder eine geänderte Fenstergröße sollen den Zähler nicht
 * bewegen.
 */
export function stampChanges(
  prev: AppState | null,
  next: AppState | null,
  deviceId: string | null,
): AppState | null {
  if (!prev || !next || !deviceId) return next;

  const lamport = (prev.syncLamport ?? 0) + 1;
  const ops = diffState(prev, next, deviceId, lamport);
  if (ops.length === 0) return next;

  return {
    ...next,
    syncLamport: lamport,
    syncVersions: applyStamps(next.syncVersions, ops, deviceId, lamport),
  };
}

function applyStamps(
  versions: Record<string, { l: number; d: string }> | undefined,
  ops: readonly Op[],
  deviceId: string,
  lamport: number,
): Record<string, { l: number; d: string }> {
  const out = { ...(versions ?? {}) };
  for (const op of ops) {
    const key = versionKey(op.entity, op.entityId);
    if (op.op === 'delete') delete out[key];
    else out[key] = { l: lamport, d: deviceId };
  }
  return out;
}
