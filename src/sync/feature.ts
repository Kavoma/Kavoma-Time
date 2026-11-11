/**
 * Hauptschalter für die Gerätesynchronisation.
 *
 * Vorerst **aus**: Die Nummernvergabe über den Server hat in der Praxis
 * Rechnungsnummern festgehalten, die lokal längst frei waren. Solange das
 * nicht sauber gelöst ist, läuft die App wieder rein lokal.
 *
 * Muss zusammen mit `SYNC_ENABLED` in `electron/main.cjs` umgestellt werden —
 * der Main-Prozess startet den Motor sonst trotzdem bzw. gar nicht.
 */
export const SYNC_ENABLED = false;
