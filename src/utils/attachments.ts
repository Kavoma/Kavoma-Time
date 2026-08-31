import { Attachment } from '../types';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as unknown as number[],
    );
  }
  return btoa(binary);
}

/**
 * Der Rückgabetyp ist bewusst auf `ArrayBuffer` festgelegt: Seit den neueren
 * lib-Typen ist `Uint8Array` über seinen Puffer generisch, und `BlobPart`
 * verlangt einen echten `ArrayBuffer`. `new Uint8Array(len)` liefert immer
 * einen — TypeScript leitet es nur nicht mehr von allein ab.
 */
function base64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function generateId(): string {
  // Über `globalThis` statt direkt: Der `in`-Test verengt `crypto` sonst so
  // weit, dass TypeScript den Ausweichzweig für unerreichbar hält und
  // `getRandomValues` auf `never` nicht mehr findet.
  const c: Crypto | undefined = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID().replace(/-/g, '');
  }
  if (typeof c?.getRandomValues === 'function') {
    const arr = new Uint8Array(16);
    c.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Weder das eine noch das andere: lieber abbrechen als eine schwache
  // Kennung vergeben, an der später eine verschlüsselte Datei hängt.
  throw new Error('Dieser Browser bietet keine sichere Zufallsquelle für Anhang-IDs.');
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadPdf(file: File): Promise<Attachment> {
  if (file.type !== 'application/pdf') {
    throw new Error('Nur PDF-Dateien sind erlaubt.');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Datei ist zu groß (max. ${MAX_FILE_SIZE / 1024 / 1024} MB).`);
  }
  if (!window.api?.attachmentWrite) {
    throw new Error('Datei-Upload ist nur in der Desktop-App verfügbar.');
  }
  const arrayBuf = await file.arrayBuffer();
  const id = generateId();
  const base64 = bufferToBase64(arrayBuf);
  const sha256 = await sha256Hex(arrayBuf);
  const result = await window.api.attachmentWrite(id, base64);
  return {
    id,
    filename: file.name,
    mimeType: 'application/pdf',
    sizeBytes: result.sizeBytes,
    sha256,
    uploadedAt: Date.now(),
  };
}

export async function loadPdfBlob(attachmentId: string): Promise<Blob> {
  if (!window.api?.attachmentRead) {
    throw new Error('Anhänge können nur in der Desktop-App geladen werden.');
  }
  const base64 = await window.api.attachmentRead(attachmentId);
  const bytes = base64ToUint8Array(base64);
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function deletePdf(attachmentId: string): Promise<void> {
  if (!window.api?.attachmentDelete) {
    throw new Error('attachmentDelete-API nicht verfügbar (kein Electron-Kontext).');
  }
  await window.api.attachmentDelete(attachmentId);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
