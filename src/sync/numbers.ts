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

export type NumberKind = 'invoice' | 'debtor';

/**
 * Entwürfe tragen keine Nummer.
 *
 * Vorher reservierte jeder Entwurf eine, auch die, die nie verschickt wurden —
 * das riss Lücken in den Nummernkreis und machte parallele Geräte unmöglich.
 */
export const DRAFT_NUMBER = '';

/** Was in Listen und Formularen steht, solange keine Nummer vergeben ist. */
export const DRAFT_NUMBER_LABEL = 'Entwurf';

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
  const resolved = (prefix || 'YYYY-').replace('YYYY', String(year));
  return `${resolved}${String(counter).padStart(3, '0')}${suffix}`;
}

/** Sync ist an, aber es ist keine Nummer zu bekommen. */
export class NumberUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      'Es ist gerade keine Rechnungsnummer zu bekommen: keine Verbindung und der '
      + 'Vorrat ist aufgebraucht. Sobald wieder Netz da ist, geht es weiter. '
      + (detail ? `(${detail})` : ''),
    );
    this.name = 'NumberUnavailableError';
  }
}

export interface AllocatedNumber {
  value: number;
  /**
   * Ob der lokale Zähler im AppState mitgezogen werden muss. Nur wahr, solange
   * keine Synchronisierung eingerichtet ist — dann ist der lokale Zähler die
   * einzige Quelle und das Verhalten exakt wie bisher.
   */
  bumpLocalCounter: boolean;
  source: 'local' | 'server' | 'reserve';
}

/**
 * Zieht die nächste Nummer.
 *
 * Ohne eingerichtete Synchronisierung (der Normalfall, und die Browser-
 * Vorschau) läuft alles wie bisher über den lokalen Zähler.
 *
 * @throws NumberUnavailableError wenn Sync an ist, aber weder Server noch
 *         Vorrat etwas hergeben. Auf den lokalen Zähler zurückzufallen wäre
 *         bequem und erzeugte genau die Dublette, die zu vermeiden ist.
 */
export async function allocateNumber(
  kind: NumberKind,
  localNext: number,
  year: number = new Date().getFullYear(),
): Promise<AllocatedNumber> {
  const result = await window.api?.syncAllocateNumber?.(kind, year).catch(() => null);

  if (!result || result.source === 'local') {
    return { value: localNext, bumpLocalCounter: true, source: 'local' };
  }
  if (result.source === 'unavailable') {
    throw new NumberUnavailableError(result.error);
  }
  return { value: result.value, bumpLocalCounter: false, source: result.source };
}
