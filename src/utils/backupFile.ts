// ============================================================
// Verschlüsselte Sicherung als Datei
// ============================================================

import type { AppState } from '../types';

function zeitstempel(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Schreibt eine `.kvbak`-Sicherung des übergebenen Zustands.
 *
 * Wirft, wenn die Verschlüsselung nicht verfügbar ist — bewusst kein
 * Klartext-Notausgang. Wer eine Sicherung anfordert, will keine, die jeder
 * lesen kann.
 */
export async function writeEncryptedBackup(state: AppState, prefix = 'kavoma-time-backup'): Promise<string> {
  if (!window.api?.encryptBackup) {
    throw new Error('Verschlüsselte Sicherungen sind ohne Electron-Schicht nicht verfügbar.');
  }
  const payload = await window.api.encryptBackup(JSON.stringify(state));
  if (!payload?.encrypted) {
    throw new Error('Die Verschlüsselung lieferte kein verschlüsseltes Ergebnis zurück.');
  }

  const dateiname = `${prefix}-${zeitstempel()}.kvbak`;
  const blob = new Blob([JSON.stringify({ kavoma: 'backup', ...payload }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
  return dateiname;
}
