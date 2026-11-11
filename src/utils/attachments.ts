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

export type AttachmentMime = 'application/pdf' | 'application/xml';

/**
 * Was der Browser als Typ meldet, ist unzuverlässig: Für `.xml` kommt je nach
 * System `text/xml`, `application/xml` — oder gar nichts. Die Endung ist hier
 * die verlässlichere Quelle.
 */
export function detectMime(file: File): AttachmentMime | null {
  const typ = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (typ === 'application/pdf' || name.endsWith('.pdf')) return 'application/pdf';
  if (typ === 'text/xml' || typ === 'application/xml' || name.endsWith('.xml')) return 'application/xml';
  return null;
}

/**
 * Legt eine Datei verschlüsselt ab.
 *
 * `erlaubt` grenzt ein, was hier hineindarf. Eingangsrechnungen nehmen auch
 * XML an — eine XRechnung kommt als reine XML-Datei ohne PDF, und wer die
 * abweist, kann die Empfangspflicht seit 2025 nicht erfüllen. Verträge bleiben
 * bei PDF; ein Vertrag als XML ergibt keinen Sinn.
 */
export async function uploadDocument(
  file: File,
  erlaubt: readonly AttachmentMime[] = ['application/pdf'],
): Promise<Attachment> {
  const mimeType = detectMime(file);
  if (!mimeType || !erlaubt.includes(mimeType)) {
    throw new Error(
      erlaubt.length > 1
        ? 'Nur PDF- oder XML-Dateien sind erlaubt.'
        : 'Nur PDF-Dateien sind erlaubt.',
    );
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
    mimeType,
    sizeBytes: result.sizeBytes,
    sha256,
    uploadedAt: Date.now(),
  };
}

/** Die rohen Bytes eines Anhangs. */
export async function loadAttachmentBytes(attachmentId: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!window.api?.attachmentRead) {
    throw new Error('Anhänge können nur in der Desktop-App geladen werden.');
  }
  const base64 = await window.api.attachmentRead(attachmentId);
  return base64ToUint8Array(base64);
}

/**
 * Anhang als Blob. Der Typ kommt aus den Metadaten — alte Datensätze kennen
 * nur PDF, und genau das waren sie auch.
 */
export async function loadAttachmentBlob(
  attachmentId: string,
  mimeType: AttachmentMime = 'application/pdf',
): Promise<Blob> {
  const bytes = await loadAttachmentBytes(attachmentId);
  return new Blob([bytes], { type: mimeType });
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
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
