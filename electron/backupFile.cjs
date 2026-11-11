// ============================================================
// Das Sicherungsformat
// ============================================================
// Version 1 war ein JSON-Objekt mit base64-Chiffrat darin, geschrieben vom
// Renderer über einen Blob. Das trug den Datenbestand, aber **keine Belege** —
// die PDFs unter `attachments/` waren in keiner Sicherung enthalten. Und es
// trug keinen Wiederherstellungs-Umschlag, war also nur auf dem Rechner zu
// öffnen, der es geschrieben hatte.
//
// Version 2 behebt beides und wird deshalb ein Container:
//
//   Byte 0    "KVBAK2\0\0"        Magie, 8 Byte
//   Byte 8    uint32 BE           Länge des Kopfes
//   Byte 12   Kopf als JSON       Umschlag, Reihenfolge und Längen
//   danach    Rumpf               die Chiffrate, in der Reihenfolge des Kopfes
//
// Jedes Chiffrat im Rumpf hat dasselbe Format wie ein Beleg auf der Platte:
// IV(12) | AuthTag(16) | Ciphertext. Der Kopf nennt nur die Gesamtlänge, die
// Versätze ergeben sich durch Aufsummieren.
//
// Warum kein Zip: Es käme eine Abhängigkeit dazu, und ein Zip verführt dazu,
// die Datei mit dem Betriebssystem zu öffnen — was hier nichts nützt, weil
// jeder Eintrag einzeln verschlüsselt ist. Ein eigener Container ist ehrlicher
// und in dreißig Zeilen gelesen.
//
// Geschrieben und gelesen wird das **im Main-Prozess**, nicht mehr im
// Renderer. Ein Bestand mit Belegen kann Gigabyte gross werden; als Blob durch
// den Renderer geschoben wäre er ein Speicherproblem. Der Rumpf entsteht
// deshalb in einer Beidatei und wird gestreamt angehängt — im Arbeitsspeicher
// liegt immer nur ein Beleg.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const nodeCrypto = require('node:crypto');

/**
 * Zwischen zwei Belegen die Ereignisschleife durchatmen lassen.
 *
 * Geschrieben wird mit `writeSync` — asynchrone Schreibvorgänge auf demselben
 * Deskriptor müssten sonst von Hand serialisiert werden, und ein halb
 * verschachtelter Rumpf wäre stiller Datenmüll. Der Preis dafür ist, dass ein
 * Bestand mit vielen Belegen den Main-Prozess am Stück belegen würde: keine
 * Fensterzeichnung, keine Tray-Uhr, kein reagierender Timer. Ein Zwischenschritt
 * pro Beleg kostet nichts und hält die App währenddessen bedienbar.
 */
const durchatmen = () => new Promise((resolve) => setImmediate(resolve));

const MAGIC = Buffer.from('KVBAK2\0\0', 'latin1');
const HEADER_OFFSET = MAGIC.length + 4;
const IV_LEN = 12;
const TAG_LEN = 16;

/** Ein Kopf über 8 MB ist kein Kopf mehr, sondern ein Angriff oder Datenmüll. */
const MAX_HEADER_BYTES = 8 * 1024 * 1024;

// === Bausteine ==============================================================

function seal(keyHex, plaintext) {
  const iv = nodeCrypto.randomBytes(IV_LEN);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function open(keyHex, blob) {
  if (blob.length < IV_LEN + TAG_LEN) {
    throw new Error('Eintrag beschädigt: zu kurz für IV und Prüfsumme.');
  }
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), blob.subarray(0, IV_LEN));
  decipher.setAuthTag(blob.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([decipher.update(blob.subarray(IV_LEN + TAG_LEN)), decipher.final()]);
}

const sha256 = (buf) => nodeCrypto.createHash('sha256').update(buf).digest('hex');

// === Schreiben ==============================================================

/**
 * Schreibt eine Sicherung im Format 2.
 *
 * `attachments` ist eine Liste `{ id, filename, sha256 }`; `readAttachment(id)`
 * liefert den Klartext oder wirft. Belege, die auf diesem Gerät nicht liegen
 * (etwa weil sie auf einem anderen entstanden und noch nicht geholt wurden),
 * werden **übersprungen und gemeldet** — stillschweigend fehlen dürfen sie
 * nicht, sonst hält jemand eine unvollständige Sicherung für vollständig.
 *
 * Der Wiederherstellungs-Umschlag wandert mit in die Datei. Damit ist die
 * Sicherung selbsttragend: Code plus Datei genügt, kein Rechner muss überlebt
 * haben.
 */
