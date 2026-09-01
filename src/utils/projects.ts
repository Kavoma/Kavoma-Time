// ============================================================
// Einträge ohne Projekt
// ============================================================
// Ein Zeiteintrag braucht einen Kunden, aber nicht zwingend ein Projekt. Wer
// mit dem Erfassen beginnt, hat oft noch kein Projekt angelegt — und die Arbeit
// deswegen abzulehnen, verliert genau die Zeit, um die es geht. Das Projekt
// lässt sich später nachtragen; bis dahin steht der Eintrag unter „Ohne
// Projekt" und wird ganz normal abgerechnet (der Stundensatz fällt dann auf den
// des Kunden zurück).

import type { Project } from '../types';

/** Kein Projekt zugeordnet. Entspricht dem bisherigen Leerwert der Auswahl. */
export const NO_PROJECT_ID = 0;

/** Anzeigename für Einträge ohne Projekt. */
export const NO_PROJECT_LABEL = 'Ohne Projekt';

/**
 * Auswahl-Eintrag für „kein Projekt".
 *
 * Steht bewusst an erster Stelle der Liste: Er ist der Ausgangszustand, nicht
 * eine Ausnahme am Ende.
 */
export const NO_PROJECT_OPTION = { id: NO_PROJECT_ID, name: NO_PROJECT_LABEL } as const;

/** Name des Projekts oder der Platzhalter, wenn keines zugeordnet ist. */
export function projectLabel(
  projects: readonly Project[],
  projectId: number | null | undefined,
): string {
  if (!projectId) return NO_PROJECT_LABEL;
  return projects.find((p) => p.id === projectId)?.name ?? NO_PROJECT_LABEL;
}
