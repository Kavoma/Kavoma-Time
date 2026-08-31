// ============================================================
// Schlüssel und Umschläge für die Gerätesynchronisation
// ============================================================
// Der lokale Schutz (`safeStorage`, DPAPI bzw. Schlüsselbund) ist an dieses
// Benutzerkonto auf diesem Rechner gebunden — ein zweites Gerät kann damit
// nichts anfangen. Synchronisierung braucht deshalb einen zweiten
// Schlüsselweg: eine Passphrase, die der Mensch kennt und auf beiden Geräten
// eingibt. Der lokale Weg bleibt davon unberührt.
//
//   Passphrase             ──scrypt──▶ KEK_pass ─┐
//                                                 ├─▶ zwei Umschläge um denselben DEK
//   Wiederherstellungscode ──scrypt──▶ KEK_rec  ─┘
//
//   DEK (32 Byte, einmalig zufällig) ──▶ AES-256-GCM für alle Nutzdaten
//
// Der Datenschlüssel wird bewusst NICHT direkt aus der Passphrase abgeleitet.
// Sonst müsste ein Passphrase-Wechsel den gesamten Bestand neu verschlüsseln;
// so wird nur der Umschlag neu geschrieben.

const crypto = require('node:crypto');

// scrypt statt Argon2id: Node bringt es mit. `argon2` wäre ein natives Modul
// und damit ein `electron-rebuild` für zwei Betriebssysteme und je zwei
// Architekturen — für einen überschaubaren Gewinn.
//
// N=2^17, r=8, p=1 braucht rund 128 MB und etwa eine Sekunde. Node deckelt
// scrypt standardmäßig bei 32 MB, deshalb `maxmem` ausdrücklich hochsetzen —
// ohne das verweigert die Ableitung schlicht den Dienst.
const DEFAULT_KDF = { algo: 'scrypt', N: 1 << 17, r: 8, p: 1 };
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

/** Ohne Reserve schlägt scrypt bei N=2^17 mit „memory limit exceeded" fehl. */
function maxmemFor(params) {
  return 256 * params.N * params.r + 64 * 1024 * 1024;
}

function deriveKey(secret, kdf) {
  const params = { ...DEFAULT_KDF, ...kdf };
  const salt = Buffer.from(params.salt, 'base64');
  return crypto.scryptSync(secret.normalize('NFKC'), salt, KEY_LEN, {
    N: params.N, r: params.r, p: params.p, maxmem: maxmemFor(params),
  });
}

function newKdfParams(overrides = {}) {
  return {
    ...DEFAULT_KDF,
    ...overrides,
    salt: crypto.randomBytes(SALT_LEN).toString('base64'),
  };
}

/** Frischer Datenschlüssel. Existiert genau einmal pro Konto. */
function generateDek() {
  return crypto.randomBytes(KEY_LEN);
}

// === Umschläge ==============================================================
// Format wie bei den Anhängen: IV(12) | AuthTag(16) | Ciphertext. Für
// Datenbankspalten base64-kodiert.
//
// `aad` bindet den Umschlag an seinen Platz (z. B. `"<userId>:<opId>"`). Wer
// Schreibzugriff auf die Datenbank hätte, könnte Chiffrat sonst zwischen
// Zeilen verschieben, ohne dass es auffällt.

function seal(dek, plaintext, aad) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function open(dek, payloadB64, aad) {
  const blob = Buffer.from(payloadB64, 'base64');
  if (blob.length < IV_LEN + TAG_LEN) {
    throw new Error('Umschlag beschädigt: zu kurz für IV und Prüfsumme.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, blob.subarray(0, IV_LEN));
  decipher.setAuthTag(blob.subarray(IV_LEN, IV_LEN + TAG_LEN));
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  const dec = Buffer.concat([decipher.update(blob.subarray(IV_LEN + TAG_LEN)), decipher.final()]);
  return dec.toString('utf8');
}

// === Datenschlüssel ein- und auspacken ======================================

/** Umschließt den DEK mit einem Geheimnis (Passphrase oder Code). */
function wrapDek(dek, secret, kdfOverrides = {}) {
  const kdf = newKdfParams(kdfOverrides);
  const kek = deriveKey(secret, kdf);
  return { kdf, wrapped: seal(kek, dek.toString('base64'), 'dek') };
}

/**
 * Öffnet den Umschlag. Wirft bei falschem Geheimnis — die Prüfsumme von
 * AES-GCM schlägt fehl, bevor irgendetwas Falsches herauskommt.
 */
function unwrapDek(wrapped, kdf, secret) {
  const kek = deriveKey(secret, kdf);
  try {
    return Buffer.from(open(kek, wrapped, 'dek'), 'base64');
  } catch {
    throw new Error('Passphrase oder Wiederherstellungscode ist falsch.');
  }
}

// === Wiederherstellungscode =================================================
// „Passphrase vergessen = Daten weg" ist die ehrliche Konsequenz daraus, dass
// Kavoma die Daten nicht entschlüsseln können soll. Ein zweiter Umschlag um
// denselben DEK macht daraus etwas, das ein Mensch überleben kann.
//
// Alphabet nach Crockford: ohne I, L, O und U. Wer den Code von Papier
// abtippt, verwechselt so keine 1 mit einem l und keine 0 mit einem O.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_BYTES = 20;   // 160 Bit — 32 Zeichen, acht Vierergruppen

function formatRecoveryCode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g).join('-');
}

function generateRecoveryCode() {
  return formatRecoveryCode(crypto.randomBytes(RECOVERY_BYTES));
}

/**
 * Macht die Schreibweise egal: Bindestriche, Leerzeichen und Kleinschreibung
 * werden vereinheitlicht, und die typischen Abtippfehler werden korrigiert,
 * bevor jemand denkt, sein Code sei falsch.
 */
function normalizeRecoveryCode(input) {
  return String(input)
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

module.exports = {
  DEFAULT_KDF,
  generateDek,
  newKdfParams,
  deriveKey,
  seal,
  open,
  wrapDek,
  unwrapDek,
  generateRecoveryCode,
  normalizeRecoveryCode,
};
