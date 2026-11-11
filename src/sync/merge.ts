// ============================================================
// Fremde Änderungen einspielen
// ============================================================
// Reine Funktion, keine Seiteneffekte — das ist der Teil, der nicht falsch
// sein darf, und deshalb der einzige mit Tests (`merge.test.ts`).
//
// Grundregel: „letzte Änderung gewinnt" pro Entität, sortiert nach
// (Lamport, Geräte-Kennung). Bewusst nicht feldweise — das bräuchte einen
// Zähler pro Feld, und dass ein einzelner Mensch denselben Kunden auf zwei
// Rechnern gleichzeitig ändert, ist selten. Das Konfliktprotokoll zeigt, ob
// sich diese Annahme je als falsch erweist.

import type { AppState, Invoice } from '../types';
import { SYNCED_COLLECTIONS, SYNCED_SETTINGS, collectionFor, describeEntity } from './classify';
import { isNewer, versionKey } from './stamp';
import type { Conflict, ConflictReason, Op, Tombstone } from './types';

/** Wie viele Konflikte im Protokoll aufgehoben werden. */
const MAX_CONFLICTS = 100;
/** Ab wann ein Grabstein verfällt. Bis dahin hat jedes Gerät längst abgeglichen. */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface MergeResult {
  state: AppState;
  conflicts: Conflict[];
  /** Wie viele Ops tatsächlich etwas geändert haben. */
  applied: number;
}

/** Rangfolge der Rechnungs-Zustände. Höher schlägt niedriger, immer. */
const INVOICE_STATUS_RANK: Record<string, number> = { draft: 0, active: 1, cancelled: 2 };

function invoiceRank(inv: unknown): number {
  const status = (inv as Invoice | undefined)?.status;
  return INVOICE_STATUS_RANK[status ?? 'active'] ?? 1;
}

