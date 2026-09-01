// ============================================================
// Laufende Nummern
// ============================================================
// Rechnungsnummern sind die Stelle, an der Synchronisierung wehtut. §14 UStG
// verlangt eine eindeutige, fortlaufende Nummer — zwei Geräte, die je einen
// eigenen Zähler hochzählen, erzeugen zwangsläufig zwei Rechnungen mit
// derselben Nummer. Steuerlich ist das kein Schönheitsfehler.
//
// Deshalb wird die Nummer nicht mehr beim Anlegen eines Entwurfs vergeben,
// sondern erst beim Finalisieren — und dann aus genau einer Quelle.
//
// Die erste Fassung hatte dabei einen Fehler mit Folgen: Der Zähler auf dem
// Server begann bei 1, ohne den vorhandenen Bestand zu kennen. Wer schon
// Rechnungen hatte, bekam die 001 ein zweites Mal. Die Lehre daraus steckt in
// `invoiceFloor` und `debtorFloor`: Das Gerät sagt bei jeder Vergabe, welche
// Nummer bei ihm bereits vergeben ist. Der Server hebt seinen Zähler auf diesen
// Wert an, wenn er darunter liegt — senken kann ihn niemand.

import type { Customer, Invoice } from '../types';

export type NumberKind = 'invoice' | 'debtor';

/**
 * Debitorennummern gelten jahresübergreifend.
 *
 * Sie liefen anfangs — wie Rechnungsnummern — nach Kalenderjahr. Das ist für
 * Rechnungen richtig und für Debitoren falsch: Eine Debitorennummer gehört
 * dauerhaft zu einem Kunden. Im Januar hätte die Vergabe wieder bei 1 begonnen
 * und die Kunden des Vorjahres doppelt belegt.
 */
export const DEBTOR_YEAR = 0;

/** Kleinste Debitorennummer, damit der DATEV-Bereich eingehalten bleibt. */
export const DEBTOR_START = 10001;

/** Kürzel, das Stornorechnungen an ihre Nummer hängen. */
const CANCELLATION_SUFFIX = '-S';

/**
 * Entwürfe tragen keine Nummer.
 *
 * Vorher reservierte jeder Entwurf eine, auch die, die nie verschickt wurden —
 * das riss Lücken in den Nummernkreis und machte parallele Geräte unmöglich.
 */
export const DRAFT_NUMBER = '';

/** Was in Listen und Formularen steht, solange keine Nummer vergeben ist. */
export const DRAFT_NUMBER_LABEL = 'Entwurf';

/** Setzt das Jahr in ein Präfix ein. */
function resolvePrefix(prefix: string | undefined, year: number): string {
  return (prefix || 'YYYY-').replace('YYYY', String(year));
}

/**
 * Bildet die sichtbare Rechnungsnummer.
 *
 * Lag bisher wortgleich an vier Stellen (Modal, Storno, Einstellungs-Vorschau,
 * wiederkehrende Rechnungen) — mit dem Risiko, dass eine davon beim Ändern
 * vergessen wird.
 */
export function formatInvoiceNumber(
  prefix: string | undefined,
  counter: number,
  year: number = new Date().getFullYear(),
  suffix = '',
): string {
  return `${resolvePrefix(prefix, year)}${String(counter).padStart(3, '0')}${suffix}`;
}

/**
 * Liest den Zähler aus einer fertigen Rechnungsnummer zurück.
 *
 * Zwei Wege, in dieser Reihenfolge: Passt das erwartete Präfix, wird es
 * abgeschnitten und der Rest muss reine Ziffernfolge sein — das ist der exakte
 * Fall. Passt es nicht (das Präfix wurde zwischendurch geändert), bleibt die
 * Ziffernfolge am Ende. Letzteres ist eine Schätzung, aber eine, die nie zu
 * niedrig ausfällt, und nur darauf kommt es bei einer Untergrenze an.
 */
export function counterFromInvoiceNumber(
  number: string,
  prefix: string | undefined,
  year: number,
): number | null {
  const trimmed = (number ?? '').trim();
  if (!trimmed) return null;

  const withoutSuffix = trimmed.endsWith(CANCELLATION_SUFFIX)
    ? trimmed.slice(0, -CANCELLATION_SUFFIX.length)
    : trimmed;

  const expected = resolvePrefix(prefix, year);
  if (expected && withoutSuffix.startsWith(expected)) {
    const rest = withoutSuffix.slice(expected.length);
    if (/^\d+$/.test(rest)) return Number(rest);
  }

  const tail = withoutSuffix.match(/(\d+)$/);
  return tail ? Number(tail[1]) : null;
}

