// ============================================================
// Wiederherstellungscode für den Sicherungsschlüssel
// ============================================================
// Der Schlüssel in `kavoma.key` ist Zufall, den `safeStorage` an den
// Schlüsselbund bzw. an DPAPI bindet. Er verschlüsselt die `.kvbak`-Dateien
// und die Belege unter `attachments/`. Solange er der einzige Weg zu diesen
// Daten war, galt:
//
//   - Ein `.kvbak` auf einem neuen Rechner einzuspielen ging nicht.
//   - Systemneuinstallation, verlorener Schlüsselbund-Eintrag oder eine
//     geänderte Signatur-Identität machten alle Sicherungen dauerhaft
//     unlesbar.
//
// Buchungsbelege sind nach § 147 AO acht Jahre aufzubewahren. Über acht Jahre
// mindestens einen Rechnerwechsel zu überstehen, ist der Normalfall. Eine
// Sicherung, die das nicht kann, ist keine.
//
// Dieses Modul legt deshalb einen **zweiten Umschlag** um denselben Schlüssel,
// verschlossen mit einem Wiederherstellungscode, den der Mensch besitzt.
// Verfahren und Parameter kommen aus `electron/crypto.cjs` — dasselbe, das die
// Gerätesynchronisation seit jeher benutzt.
//
// Der gerätegebundene Weg bleibt unverändert: Auf dem eigenen Rechner wird nie
// nach dem Code gefragt. Er ist der Weg zurück, wenn der Rechner weg ist.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('./crypto.cjs');

const RECOVERY_FILE = 'kavoma-backup-recovery.json';

/**
 * Schnellere KDF-Parameter sind hier NICHT vorgesehen. Der Code wird bei einer
 * Wiederherstellung genau einmal eingegeben; eine Sekunde Rechenzeit ist der
 * Preis dafür, dass Raten teuer bleibt.
 */

function envelopePath(userDataDir) {
  return path.join(userDataDir, RECOVERY_FILE);
}

/** Liest den Umschlag von der Platte. `null`, wenn es keinen gibt. */
function readEnvelope(userDataDir) {
  const file = envelopePath(userDataDir);
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed?.wrapped || !parsed?.kdf) return null;
    return parsed;
  } catch (e) {
    console.warn('Wiederherstellungs-Umschlag unlesbar:', e.message);
    return null;
  }
}

function hasEnvelope(userDataDir) {
  return readEnvelope(userDataDir) !== null;
}

/**
 * Legt den Umschlag an und gibt den Code **genau einmal** zurück. Danach ist er
 * nirgends mehr abrufbar — gespeichert wird nur, was mit ihm verschlossen ist.
 *
 * `keyHex` ist der Schlüssel aus `kavoma.key`, unverändert. Der vorhandene
 * Bestand muss deshalb nicht neu verschlüsselt werden.
 */
function createEnvelope(userDataDir, keyHex, { force = false } = {}) {
  if (!keyHex) {
    throw new Error('Ohne Verschlüsselungsschlüssel lässt sich kein Wiederherstellungscode anlegen.');
  }
  if (!force && hasEnvelope(userDataDir)) {
    throw new Error('Es gibt bereits einen Wiederherstellungscode für diesen Rechner.');
  }
  const recoveryCode = crypto.generateRecoveryCode();
  const { kdf, wrapped } = crypto.wrapDek(
    Buffer.from(keyHex, 'hex'),
    crypto.normalizeRecoveryCode(recoveryCode),
  );
  const envelope = { version: 1, createdAt: new Date().toISOString(), kdf, wrapped };
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(envelopePath(userDataDir), JSON.stringify(envelope, null, 2), 'utf8');
  return { recoveryCode, envelope };
}

/**
 * Öffnet einen Umschlag mit dem Code. Wirft bei falschem Code — AES-GCM
 * schlägt fehl, bevor irgendetwas Falsches herauskommt.
 *
 * Nimmt den Umschlag als Argument statt ihn zu lesen: Beim Einspielen auf einem
 * fremden Rechner kommt er aus der `.kvbak`-Datei, nicht von der Platte.
 */
function openEnvelope(envelope, code) {
  if (!envelope?.wrapped || !envelope?.kdf) {
    throw new Error('Diese Sicherung enthält keinen Wiederherstellungs-Umschlag.');
  }
  const dek = crypto.unwrapDek(envelope.wrapped, envelope.kdf, crypto.normalizeRecoveryCode(code));
  return dek.toString('hex');
}

/**
 * Prüft einen Code gegen den Umschlag dieses Rechners und hält fest, dass er
 * einmal richtig abgetippt wurde.
 *
 * Der Unterschied ist wichtig: Einen Umschlag anzulegen ist ein Klick, den Code
 * zu besitzen ist etwas anderes. Wer ihn nur weggeklickt hat, merkt das sonst
 * erst beim Rechnerwechsel. `confirmedAt` erlaubt es der Oberfläche, so lange
 * nachzufragen, bis der Code wirklich angekommen ist.
 */
function verifyCode(userDataDir, code) {
  const envelope = readEnvelope(userDataDir);
  if (!envelope) return false;
  try {
    openEnvelope(envelope, code);
  } catch {
    return false;
  }
  if (!envelope.confirmedAt) {
    try {
      const bestaetigt = { ...envelope, confirmedAt: new Date().toISOString() };
      fs.writeFileSync(envelopePath(userDataDir), JSON.stringify(bestaetigt, null, 2), 'utf8');
    } catch (e) {
      // Die Bestätigung ist Komfort, kein Schutz. Lässt sie sich nicht
      // schreiben, fragt die Oberfläche eben weiter — das ist die
      // ungefährliche Richtung.
      console.warn('Bestätigung des Wiederherstellungscodes nicht gespeichert:', e.message);
    }
  }
  return true;
}

module.exports = {
  RECOVERY_FILE,
  envelopePath,
  readEnvelope,
  hasEnvelope,
  createEnvelope,
  openEnvelope,
  verifyCode,
};
