// ============================================================
// Gerät mit Gerät verbinden
// ============================================================
// Ersetzt die Passphrase. Statt sich ein zweites Geheimnis zu merken, bestätigt
// man am schon eingerichteten Gerät eine sechsstellige Zahl.
//
// Der eigentliche Schlüsselaustausch läuft über X25519: Beide Seiten erzeugen
// ein Wegwerf-Schlüsselpaar, tauschen die öffentlichen Hälften über Supabase
// und rechnen daraus dasselbe gemeinsame Geheimnis aus. Ein *mitlesender*
// Server kann daraus nichts gewinnen.
//
// Bliebe ein Server, der sich aktiv dazwischenschiebt und beiden Seiten seinen
// eigenen Schlüssel unterschiebt. Genau dagegen steht die Zahl: Sie wird aus
// dem gemeinsamen Geheimnis **und** beiden öffentlichen Schlüsseln abgeleitet.
// Schiebt sich jemand dazwischen, entstehen zwei verschiedene Geheimnisse und
// damit zwei verschiedene Zahlen — der Mensch sieht es.
//
// Deshalb ist die Zahl **kein Passwort**. Sie muss nicht geheim bleiben und
// darf ruhig vorgelesen werden; sie muss nur übereinstimmen. Eine Million
// Möglichkeiten reichen dafür, weil ein Angreifer nicht raten, sondern ein
// passendes Paar *erzwingen* müsste — das hieße, einen Hash zu brechen.

const crypto = require('node:crypto');

const CODE_STELLEN = 6;
const CODE_MODULO = 10 ** CODE_STELLEN;

/** Wegwerf-Schlüsselpaar für genau einen Verbindungsvorgang. */
function generateLinkKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return {
    privateKey,
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

function importPublicKey(base64) {
  return crypto.createPublicKey({
    key: Buffer.from(base64, 'base64'),
    type: 'spki',
    format: 'der',
  });
}

/**
 * Das gemeinsame Geheimnis beider Seiten.
 *
 * Das rohe ECDH-Ergebnis wandert nicht direkt weiter — HKDF macht daraus einen
 * gleichmäßig verteilten Schlüssel und bindet ihn an den Verwendungszweck.
 */
function deriveShared(privateKey, peerPublicKeyB64) {
  const raw = crypto.diffieHellman({ privateKey, publicKey: importPublicKey(peerPublicKeyB64) });
  return Buffer.from(crypto.hkdfSync('sha256', raw, Buffer.alloc(0), 'kavoma-link-v1', 32));
}

/**
 * Die sechsstellige Prüfzahl.
 *
 * Enthält neben dem gemeinsamen Geheimnis auch beide öffentlichen Schlüssel —
 * sortiert, damit beide Seiten unabhängig von ihrer Rolle dasselbe rechnen.
 */
function deriveCode(shared, pubA, pubB) {
  const [erst, zweit] = [pubA, pubB].sort();
  const material = crypto.hkdfSync(
    'sha256', shared, Buffer.alloc(0),
    `kavoma-link-code|${erst}|${zweit}`, 8,
  );
  const zahl = Buffer.from(material).readBigUInt64BE() % BigInt(CODE_MODULO);
  return String(zahl).padStart(CODE_STELLEN, '0');
}

/** Vergleicht zwei Codes zeitkonstant — Ziffern verraten sonst nach und nach. */
function codesMatch(a, b) {
  const x = Buffer.from(String(a ?? '').replace(/\D/g, ''), 'utf8');
  const y = Buffer.from(String(b ?? '').replace(/\D/g, ''), 'utf8');
  if (x.length !== y.length || x.length === 0) return false;
  return crypto.timingSafeEqual(x, y);
}

// === Datenschlüssel über die Leitung =======================================
// Format wie überall sonst: IV(12) | AuthTag(16) | Ciphertext, base64.

function sealDek(shared, dek, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', shared, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function openDek(shared, payloadB64, aad) {
  const blob = Buffer.from(payloadB64, 'base64');
  if (blob.length < 28) throw new Error('Verbindungsdaten beschädigt.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', shared, blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

module.exports = {
  CODE_STELLEN,
  generateLinkKeypair,
  deriveShared,
  deriveCode,
  codesMatch,
  sealDek,
  openDek,
};