/**
 * Die kleinste Nummer, die für dieses Jahr noch frei sein muss.
 *
 * Bewusst aus den tatsächlich vergebenen Nummern errechnet und nicht allein aus
 * dem gespeicherten Zähler: Der lässt sich in den Einstellungen von Hand
 * verstellen und war nach dem ersten Sync-Fehler nachweislich zu niedrig.
 *
 * Steckt ein Jahr im Präfix, zählt nur das laufende Jahr — der Kreis darf dann
 * im Januar neu beginnen, weil die Jahreszahl die Nummern auseinanderhält.
 * Fehlt es, zählen alle Jahre, sonst käme jede Nummer jährlich ein zweites Mal.
 */
export function invoiceFloor(
  invoices: readonly Invoice[],
  prefix: string | undefined,
  year: number,
  localNext = 1,
): number {
  const yearScoped = (prefix || 'YYYY-').includes('YYYY');
  let highest = 0;

  for (const invoice of invoices) {
    if (yearScoped && new Date(invoice.createdAt).getFullYear() !== year) continue;
    const numberYear = new Date(invoice.createdAt).getFullYear();
    const counter = counterFromInvoiceNumber(invoice.number, prefix, numberYear);
    if (counter !== null && counter > highest) highest = counter;
  }

  return Math.max(1, localNext, highest + 1);
}

/** Dasselbe für Debitorennummern — ohne Jahr, dafür mit DATEV-Untergrenze. */
export function debtorFloor(
  customers: readonly Customer[],
  localNext = DEBTOR_START,
): number {
  let highest = 0;

  for (const customer of customers) {
    const raw = (customer.debtorNumber ?? '').trim();
    if (!/^\d+$/.test(raw)) continue;
    const value = Number(raw);
    if (value > highest) highest = value;
  }

  return Math.max(DEBTOR_START, localNext, highest + 1);
}

/**
 * Zieht den lokalen Zähler nach.
 *
 * Er ist ab jetzt kein zweiter Nummernkreis mehr, sondern ein Spiegel: Er zeigt
 * in den Einstellungen, welche Nummer als Nächstes fällig ist, und dient als
 * Ausgangswert, falls die Synchronisierung später abgeschaltet wird. Früher
 * blieb er bei aktiver Synchronisierung stehen — und erzeugte beim Abschalten
 * prompt wieder Dubletten.
 */
export function advanceCounter(previous: number, allocated: number): number {
  return Math.max(previous, allocated + 1);
}

/** Sync ist an, aber es ist keine Nummer zu bekommen. */
export class NumberUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      'Es ist gerade keine Rechnungsnummer zu bekommen — dafür braucht es kurz '
      + 'Verbindung zum Abgleich. Sobald wieder Netz da ist, geht es weiter. '
      + (detail ? `(${detail})` : ''),
    );
    this.name = 'NumberUnavailableError';
  }
}

export interface AllocatedNumber {
  value: number;
  source: 'local' | 'server';
}

/**
 * Zieht die nächste Nummer.
 *
 * `floor` ist die Untergrenze aus `invoiceFloor` bzw. `debtorFloor`. Ohne
 * eingerichtete Synchronisierung (der Normalfall, und die Browser-Vorschau) ist
 * sie zugleich die Antwort. Mit Synchronisierung geht sie an den Server, der
 * seinen Zähler daran anhebt, falls er zurückliegt.
 *
 * @throws NumberUnavailableError wenn Sync an ist, aber der Server nicht
 *         erreichbar. Auf den lokalen Zähler zurückzufallen wäre bequem und
 *         erzeugte genau die Dublette, die zu vermeiden ist.
 */
export async function allocateNumber(
  kind: NumberKind,
  floor: number,
  year: number = new Date().getFullYear(),
): Promise<AllocatedNumber> {
  const scopedYear = kind === 'debtor' ? DEBTOR_YEAR : year;
  const result = await window.api?.syncAllocateNumber?.(kind, scopedYear, floor).catch(() => null);

  if (!result || result.source === 'local') {
    return { value: floor, source: 'local' };
  }
  if (result.source === 'unavailable') {
    throw new NumberUnavailableError(result.error);
  }
  return { value: result.value, source: 'server' };
}
