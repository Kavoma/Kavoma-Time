// ============================================================
// Was synchronisiert wird — und was nicht
// ============================================================
// Diese Datei ist die einzige Antwort auf die Frage. Sie steht bewusst an
// einer Stelle, statt über den Code verteilt zu sein: Wer später anderer
// Meinung ist, ändert hier eine Zeile und nicht zehn Dateien.

import type { AppState } from '../types';
import type { EntityKind } from './types';

/** Eine Sammlung, die über die IDs ihrer Einträge abgeglichen wird. */
export interface CollectionSpec {
  entity: EntityKind;
  stateKey: keyof AppState;
  /** Für die Anzeige im Konfliktprotokoll, z. B. „Kunde". */
  label: string;
  /** Feld, aus dem eine sprechende Bezeichnung gebildet wird. */
  nameKey?: string;
}

export const SYNCED_COLLECTIONS: readonly CollectionSpec[] = [
  { entity: 'entry',            stateKey: 'entries',           label: 'Zeiteintrag',        nameKey: 'description' },
  { entity: 'customer',         stateKey: 'customers',         label: 'Kunde',              nameKey: 'name' },
  { entity: 'project',          stateKey: 'projects',          label: 'Projekt',            nameKey: 'name' },
  { entity: 'invoice',          stateKey: 'invoices',          label: 'Rechnung',           nameKey: 'number' },
  { entity: 'invoiceTemplate',  stateKey: 'invoiceTemplates',  label: 'Rechnungsvorlage',   nameKey: 'name' },
  { entity: 'recurringInvoice', stateKey: 'recurringInvoices', label: 'Wiederkehrende Rechnung' },
  { entity: 'attachment',       stateKey: 'attachments',       label: 'Beleg',              nameKey: 'filename' },
  { entity: 'vendorInvoice',    stateKey: 'vendorInvoices',    label: 'Eingangsrechnung',   nameKey: 'vendorName' },
  { entity: 'contract',         stateKey: 'contracts',         label: 'Vertrag',            nameKey: 'title' },
] as const;

/**
 * Einzelwerte, die feldweise abgeglichen werden.
 *
 * `object` bedeutet: Jedes eigene Feld des Objekts ist ein eigener Wert mit
 * eigenem Lamport (`issuer.name`, `issuer.iban`, …). Dadurch verliert eine
 * geänderte IBAN nicht gegen eine gleichzeitig geänderte Telefonnummer — und
 * ein neues Feld im `Issuer` synchronisiert von allein mit, ohne dass jemand
 * daran denken muss.
 */
export type SettingSpec =
  | { kind: 'value';  path: keyof AppState; label: string }
  | { kind: 'object'; path: keyof AppState; label: string };

export const SYNCED_SETTINGS: readonly SettingSpec[] = [
  { kind: 'object', path: 'issuer',             label: 'Absenderdaten' },
  { kind: 'value',  path: 'weeklyTargetHours',  label: 'Wochen-Sollstunden' },
  { kind: 'value',  path: 'invoicePrefix',      label: 'Rechnungs-Präfix' },
  { kind: 'value',  path: 'eInvoiceEnabled',    label: 'E-Rechnung' },
] as const;

/**
 * Bewusst gerätelokal — steht hier, damit die Entscheidung nachlesbar ist und
 * nicht als Lücke missverstanden wird.
 *
 * - Laufender Timer: `isRunning` und die `current*`-Felder beschreiben, was an
 *   *diesem* Gerät gerade passiert. Synchronisiert würden sie den Timer auf dem
 *   anderen Rechner mitstarten. Fertige Einträge wandern dagegen mit.
 * - `timerOverlayEnabled`: Unter macOS gibt es das Overlay gar nicht
 *   (`OVERLAY_SUPPORTED` in `electron/main.cjs`).
 * - `shortcuts`: Ein unter macOS freies Tastenkürzel kann unter Windows belegt
 *   sein.
 * - AFK, Herunterfahren, Feierabend-Erinnerung: beschreiben, wie sich *dieser*
 *   Rechner verhält. Eine Erinnerung, die auf beiden Geräten poppt, ist eine
 *   Zumutung.
 * - Nummernkreise: werden durch den serverseitigen Allokator ersetzt, ein
 *   mitwandernder Zähler wäre genau die Dublettenquelle, die wir vermeiden.
 */
export const DEVICE_LOCAL_KEYS: readonly (keyof AppState)[] = [
  'isRunning',
  'startedAt',
  'sessionStartedAt',
  'elapsedBefore',
  'currentCustomerId',
  'currentProjectId',
  'currentDescription',
  'timerOverlayEnabled',
  'shortcuts',
  'afkPauseEnabled',
  'afkTimeoutMinutes',
  'stopOnShutdownEnabled',
  'endOfDayReminderEnabled',
  'endOfDayReminderHour',
  'endOfDayReminderMinute',
  'nextInvoiceCounter',
  'nextDebtorNumber',
  'nextVendorInvoiceId',
  'nextContractId',
  'nextTemplateId',
  'nextRecurringId',
] as const;

const COLLECTION_BY_ENTITY = new Map(SYNCED_COLLECTIONS.map((c) => [c.entity, c]));

export function collectionFor(entity: EntityKind): CollectionSpec | undefined {
  return COLLECTION_BY_ENTITY.get(entity);
}

/**
 * Sprechende Bezeichnung einer Entität fürs Konfliktprotokoll — „Kunde
 * „Müller GmbH"" liest sich besser als eine nackte ID.
 */
export function describeEntity(entity: EntityKind, entityId: string, payload?: unknown): string {
  if (entity === 'setting') return `Einstellung „${entityId}"`;
  const spec = collectionFor(entity);
  if (!spec) return entityId;
  const name = spec.nameKey && payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)[spec.nameKey]
    : undefined;
  return typeof name === 'string' && name.trim()
    ? `${spec.label} „${name.trim()}"`
    : `${spec.label} #${entityId}`;
}