function sortOps(ops: readonly Op[]): Op[] {
  return [...ops].sort((a, b) =>
    a.lamport - b.lamport
    || (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0)
    || (a.entity < b.entity ? -1 : a.entity > b.entity ? 1 : 0)
    || (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
}

/**
 * Vereinigt Mahnungen statt sie zu ersetzen.
 *
 * Eine auf dem anderen Gerät verschickte Mahnung ist ein Brief, der die Welt
 * verlassen hat — die darf nicht verschwinden, nur weil hier gleichzeitig
 * etwas anderes an der Rechnung geändert wurde.
 */
function mergeReminders(a: Invoice, b: Invoice): Invoice['reminders'] {
  const seen = new Map<string, Invoice['reminders'][number]>();
  for (const r of [...(a.reminders ?? []), ...(b.reminders ?? [])]) {
    seen.set(`${r.level}:${r.sentAt}`, r);
  }
  return [...seen.values()].sort((x, y) => x.sentAt - y.sentAt);
}

/**
 * Vereinigt Zahlungseingänge statt sie zu ersetzen.
 *
 * Derselbe Grund wie bei den Mahnungen, nur teurer: Eine auf dem anderen Gerät
 * erfasste Zahlung ist Geld, das eingegangen ist. Verschwände sie, weil hier
 * gleichzeitig etwas anderes an der Rechnung geändert wurde, mahnte die App
 * anschliessend einen Betrag an, der längst bezahlt ist.
 *
 * Vereinigt wird über die Zahlungs-ID. Sie ist eine UUID, also auf beiden
 * Geräten verschieden — zwei Erfassungen desselben Eingangs stünden danach
 * doppelt da. Das ist die richtige Richtung des Fehlers: Eine doppelte Zahlung
 * fällt beim Ansehen sofort auf (die Rechnung ist überzahlt), eine
 * verschwundene erst bei der Mahnung.
 */
function mergePayments(a: Invoice, b: Invoice): Invoice['payments'] {
  const seen = new Map<string, NonNullable<Invoice['payments']>[number]>();
  for (const p of [...(a.payments ?? []), ...(b.payments ?? [])]) seen.set(p.id, p);
  return [...seen.values()].sort((x, y) => x.paidAt - y.paidAt);
}

/**
 * Entscheidet, welche Fassung einer Rechnung bleibt.
 *
 * Der Status ist hier kein normales Feld, sondern eine Rangfolge: Eine
 * finalisierte oder stornierte Rechnung verliert nie gegen einen Entwurf, egal
 * wie neu der ist. Sonst könnte ein Gerät, das offline noch am Entwurf
 * gearbeitet hat, eine bereits verschickte Rechnung zurück in den Entwurf
 * verwandeln.
 *
 * **„Bezahlt" folgt dagegen der jüngsten Änderung wie jedes andere Feld.**
 * Hier stand einmal eine Monotonie-Regel — einmal bezahlt, immer bezahlt, mit
 * der Begründung, Geld komme nicht wieder weg. Das Geld nicht, die
 * *Markierung* schon: Wer sich verklickt oder die falsche Rechnung erwischt,
 * muss das zurücknehmen können. Die Regel griff zudem unabhängig davon, welche
 * Seite gewann, und holte ein „bezahlt" auch dann zurück, wenn die lokale
 * Fassung die neuere war. Für die Person davor sah das aus, als entscheide die
 * App selbst — genau die Unberechenbarkeit, die gemeldet wurde.
 *
 * Gegen verspätet eintreffende Altstände schützt die Lamport-Ordnung, nicht
 * eine Sonderregel für ein einzelnes Feld.
 */
function resolveInvoice(
  local: Invoice,
  remote: Invoice,
  remoteWinsByLamport: boolean,
): { winner: Invoice; reason: ConflictReason | null } {
  const localRank = invoiceRank(local);
  const remoteRank = invoiceRank(remote);

  let base: Invoice;
  let reason: ConflictReason | null;

  if (localRank !== remoteRank) {
    base = localRank > remoteRank ? local : remote;
    reason = 'invoice-status';
  } else if (remoteWinsByLamport) {
    base = remote;
    reason = 'lamport';
  } else {
    base = local;
    reason = 'lamport';
  }

  const zusammengefuehrt: Invoice = {
    ...base,
    reminders: mergeReminders(local, remote),
    payments: mergePayments(local, remote),
  };

  // `paid` neu abzuleiten ist nur richtig, wenn überhaupt eine Seite Zahlungen
  // **führt**. Eine Op von einem noch nicht aktualisierten Gerät trägt
  // `paid: true` ganz ohne Zahlungsliste — würde hier abgeleitet, machte der
  // Abgleich die Rechnung stillschweigend wieder unbezahlt. Genau das passiert
  // während eines Roll-outs, wenn ein Gerät noch die alte Fassung hat.
  const fuehrtZahlungen = Array.isArray(local.payments) || Array.isArray(remote.payments);
  const winner = fuehrtZahlungen
    ? nachZahlungenNachgezogen(zusammengefuehrt)
    : zusammengefuehrt;

  return { winner, reason };
}

/**
 * Setzt `paid`/`paidAt` aus den vereinigten Zahlungen neu.
 *
 * Nötig, weil der Schalter abgeleitet ist: Nach dem Vereinigen stünde sonst
 * der Wert einer Seite über den Zahlungen beider — und zwei Teilzahlungen, die
 * zusammen aufgehen, ergäben trotzdem „offen".
 */
function nachZahlungenNachgezogen(inv: Invoice): Invoice {
  const zahlungen = inv.payments ?? [];
  const gesamt = zahlungen.reduce((s, p) => s + p.amount, 0);
  const gebuehren = (inv.reminders ?? []).reduce((s, r) => s + r.fee, 0);
  // Dieselbe Toleranz wie in `src/utils/payments.ts`: Ein halber Cent kann nur
  // aus Fließkomma-Rauschen stammen, nicht aus einer Überweisung.
  const bezahlt = gesamt - (inv.total + gebuehren) > -0.005;

  const next: Invoice = { ...inv, payments: zahlungen, paid: bezahlt };
  if (bezahlt && zahlungen.length > 0) {
    next.paidAt = zahlungen[zahlungen.length - 1].paidAt;
  } else {
    delete next.paidAt;
  }
  return next;
}

function pruneTombstones(list: readonly Tombstone[], now: number): Tombstone[] {
  return list.filter((t) => now - t.deletedAt < TOMBSTONE_TTL_MS);
}

/**
 * Spielt fremde Ops in den lokalen Zustand ein.
 *
 * `ops` dürfen in beliebiger Reihenfolge kommen — sie werden hier sortiert.
 * Zweimal dieselben Ops einzuspielen ergibt denselben Zustand.
 */
export function applyOps(state: AppState, ops: readonly Op[], now = Date.now()): MergeResult {
  const conflicts: Conflict[] = [];
  let applied = 0;

  const versions: Record<string, { l: number; d: string }> = { ...(state.syncVersions ?? {}) };
  const tombstones = new Map<string, Tombstone>(
    (state.syncTombstones ?? []).map((t) => [versionKey(t.entity, t.entityId), t]),
  );

  // Sammlungen als Map, damit Reihenfolge und Lookup billig bleiben.
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  for (const spec of SYNCED_COLLECTIONS) {
    const list = (state[spec.stateKey] ?? []) as unknown[];
    const map = new Map<string, Record<string, unknown>>();
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item && typeof item === 'object') {
          const id = (item as Record<string, unknown>).id;
          if (id !== undefined && id !== null) map.set(String(id), item as Record<string, unknown>);
        }
      }
    }
    collections.set(spec.entity, map);
  }

  const settings: Record<string, unknown> = {};
  for (const spec of SYNCED_SETTINGS) {
    if (spec.kind === 'value') {
      settings[String(spec.path)] = state[spec.path];
    } else {
      const obj = (state[spec.path] ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) settings[`${String(spec.path)}.${k}`] = v;
    }
  }

  let maxLamport = state.syncLamport ?? 0;

  for (const op of sortOps(ops)) {
    maxLamport = Math.max(maxLamport, op.lamport);
    const key = versionKey(op.entity, op.entityId);
    const incoming = { l: op.lamport, d: op.deviceId };
    const current = versions[key];

    // Eine Löschung schlägt jeden älteren Upsert. Ohne diese Regel bringt ein
    // Gerät, das lange offline war, gelöschte Einträge zurück.
    const grave = tombstones.get(key);
    if (grave && op.op === 'upsert' && !isNewer(incoming, { l: grave.lamport, d: grave.deviceId })) {
      conflicts.push({
        entity: op.entity, entityId: op.entityId,
        label: describeEntity(op.entity, op.entityId, op.payload),
        reason: 'tombstone',
        winnerDeviceId: grave.deviceId, loserDeviceId: op.deviceId, at: now,
      });
      continue;
    }

    if (op.entity === 'setting') {
      if (!isNewer(incoming, current)) continue;
      if (op.op === 'delete') delete settings[op.entityId];
      else settings[op.entityId] = op.payload;
      versions[key] = incoming;
      applied++;
      continue;
    }

    const map = collections.get(op.entity);
    if (!map) continue;

    if (op.op === 'delete') {
      if (map.has(op.entityId)) {
        map.delete(op.entityId);
        applied++;
      }
      delete versions[key];
      tombstones.set(key, {
        entity: op.entity, entityId: op.entityId,
        lamport: op.lamport, deviceId: op.deviceId,
        // Bewusst der lokale Empfangszeitpunkt, nicht `op.updatedAt`: Die
        // Verfallsfrist ist eine Aufbewahrungsfrage *dieses* Geräts. Käme die
        // Zeit vom fremden Gerät, würde ein dort falsch gestellter Kalender
        // den Grabstein sofort verfallen lassen — und die Löschung wäre beim
        // nächsten Abgleich wieder rückgängig.
        deletedAt: now,
      });
      continue;
    }

    const local = map.get(op.entityId);
    const remote = op.payload as Record<string, unknown> | undefined;
    if (!remote || typeof remote !== 'object') continue;

    if (!local) {
      map.set(op.entityId, remote);
      versions[key] = incoming;
      applied++;
      continue;
    }

    const remoteWins = isNewer(incoming, current);

    if (op.entity === 'invoice') {
      const { winner, reason } = resolveInvoice(
        local as unknown as Invoice, remote as unknown as Invoice, remoteWins,
      );
      const changed = JSON.stringify(winner) !== JSON.stringify(local);
      if (changed) { map.set(op.entityId, winner as unknown as Record<string, unknown>); applied++; }
      if (reason && current) {
        const remoteWon = winner !== (local as unknown as Invoice);
        conflicts.push({
          entity: op.entity, entityId: op.entityId,
          label: describeEntity(op.entity, op.entityId, winner),
          reason,
          winnerDeviceId: remoteWon ? op.deviceId : current.d,
          loserDeviceId: remoteWon ? current.d : op.deviceId,
          at: now,
        });
      }
      if (remoteWins) versions[key] = incoming;
      continue;
    }

    if (!remoteWins) {
      // Die lokale Fassung bleibt — aber nur melden, wenn beide Seiten
      // tatsächlich auseinanderlaufen, sonst wäre jedes erneute Einspielen
      // derselben Ops ein „Konflikt".
      if (current && JSON.stringify(local) !== JSON.stringify(remote)) {
        conflicts.push({
          entity: op.entity, entityId: op.entityId,
          label: describeEntity(op.entity, op.entityId, local),
          reason: 'lamport',
          winnerDeviceId: current.d, loserDeviceId: op.deviceId, at: now,
        });
      }
      continue;
    }

    if (JSON.stringify(local) !== JSON.stringify(remote)) {
      // Kein Versionsstempel, aber lokal vorhanden und inhaltlich anders: Die
      // Entität wurde hier angelegt und ist nie abgeglichen worden — das
      // fremde Gerät hat unabhängig davon eine mit derselben ID erzeugt. Das
      // sind zwei verschiedene Dinge, nicht zwei Fassungen desselben.
      //
      // Strukturell verhindert `newNumericId` diesen Fall (Millisekunde plus
      // drei Zufallsstellen). Bleibt er trotzdem übrig, wird er nicht still
      // aufgelöst, sondern sichtbar gemacht: Ein Eintrag, der ohne Hinweis
      // verschwindet, ist schlimmer als einer, der erklärt verschwindet.
      conflicts.push({
        entity: op.entity, entityId: op.entityId,
        label: describeEntity(op.entity, op.entityId, remote),
        reason: current ? 'lamport' : 'id-collision',
        winnerDeviceId: op.deviceId, loserDeviceId: current?.d ?? '(lokal)', at: now,
      });
      map.set(op.entityId, remote);
      applied++;
    }
    versions[key] = incoming;
  }

  // Zustand wieder zusammensetzen
  const next: AppState = { ...state };
  for (const spec of SYNCED_COLLECTIONS) {
    const map = collections.get(spec.entity);
    if (map) (next as unknown as Record<string, unknown>)[spec.stateKey] = [...map.values()];
  }
  for (const spec of SYNCED_SETTINGS) {
    if (spec.kind === 'value') {
      (next as unknown as Record<string, unknown>)[spec.path] = settings[String(spec.path)];
    } else {
      const prefix = `${String(spec.path)}.`;
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (k.startsWith(prefix)) obj[k.slice(prefix.length)] = v;
      }
      (next as unknown as Record<string, unknown>)[spec.path] = obj;
    }
  }

  next.syncLamport = maxLamport + 1;
  next.syncVersions = versions;
  next.syncTombstones = pruneTombstones([...tombstones.values()], now);
  next.syncConflicts = [...(state.syncConflicts ?? []), ...conflicts].slice(-MAX_CONFLICTS);

  return { state: next, conflicts, applied };
}

