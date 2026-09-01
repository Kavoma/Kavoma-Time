// ============================================================
// Synchronisierung — Grundtypen
// ============================================================
// Das Änderungsprotokoll ist die Währung der Synchronisierung: Nicht der
// Zustand wandert zwischen den Geräten, sondern die Änderungen. Zwei Geräte,
// die parallel je einen Eintrag anlegen, behalten dadurch beide — der
// Alles-oder-nichts-Fall eines eingespielten Backups entfällt.

/** Welche Art von Daten eine Op beschreibt. */
export type EntityKind =
  | 'entry'
  | 'customer'
  | 'project'
  | 'invoice'
  | 'invoiceTemplate'
  | 'recurringInvoice'
  | 'attachment'
  | 'vendorInvoice'
  | 'contract'
  /** Einzelwerte wie `weeklyTargetHours` oder `issuer.name` — feldweise. */
  | 'setting';

export type OpKind = 'upsert' | 'delete';

/**
 * Eine einzelne Änderung.
 *
 * `lamport` statt eines reinen Zeitstempels, weil Uhren falsch gehen: Ein
 * Rechner, der zwei Stunden nachgeht, würde sonst jede fremde Änderung
 * überschreiben. `updatedAt` ist nur für die Anzeige gedacht, nie für die
 * Entscheidung, wer gewinnt.
 */
export interface Op {
  id: string;
  entity: EntityKind;
  /** Bei Sammlungen die Entitäts-ID als String, bei `setting` der Feldpfad. */
  entityId: string;
  op: OpKind;
  payload?: unknown;
  deviceId: string;
  lamport: number;
  updatedAt: number;
}

/**
 * Spur einer Löschung.
 *
 * Ohne sie bringt ein Gerät, das lange offline war, den gelöschten Eintrag mit
 * einem alten Upsert zurück. Ein Upsert mit `lamport <= tombstone.lamport` wird
 * deshalb verworfen.
 */
export interface Tombstone {
  entity: EntityKind;
  entityId: string;
  lamport: number;
  deviceId: string;
  deletedAt: number;
}

/** Warum eine Fassung eine andere verdrängt hat. */
export type ConflictReason =
  /** Regelfall: höherer Lamport gewinnt. */
  | 'lamport'
  /** Finalisierte oder stornierte Rechnung schlägt Entwurf. */
  | 'invoice-status'
  /**
   * Altbestand: „einmal bezahlt bleibt bezahlt". Wird nicht mehr erzeugt — die
   * Regel nahm der Person die Möglichkeit, eine falsch gesetzte Markierung
   * zurückzunehmen. Der Wert bleibt im Typ, weil er in bereits gespeicherten
   * Konfliktprotokollen steht.
   */
  | 'paid-monotonic'
  /** Upsert traf auf eine Löschung. */
  | 'tombstone'
  /** Zwei Geräte haben in derselben Millisekunde dieselbe ID erzeugt. */
  | 'id-collision';

/**
 * Ein sichtbar gemachter Konflikt. Stillschweigendes Zusammenführen ist bequem
 * und intransparent — die App fragt an anderer Stelle (Pausenerkennung) auch
 * lieber nach, statt still zu entscheiden.
 */
export interface Conflict {
  entity: EntityKind;
  entityId: string;
  /** Für die Anzeige, z. B. `Kunde „Müller GmbH"`. */
  label: string;
  reason: ConflictReason;
  winnerDeviceId: string;
  loserDeviceId: string;
  at: number;
}

export type SyncConnectionState =
  | 'off'          // Synchronisierung nicht eingerichtet
  | 'locked'       // eingerichtet, aber Passphrase fehlt
  | 'offline'
  | 'syncing'
  | 'synced'
  | 'error';

export interface SyncStatus {
  state: SyncConnectionState;
  /** E-Mail des angemeldeten Kontos, falls vorhanden. */
  account: string | null;
  lastSyncAt: number | null;
  pendingOps: number;
  error: string | null;
  /** Kennung dieses Geräts — markiert in der Geräteliste den eigenen Eintrag. */
  deviceId: string | null;
}

export interface SyncDevice {
  id: string;
  name: string;
  platform: string;
  createdAt: number;
  lastSeenAt: number;
  /** Ob dieser Eintrag das Gerät ist, auf dem die App gerade läuft. */
  isCurrent: boolean;
}
