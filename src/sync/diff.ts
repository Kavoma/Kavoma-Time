// ============================================================
// Änderungsprotokoll aus dem Zustandsunterschied ableiten
// ============================================================
// Es gibt über 60 `setState`-Aufrufe in einem Dutzend Dateien. Jeden einzelnen
// um einen Protokoll-Schreibvorgang zu ergänzen, wäre der Punkt, an dem diese
// Funktion scheitert: Jede vergessene Stelle ist ein stiller Datenverlust, und
// jede künftige Funktion müsste daran denken.
//
// Stattdessen wird das Protokoll an der einen Stelle abgeleitet, durch die
// ohnehin alles läuft — dem Persist-Effekt in `AppStateContext`. Kein Aufrufer
// muss etwas wissen, keine künftige Funktion kann es vergessen.

import type { AppState } from '../types';
import { SYNCED_COLLECTIONS, SYNCED_SETTINGS } from './classify';
import type { EntityKind, Op, OpKind } from './types';

/**
 * JSON mit sortierten Schlüsseln.
 *
 * Nötig, weil der State über Spreads gebaut wird und die Schlüsselreihenfolge
 * dabei wandern kann. Ohne Sortierung sähe `{a:1,b:2}` anders aus als
 * `{b:2,a:1}` und wir würden Änderungen melden, wo keine sind.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function newOpId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeOp(
  entity: EntityKind,
  entityId: string,
  op: OpKind,
  payload: unknown,
  deviceId: string,
  lamport: number,
  now: number,
): Op {
  return { id: newOpId(), entity, entityId, op, payload, deviceId, lamport, updatedAt: now };
}

/** Indiziert eine Sammlung nach ihrer ID. IDs sind mal Zahl, mal String — der
 *  Schlüssel ist deshalb immer die String-Fassung. */
function indexById(list: readonly unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as Record<string, unknown>).id;
    if (id === undefined || id === null) continue;
    map.set(String(id), item as Record<string, unknown>);
  }
  return map;
}

/**
 * Erzeugt die Ops, die `prev` in `next` überführen.
 *
 * Alle Ops eines Aufrufs teilen sich denselben Lamport — sie sind ein einziges
 * Ereignis, keine Folge von Ereignissen.
 *
 * `prev` ist immer der *eigene vorherige* Stand dieses Geräts. Daraus folgt die
 * Antwort auf die Löschfrage: Fehlt eine Entität in `next`, wurde sie hier
 * gelöscht — sie ist nicht etwa „noch nie gesehen worden". Fremde Änderungen
 * laufen über den Merge-Pfad, der `prev` mitzieht, bevor er den State setzt.
 */
export function diffState(
  prev: AppState,
  next: AppState,
  deviceId: string,
  lamport: number,
  now = Date.now(),
): Op[] {
  const ops: Op[] = [];

  for (const spec of SYNCED_COLLECTIONS) {
    const prevList = (prev[spec.stateKey] ?? []) as unknown[];
    const nextList = (next[spec.stateKey] ?? []) as unknown[];
    // Unveränderte Referenz heißt unveränderte Sammlung — der häufigste Fall,
    // weil State-Updates immer nur einen Zweig neu aufbauen.
    if (prevList === nextList) continue;
    if (!Array.isArray(prevList) || !Array.isArray(nextList)) continue;

    const prevMap = indexById(prevList);
    const nextMap = indexById(nextList);

    for (const [id, entity] of nextMap) {
      const before = prevMap.get(id);
      if (before === entity) continue;
      if (before && stableStringify(before) === stableStringify(entity)) continue;
      ops.push(makeOp(spec.entity, id, 'upsert', entity, deviceId, lamport, now));
    }
    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) {
        ops.push(makeOp(spec.entity, id, 'delete', undefined, deviceId, lamport, now));
      }
    }
  }

  for (const spec of SYNCED_SETTINGS) {
    const before = prev[spec.path];
    const after = next[spec.path];
    if (before === after) continue;

    if (spec.kind === 'value') {
      if (stableStringify(before) !== stableStringify(after)) {
        ops.push(makeOp('setting', String(spec.path), 'upsert', after, deviceId, lamport, now));
      }
      continue;
    }

    // Objekt: jedes eigene Feld ist ein eigener Wert mit eigenem Lamport.
    const beforeObj = (before ?? {}) as Record<string, unknown>;
    const afterObj = (after ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
    for (const key of keys) {
      const path = `${String(spec.path)}.${key}`;
      const hasAfter = key in afterObj;
      if (!hasAfter) {
        ops.push(makeOp('setting', path, 'delete', undefined, deviceId, lamport, now));
        continue;
      }
      if (stableStringify(beforeObj[key]) !== stableStringify(afterObj[key])) {
        ops.push(makeOp('setting', path, 'upsert', afterObj[key], deviceId, lamport, now));
      }
    }
  }

  return ops;
}