/** Nur für die Erstabgleich-Vorschau: was würde dieser Merge bewirken? */
export function summarizeOps(state: AppState, ops: readonly Op[]): Record<string, { added: number; changed: number; removed: number }> {
  const out: Record<string, { added: number; changed: number; removed: number }> = {};
  const before = new Map<string, Set<string>>();
  for (const spec of SYNCED_COLLECTIONS) {
    const list = (state[spec.stateKey] ?? []) as unknown[];
    before.set(spec.entity, new Set(
      Array.isArray(list)
        ? list.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
              .map((i) => String(i.id))
        : [],
    ));
  }
  const result = applyOps(state, ops);
  for (const spec of SYNCED_COLLECTIONS) {
    const ids = before.get(spec.entity) ?? new Set<string>();
    const after = (result.state[spec.stateKey] ?? []) as unknown[];
    const afterIds = new Set(
      Array.isArray(after)
        ? after.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
               .map((i) => String(i.id))
        : [],
    );
    const added = [...afterIds].filter((id) => !ids.has(id)).length;
    const removed = [...ids].filter((id) => !afterIds.has(id)).length;
    const changed = ops.filter(
      (o) => o.entity === spec.entity && o.op === 'upsert' && ids.has(o.entityId),
    ).length;
    if (added || removed || changed) {
      out[collectionFor(spec.entity)?.label ?? spec.entity] = { added, changed, removed };
    }
  }
  return out;
}