async function writeBackup({
  file,
  keyHex,
  stateJson,
  recoveryEnvelope = null,
  attachments = [],
  readAttachment = null,
  appVersion = null,
}) {
  if (!keyHex) {
    throw new Error('Verschlüsselung nicht verfügbar — die Sicherung wurde abgebrochen, um zu verhindern, dass Daten unverschlüsselt geschrieben werden.');
  }

  const bodyFile = `${file}.part`;
  const skipped = [];
  const eintraege = [];
  let bodyFd = null;
  let zielFd = null;

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    bodyFd = fs.openSync(bodyFile, 'w');

    // Der Datenbestand zuerst, gzip vor der Verschlüsselung. JSON schrumpft
    // dabei um ein Vielfaches; danach wäre nichts mehr zu holen, Chiffrat
    // lässt sich nicht komprimieren.
    const stateBlob = seal(keyHex, zlib.gzipSync(Buffer.from(stateJson, 'utf8')));
    fs.writeSync(bodyFd, stateBlob);
    const stateEintrag = { len: stateBlob.length, compression: 'gzip' };

    // Danach die Belege, einer nach dem anderen. PDFs sind bereits
    // komprimiert — noch einmal durch gzip zu schicken kostet Zeit und
    // bringt nichts.
    for (const att of attachments) {
      let klartext;
      try {
        klartext = await readAttachment(att.id);
      } catch (e) {
        skipped.push({ id: att.id, filename: att.filename ?? null, grund: e.message });
        continue;
      }
      const blob = seal(keyHex, klartext);
      fs.writeSync(bodyFd, blob);
      await durchatmen();
      eintraege.push({
        id: att.id,
        filename: att.filename ?? null,
        sha256: att.sha256 ?? sha256(klartext),
        len: blob.length,
      });
    }

    fs.closeSync(bodyFd);
    bodyFd = null;

    const header = {
      kavoma: 'backup',
      version: 2,
      createdAt: new Date().toISOString(),
      appVersion,
      algorithm: 'aes-256-gcm',
      recovery: recoveryEnvelope,
      state: stateEintrag,
      attachments: eintraege,
      skippedAttachments: skipped,
    };
    const headerBuf = Buffer.from(JSON.stringify(header), 'utf8');
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(headerBuf.length, 0);

    zielFd = fs.openSync(file, 'w');
    fs.writeSync(zielFd, MAGIC);
    fs.writeSync(zielFd, laenge);
    fs.writeSync(zielFd, headerBuf);

    // Rumpf in Stücken anhängen, damit auch eine sehr grosse Sicherung nie
    // vollständig im Arbeitsspeicher liegt.
    const quelle = fs.openSync(bodyFile, 'r');
    try {
      const puffer = Buffer.alloc(1 << 20);
      let gelesen;
      while ((gelesen = fs.readSync(quelle, puffer, 0, puffer.length, null)) > 0) {
        fs.writeSync(zielFd, puffer, 0, gelesen);
        await durchatmen();
      }
    } finally {
      fs.closeSync(quelle);
    }

    fs.closeSync(zielFd);
    zielFd = null;

    return {
      file,
      attachmentCount: eintraege.length,
      skippedAttachments: skipped,
      bytes: fs.statSync(file).size,
    };
  } catch (e) {
    // Eine halb geschriebene Sicherung ist schlimmer als keine: Sie sieht aus
    // wie eine.
    try { if (zielFd !== null) fs.closeSync(zielFd); } catch { /* egal */ }
    try { if (fs.existsSync(file)) fs.rmSync(file, { force: true }); } catch { /* egal */ }
    throw e;
  } finally {
    try { if (bodyFd !== null) fs.closeSync(bodyFd); } catch { /* egal */ }
    try { if (fs.existsSync(bodyFile)) fs.rmSync(bodyFile, { force: true }); } catch { /* egal */ }
  }
}

// === Lesen ==================================================================

/** Trägt die Datei die Magie von Format 2? */
function isContainer(file) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const probe = Buffer.alloc(MAGIC.length);
    const gelesen = fs.readSync(fd, probe, 0, MAGIC.length, 0);
    return gelesen === MAGIC.length && probe.equals(MAGIC);
  } catch {
    return false;
  } finally {
    try { if (fd !== null) fs.closeSync(fd); } catch { /* egal */ }
  }
}

/**
 * Liest den Kopf und rechnet die Versätze aus. Berührt kein Chiffrat und
 * braucht deshalb keinen Schlüssel — so kann die Oberfläche zeigen, was in der
 * Datei steckt, bevor nach dem Code gefragt wird.
 */
