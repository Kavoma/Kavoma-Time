// ============================================================
// Verschlüsselte Sicherung als Datei
// ============================================================
//
// Geschrieben wird im Main-Prozess. Der Renderer sagt nur, dass eine Sicherung
// entstehen soll — er sieht weder Schlüssel noch Belege. Vorher lief das über
// einen Blob und `a.click()`; das ging, solange eine Sicherung nur der
// Datenbestand war. Seit die Belege mitkommen, kann sie Gigabyte gross werden,
// und ein Blob dieser Grösse ist ein Speicherproblem ohne Gegenwert.

/**
 * Schreibt eine `.kvbak`-Sicherung ohne Rückfrage in den Download-Ordner.
 *
 * Für Stellen, an denen ein Dateidialog nur im Weg stünde — etwa die
 * Sicherheitskopie unmittelbar vor dem Erstabgleich.
 *
 * Wirft, wenn die Verschlüsselung nicht verfügbar ist — bewusst kein
 * Klartext-Notausgang. Wer eine Sicherung anfordert, will keine, die jeder
 * lesen kann.
 */
export async function writeEncryptedBackup(prefix = 'kavoma-time-backup'): Promise<string> {
  if (!window.api?.backupExport) {
    throw new Error('Verschlüsselte Sicherungen sind ohne Electron-Schicht nicht verfügbar.');
  }
  const ergebnis = await window.api.backupExport({ mode: 'auto', prefix });
  if (!ergebnis.ok || !ergebnis.file) {
    throw new Error(ergebnis.error ?? 'Die Sicherung konnte nicht geschrieben werden.');
  }
  return ergebnis.file;
}