function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const vorspann = Buffer.alloc(HEADER_OFFSET);
    if (fs.readSync(fd, vorspann, 0, HEADER_OFFSET, 0) !== HEADER_OFFSET) {
      throw new Error('Datei ist zu kurz für eine Sicherung.');
    }
    if (!vorspann.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Das ist keine Sicherung im Format 2.');
    }
    const headerLen = vorspann.readUInt32BE(MAGIC.length);
    if (headerLen === 0 || headerLen > MAX_HEADER_BYTES) {
      throw new Error('Sicherung beschädigt: unglaubwürdige Kopflänge.');
    }
    const headerBuf = Buffer.alloc(headerLen);
    if (fs.readSync(fd, headerBuf, 0, headerLen, HEADER_OFFSET) !== headerLen) {
      throw new Error('Sicherung beschädigt: Kopf unvollständig.');
    }
    const header = JSON.parse(headerBuf.toString('utf8'));
    if (header?.version !== 2) {
      throw new Error(`Unbekannte Sicherungs-Version: ${header?.version}`);
    }

    // Versätze aufsummieren, Reihenfolge ist die des Kopfes.
    let offset = HEADER_OFFSET + headerLen;
    header.state.offset = offset;
    offset += header.state.len;
    for (const att of header.attachments ?? []) {
      att.offset = offset;
      offset += att.len;
    }
    header.bodyEnd = offset;

    const groesse = fs.fstatSync(fd).size;
    if (groesse < offset) {
      throw new Error('Sicherung ist abgeschnitten — der Rumpf ist kürzer als der Kopf angibt.');
    }
    return header;
  } finally {
    fs.closeSync(fd);
  }
}

function readSlice(file, offset, len) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    if (fs.readSync(fd, buf, 0, len, offset) !== len) {
      throw new Error('Sicherung beschädigt: Eintrag unvollständig.');
    }
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

/** Der Datenbestand als JSON-Text. */
function openState(file, header, keyHex) {
  const blob = readSlice(file, header.state.offset, header.state.len);
  const roh = open(keyHex, blob);
  const klartext = header.state.compression === 'gzip' ? zlib.gunzipSync(roh) : roh;
  return klartext.toString('utf8');
}

/**
 * Holt die Belege aus der Sicherung und übergibt sie einzeln an `writePlain`.
 *
 * Die Prüfsumme aus dem Kopf wird gegengerechnet: Sie steht ohnehin in den
 * Metadaten jedes Belegs, also kostet die Prüfung nichts und deckt einen
 * stillen Bitfehler auf, bevor er acht Jahre unbemerkt bleibt.
 *
 * Geschrieben wird mit dem Schlüssel **dieses** Geräts, nicht mit dem aus der
 * Sicherung — der Beleg soll danach normal weiterbenutzbar sein.
 */
async function extractAttachments(file, header, keyHex, writePlain) {
  const ergebnis = { restored: 0, failed: [] };
  for (const att of header.attachments ?? []) {
    try {
      const klartext = open(keyHex, readSlice(file, att.offset, att.len));
      if (att.sha256 && sha256(klartext) !== att.sha256) {
        throw new Error('Prüfsumme stimmt nicht — der Beleg ist beschädigt.');
      }
      await writePlain(att.id, klartext);
      await durchatmen();
      ergebnis.restored += 1;
    } catch (e) {
      ergebnis.failed.push({ id: att.id, filename: att.filename ?? null, grund: e.message });
    }
  }
  return ergebnis;
}

// === Format 1 ===============================================================
// Alte Sicherungen bleiben lesbar. Sie enthalten keine Belege und keinen
// Umschlag — sie lassen sich weiterhin nur auf ihrem Ursprungsrechner öffnen.
// Das ist genau der Mangel, den Format 2 behebt; rückwirkend reparieren lässt
// er sich nicht.

function readLegacy(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed?.kavoma === 'portable-export' && parsed?.data) {
    return { kind: 'portable', payload: parsed.data };
  }
  if (parsed?.encrypted && parsed?.data) {
    return { kind: 'encrypted-v1', payload: parsed };
  }
  if (parsed && Array.isArray(parsed.customers) && Array.isArray(parsed.entries)) {
    return { kind: 'plain', payload: parsed };
  }
  throw new Error('Unbekanntes Dateiformat.');
}

function openLegacyEncrypted(payload, keyHex) {
  if (payload.algorithm !== 'aes-256-gcm') throw new Error('Unbekanntes Verschlüsselungs-Verfahren');
  const blob = Buffer.concat([
    Buffer.from(payload.iv, 'base64'),
    Buffer.from(payload.authTag, 'base64'),
    Buffer.from(payload.data, 'base64'),
  ]);
  return open(keyHex, blob).toString('utf8');
}

module.exports = {
  MAGIC,
  writeBackup,
  isContainer,
  readHeader,
  openState,
  extractAttachments,
  readLegacy,
  openLegacyEncrypted,
  seal,
  open,
};
