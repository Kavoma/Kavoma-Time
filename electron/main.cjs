// ============================================================
// Electron Main-Process
// ============================================================

const { app, BrowserWindow, dialog, nativeTheme, ipcMain, Tray, Menu, globalShortcut, nativeImage, safeStorage, screen, powerMonitor, shell, Notification } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const fsp  = require('node:fs/promises');
const crypto = require('node:crypto');
const Store = require('electron-store').default || require('electron-store');
const { autoUpdater } = require('electron-updater');

// === PLATTFORM ===
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// Das schwebende Timer-Overlay gibt es unter macOS nicht mehr: Dort steht die
// laufende Zeit ohnehin dauerhaft in der Menüleiste, und ein zusätzliches
// Fenster, das sich über alles legt, ist auf einem einzelnen Bildschirm eher
// im Weg. Unter Windows bleibt es — dort gibt es keine Menüleisten-Uhr.
const OVERLAY_SUPPORTED = !IS_MAC;

// === APP IDENTIFICATION & PATHS ===
app.name = 'Kavoma Time';
if (IS_WIN) {
  app.setAppUserModelId('com.kavoma.time');
}
// Setzen des Pfads auf Roaming/Kavoma/KavomaTime (Professional Organization)
const customUserDataPath = path.join(app.getPath('appData'), 'Kavoma', 'KavomaTime');
app.setPath('userData', customUserDataPath);

// === SINGLE INSTANCE LOCK ===
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// === Encryption Key ===
// AES-256-Schlüssel wird in einer Datei abgelegt, die mit safeStorage
// (OS-Keychain / DPAPI auf Windows) verschlüsselt ist. So lässt sich der
// Klartext-Store nicht einfach auslesen, wenn jemand die Daten kopiert.
function getOrCreateEncryptionKey() {
  // Ohne safeStorage kein Schlüssel — sonst würden wir mit einem
  // session-only Random-Key verschlüsseln, der beim nächsten Start verloren
  // ist und den Store unlesbar macht. Stattdessen: undefined zurückgeben →
  // Store läuft unverschlüsselt, aber dauerhaft lesbar.
  if (!safeStorage.isEncryptionAvailable()) {
    return undefined;
  }
  const keyFile = path.join(app.getPath('userData'), 'kavoma.key');
  try {
    if (fs.existsSync(keyFile)) {
      const encrypted = fs.readFileSync(keyFile);
      return safeStorage.decryptString(encrypted);
    }
  } catch (e) {
    console.warn('Konnte Schlüssel nicht entschlüsseln, generiere neu:', e.message);
  }
  const key = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    const encrypted = safeStorage.encryptString(key);
    fs.writeFileSync(keyFile, encrypted);
  } catch (e) {
    console.warn('Konnte Schlüssel nicht speichern:', e.message);
    return undefined;
  }
  return key;
}

// Store wird erst nach app.whenReady() initialisiert, damit safeStorage verfügbar ist
let store = null;
let currentEncryptionKey = null;

ipcMain.handle('store-get', (_event, key) => store?.get(key));
ipcMain.handle('store-set', (event, key, data) => {
  store?.set(key, data);

  if (key === 'kavoma_time') {
    currentTimerState = data;
    updateOverlayVisibility();
    refreshTray();
    // Wird der Timer anderweitig gestoppt, ist eine offene Pausen-Frage
    // gegenstandslos.
    if (!data?.isRunning) {
      pendingAfkPause = null;
      afkIdleSince = null;
    }
  }

  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id === event.sender.id) return;
    win.webContents.send('store-updated', key, data);
  });
});

// === Backup-Verschlüsselung (AES-256-GCM mit dem App-Schlüssel) ===
function encryptBackupPayload(plaintext) {
  if (!currentEncryptionKey) {
    throw new Error('Verschlüsselung nicht verfügbar — Backup wurde abgebrochen, um zu verhindern, dass Daten unverschlüsselt geschrieben werden.');
  }
  const keyBuf = Buffer.from(currentEncryptionKey, 'hex');
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return {
    version:   1,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv:        iv.toString('base64'),
    authTag:   tag.toString('base64'),
    data:      enc.toString('base64'),
  };
}

ipcMain.handle('backup-encrypt', (_event, plaintext) => encryptBackupPayload(plaintext));

ipcMain.handle('backup-decrypt', (_event, payload) => {
  if (!currentEncryptionKey) throw new Error('Kein Schlüssel verfügbar');
  if (!payload || !payload.encrypted) throw new Error('Backup ist nicht verschlüsselt');
  if (payload.algorithm !== 'aes-256-gcm') throw new Error('Unbekanntes Verschlüsselungs-Verfahren');
  const keyBuf = Buffer.from(currentEncryptionKey, 'hex');
  const iv     = Buffer.from(payload.iv,      'base64');
  const tag    = Buffer.from(payload.authTag, 'base64');
  const enc    = Buffer.from(payload.data,    'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
});

ipcMain.handle('get-encryption-status', () => {
  return {
    available: safeStorage.isEncryptionAvailable(),
    active: Boolean(currentEncryptionKey),
  };
});

// === Gerätesynchronisation: Kennung dieses Geräts ===
// Liegt unter einem eigenen Store-Schlüssel statt im AppState — wie
// `auto_backup_config`. Läge sie im State, würde ein eingespieltes Backup die
// Kennung auf ein zweites Gerät klonen, und zwei Geräte mit derselben Kennung
// machen die Lamport-Reihenfolge unauflösbar.
const SYNC_DEVICE_KEY = 'sync_device_id';

// === Nummernkreise ==========================================================
// Rechnungsnummern dürfen sich zwischen Geräten nie doppeln. Drei Fälle:
//
//   Sync gar nicht eingerichtet → lokaler Zähler, wie seit jeher.
//   Sync an und online          → atomar aus der Datenbank.
//   Sync an und offline         → aus einer vorab gezogenen Reserve.
//
// Und wenn Sync an ist, offline und die Reserve leer: dann gibt es **keine**
// Nummer. Auf den lokalen Zähler zurückzufallen wäre bequem und würde genau
// die Dublette erzeugen, gegen die dieser ganze Aufwand betrieben wird.
const SYNC_RESERVE_KEY = 'sync_number_reserve';
const RESERVE_TARGET = 10;

let syncEngine = null;

/** Schickt an alle offenen Fenster — Haupt- und Overlay-Fenster. */
function broadcastToRenderers(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}

function initSyncEngine() {
  if (syncEngine || !store) return syncEngine;
  try {
    const { createEngine } = require('./sync/engine.cjs');
    syncEngine = createEngine({
      store,
      userDataPath: app.getPath('userData'),
      safeStorage,
      broadcast: broadcastToRenderers,
    });
    // Nur der Main-Prozess kennt das Anhang-Verzeichnis und den Geräteschlüssel.
    // Über diese Haken kommt der Motor an die Belege heran, ohne die Krypto
    // ein zweites Mal zu enthalten.
    syncEngine.setAttachmentHooks({
      listLocalIds: async () => {
        try {
          if (!fs.existsSync(ATTACHMENT_DIR)) return [];
          return fs.readdirSync(ATTACHMENT_DIR)
            .filter((f) => f.endsWith('.pdf.enc'))
            .map((f) => f.replace(/\.pdf\.enc$/, ''));
        } catch (_) { return []; }
      },
      readPlain: async (id) => readAttachmentPlain(id),
      writePlain: async (id, plaintext) => writeAttachmentPlain(id, plaintext),
    });

    // Eine bestehende Anmeldung wiederaufnehmen — ohne erneute Passphrase.
    syncEngine.restore().catch((e) => console.warn('Sync-Wiederaufnahme:', e.message));
  } catch (e) {
    console.warn('Sync-Motor nicht verfügbar:', e.message);
    syncEngine = null;
  }
  return syncEngine;
}

function getSyncClient() {
  return syncEngine?._internals?.api ?? null;
}

// === Sync-IPC ===============================================================
// Jeder Kanal steht laut CLAUDE.md an drei Stellen: hier, in `preload.cjs` und
// in der `Window['api']`-Deklaration in `src/types/index.ts`.

/** Wirft die Fehlermeldung an den Renderer durch, statt still `null` zu liefern. */
function withEngine(fn) {
  return async (event, ...args) => {
    if (!syncEngine) throw new Error('Synchronisierung ist auf diesem Gerät nicht verfügbar.');
    return fn(syncEngine, event, ...args);
  };
}

ipcMain.handle('sync-get-region', () => {
  const cfg = require('./sync/config.cjs');
  return { region: cfg.region, isThirdCountry: Boolean(cfg.regionIsThirdCountry) };
});

ipcMain.handle('sync-get-status', () => syncEngine?.status() ?? {
  state: 'off', account: null, lastSyncAt: null, pendingOps: 0, error: null, deviceId: null,
});

ipcMain.handle('sync-sign-in', withEngine((e, _ev, email, password) => e.signIn(email, password)));
ipcMain.handle('sync-sign-out', withEngine((e) => e.signOut()));
ipcMain.handle('sync-has-keys', withEngine((e) => e.hasKeys()));
ipcMain.handle('sync-setup-passphrase', withEngine((e, _ev, passphrase) => e.setupPassphrase(passphrase)));
ipcMain.handle('sync-initialize-key', withEngine((e) => e.initializeKey()));
ipcMain.handle('sync-start-link', withEngine((e) => e.startDeviceLink()));
ipcMain.handle('sync-cancel-link', withEngine((e) => { e.cancelDeviceLink(); return true; }));
ipcMain.handle('sync-list-links', withEngine((e) => e.listPendingLinks()));
ipcMain.handle('sync-respond-link', withEngine((e, _ev, id) => e.respondToLink(id)));
ipcMain.handle('sync-approve-link', withEngine((e, _ev, id, code) => e.approveLink(id, code)));
ipcMain.handle('sync-reject-link', withEngine((e, _ev, id) => e.rejectLink(id)));
ipcMain.handle('sync-unlock', withEngine((e, _ev, secret) => e.unlock(secret)));
ipcMain.handle('sync-start', withEngine((e) => e.start()));
ipcMain.handle('sync-enqueue', withEngine((e, _ev, ops) => e.enqueue(ops)));
ipcMain.handle('sync-now', withEngine((e) => e.sync().then(() => e.status())));
ipcMain.handle('sync-fetch-all', withEngine((e) => e.fetchAll()));
ipcMain.handle('sync-accept-cursor', withEngine((e, _ev, seq) => { e.acceptCursor(seq); return true; }));
ipcMain.handle('sync-list-devices', withEngine((e) => e.listDevices()));
ipcMain.handle('sync-revoke-device', withEngine((e, _ev, id) => e.revokeDevice(id)));

function reserveBucket(kind, year) {
  const all = store?.get(SYNC_RESERVE_KEY) || {};
  const bucket = all[`${kind}:${year}`];
  return Array.isArray(bucket) ? bucket : [];
}

function setReserveBucket(kind, year, values) {
  const all = store?.get(SYNC_RESERVE_KEY) || {};
  all[`${kind}:${year}`] = values;
  store?.set(SYNC_RESERVE_KEY, all);
}

/** Nimmt die kleinste vorgemerkte Nummer. Reserven laufen aufsteigend ab. */
function popReserve(kind, year) {
  const values = reserveBucket(kind, year);
  if (values.length === 0) return null;
  const [first, ...rest] = values;
  setReserveBucket(kind, year, rest);
  return first;
}

/**
 * Füllt die Reserve auf, solange Netz da ist. Läuft im Hintergrund — ein
 * Fehlschlag darf die gerade laufende Vergabe nicht aufhalten.
 */
async function topUpReserve(api, kind, year) {
  const values = reserveBucket(kind, year);
  if (values.length >= RESERVE_TARGET) return;
  const missing = RESERVE_TARGET - values.length;
  try {
    const first = await api.allocateNumber(kind, year, missing);
    const block = Array.from({ length: missing }, (_, i) => first + i);
    setReserveBucket(kind, year, [...values, ...block]);
  } catch (e) {
    console.warn('Nummern-Reserve konnte nicht aufgefüllt werden:', e.message);
  }
}

ipcMain.handle('sync-allocate-number', async (_event, kind, year) => {
  if (kind !== 'invoice' && kind !== 'debtor') throw new Error('Unbekannter Nummernkreis.');
  const api = getSyncClient();
  if (!api) return { source: 'local' };

  let user = null;
  try {
    user = await api.getUser();
  } catch (_) { /* keine Sitzung lesbar → wie nicht angemeldet behandeln */ }
  if (!user) return { source: 'local' };

  try {
    const value = await api.allocateNumber(kind, year, 1);
    // Nicht abwarten: Die Nummer steht schon fest, das Auffüllen ist Vorsorge.
    topUpReserve(api, kind, year);
    return { source: 'server', value };
  } catch (e) {
    const fromReserve = popReserve(kind, year);
    if (fromReserve !== null) return { source: 'reserve', value: fromReserve };
    return { source: 'unavailable', error: e.message };
  }
});

ipcMain.handle('sync-reserve-status', (_event, kind, year) => ({
  kind, year, remaining: reserveBucket(kind, year).length, target: RESERVE_TARGET,
}));

ipcMain.handle('sync-get-device-info', () => {
  if (!store) return null;
  let id = store.get(SYNC_DEVICE_KEY);
  if (typeof id !== 'string' || !id) {
    id = crypto.randomUUID();
    store.set(SYNC_DEVICE_KEY, id);
  }
  let name;
  try {
    name = require('os').hostname();
  } catch (_) {
    name = 'Unbekanntes Gerät';
  }
  return { id, name, platform: process.platform };
});

// === Automatisches Backup ==================================================
// Läuft komplett im Main-Prozess: nur hier liegen Schlüssel, Store und
// Dateisystem-Zugriff. Backups werden mit demselben AES-256-GCM-Verfahren
// geschrieben wie der manuelle Export — bei fehlendem Schlüssel wird
// abgebrochen statt Klartext zu schreiben.
const AUTO_BACKUP_KEY = 'auto_backup_config';
const AUTO_BACKUP_PREFIX = 'kavoma-time-autobackup-';
const AUTO_BACKUP_EXT = '.kvbak';
/** Wie oft geprüft wird, ob ein Backup fällig ist. */
const AUTO_BACKUP_TICK_MS = 5 * 60 * 1000;

const AUTO_BACKUP_DEFAULTS = {
  enabled: false,
  intervalHours: 24,
  directory: null,
  keep: 10,
  lastRunAt: 0,
};

let autoBackupTimer = null;
/** Letztes Ergebnis für die Anzeige in den Einstellungen. */
let autoBackupLastError = null;
let autoBackupLastFile = null;

function getAutoBackupConfig() {
  const stored = (store && store.get(AUTO_BACKUP_KEY)) || {};
  const cfg = { ...AUTO_BACKUP_DEFAULTS, ...stored };
  cfg.intervalHours = Math.min(24 * 7, Math.max(1, Number(cfg.intervalHours) || 24));
  cfg.keep = Math.min(100, Math.max(1, Number(cfg.keep) || 10));
  cfg.enabled = Boolean(cfg.enabled) && Boolean(cfg.directory);
  return cfg;
}

function saveAutoBackupConfig(patch) {
  const next = { ...getAutoBackupConfig(), ...patch };
  store?.set(AUTO_BACKUP_KEY, next);
  return next;
}

function backupFileName(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${AUTO_BACKUP_PREFIX}${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}${AUTO_BACKUP_EXT}`;
}

/** Behält die N neuesten Auto-Backups, löscht den Rest. */
async function rotateAutoBackups(directory, keep) {
  const files = (await fsp.readdir(directory))
    .filter((f) => f.startsWith(AUTO_BACKUP_PREFIX) && f.endsWith(AUTO_BACKUP_EXT))
    .sort();                       // Dateiname ist chronologisch sortierbar
  const stale = files.slice(0, Math.max(0, files.length - keep));
  for (const f of stale) {
    try {
      await fsp.unlink(path.join(directory, f));
    } catch (e) {
      console.warn('Altes Auto-Backup konnte nicht gelöscht werden:', f, e.message);
    }
  }
  return stale.length;
}

async function runAutoBackup() {
  const cfg = getAutoBackupConfig();
  if (!cfg.directory) throw new Error('Kein Zielordner gewählt.');
  if (!store) throw new Error('Datenspeicher noch nicht bereit.');

  const data = store.get('kavoma_time');
  if (!data) throw new Error('Keine Daten zum Sichern vorhanden.');

  // Wirft, wenn kein Schlüssel da ist — bewusst kein Klartext-Fallback
  const payload = encryptBackupPayload(JSON.stringify(data));

  await fsp.mkdir(cfg.directory, { recursive: true });
  const now = new Date();
  const file = path.join(cfg.directory, backupFileName(now));
  await fsp.writeFile(file, JSON.stringify({ kavoma: 'backup', ...payload }, null, 2), 'utf8');

  const removed = await rotateAutoBackups(cfg.directory, cfg.keep);
  saveAutoBackupConfig({ lastRunAt: now.getTime() });
  autoBackupLastError = null;
  autoBackupLastFile = file;
  return { file, removed };
}

async function maybeRunAutoBackup() {
  const cfg = getAutoBackupConfig();
  if (!cfg.enabled) return;
  const due = Date.now() - (cfg.lastRunAt || 0) >= cfg.intervalHours * 3600_000;
  if (!due) return;
  try {
    await runAutoBackup();
  } catch (e) {
    autoBackupLastError = e.message;
    console.error('Auto-Backup fehlgeschlagen:', e.message);
  }
}

function scheduleAutoBackup() {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  autoBackupTimer = setInterval(maybeRunAutoBackup, AUTO_BACKUP_TICK_MS);
  // Direkt nach dem Start einmal prüfen (mit kurzem Versatz, damit der
  // Store-Load und das erste Rendern nicht konkurrieren)
  setTimeout(maybeRunAutoBackup, 20_000);
}

ipcMain.handle('auto-backup-get-config', () => ({
  ...getAutoBackupConfig(),
  lastError: autoBackupLastError,
  lastFile: autoBackupLastFile,
}));

ipcMain.handle('auto-backup-set-config', (_event, patch) => {
  const next = saveAutoBackupConfig(patch || {});
  scheduleAutoBackup();
  return { ...getAutoBackupConfig(), lastError: autoBackupLastError, lastFile: autoBackupLastFile };
});

ipcMain.handle('auto-backup-choose-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Zielordner für automatische Backups',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  saveAutoBackupConfig({ directory: result.filePaths[0] });
  scheduleAutoBackup();
  return result.filePaths[0];
});

ipcMain.handle('auto-backup-run-now', async () => {
  try {
    const { file, removed } = await runAutoBackup();
    return { ok: true, file, removed };
  } catch (e) {
    autoBackupLastError = e.message;
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('auto-backup-open-directory', () => {
  const cfg = getAutoBackupConfig();
  if (!cfg.directory) return false;
  shell.openPath(cfg.directory);
  return true;
});

ipcMain.handle('get-app-info', () => {
  const os = require('os');
  const release = os.release();
  let osName;

  if (IS_MAC) {
    // Darwin-Kernel-Version auf die macOS-Marketing-Version abbilden
    // (Darwin 25 = macOS 26, Darwin 24 = macOS 15, ...).
    const darwinMajor = parseInt(release.split('.')[0], 10);
    const macMajor = Number.isFinite(darwinMajor)
      ? (darwinMajor >= 25 ? darwinMajor + 1 : darwinMajor - 9)
      : null;
    osName = macMajor ? `macOS ${macMajor} (Darwin ${release})` : `macOS (Darwin ${release})`;
  } else if (IS_WIN) {
    const major = parseInt(release.split('.')[0], 10);
    const build = parseInt(release.split('.')[2], 10);
    osName = `Windows ${release}`;
    if (major === 10) {
      if (build >= 22000) osName = `Windows 11 (${build})`;
      else osName = `Windows 10 (${build})`;
    }
  } else {
    osName = `${os.type()} ${release}`;
  }

  return {
    os: osName,
    arch: process.arch,
    version: app.getVersion(),
  };
});

ipcMain.handle('get-update-status', () => updateStatus);

ipcMain.handle('check-for-updates', () => checkForUpdates(true));

// === Onboarding-Status (Erst-Start-Hinweis zu Datenschutz) ===
const ONBOARDING_KEY = 'onboarding_completed_v1';
ipcMain.handle('get-onboarding-completed', () => {
  if (!store) return false;
  return Boolean(store.get(ONBOARDING_KEY));
});
ipcMain.handle('set-onboarding-completed', () => {
  if (!store) return false;
  store.set(ONBOARDING_KEY, true);
  return true;
});

// === Auto-Update Opt-out (DSGVO Art. 6/13 — Transparenz und Wahl) ===
const AUTO_UPDATE_KEY = 'auto_update_enabled';
ipcMain.handle('get-auto-update-enabled', () => {
  if (!store) return true;
  const v = store.get(AUTO_UPDATE_KEY);
  return v === undefined ? true : Boolean(v);
});
ipcMain.handle('set-auto-update-enabled', (_event, enabled) => {
  if (!store) return false;
  store.set(AUTO_UPDATE_KEY, Boolean(enabled));
  return true;
});

ipcMain.handle('install-downloaded-update', () => {
  if (updateStatus.state !== 'downloaded') return false;
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
  return true;
});

// === Recht auf Löschung (DSGVO Art. 17) ===
// Entfernt alle gespeicherten Daten (electron-store, Schlüsseldatei, sonstige
// App-Dateien in userData) und startet die App neu, damit sie wie nach einer
// Neuinstallation startet.
ipcMain.handle('wipe-all-data', async () => {
  try {
    if (store) {
      try { store.clear(); } catch (_) { /* ignorieren, wir löschen die Dateien gleich */ }
    }
    const userDataDir = app.getPath('userData');
    // `kavoma-sync.key` gehört dazu: Bleibt der Datenschlüssel liegen, könnte
    // ein späteres Gerät mit derselben Anmeldung die Cloud-Daten wieder
    // entschlüsseln — nach einem „alles löschen" wäre das eine böse Überraschung.
    const filesToRemove = ['kavoma.key', 'kavoma-time-data.json', 'kavoma-sync.key'];
    for (const name of filesToRemove) {
      const p = path.join(userDataDir, name);
      try { if (fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch (_) { /* skip */ }
    }
    // Anhänge-Verzeichnis (verschlüsselte Eingangsrechnungen / Verträge) komplett entfernen
    try {
      const attDir = path.join(userDataDir, 'attachments');
      if (fs.existsSync(attDir)) fs.rmSync(attDir, { recursive: true, force: true });
    } catch (_) { /* skip */ }
    currentEncryptionKey = null;
    currentTimerState = null;
    store = null;

    app.relaunch();
    isQuitting = true;
    app.exit(0);
    return true;
  } catch (e) {
    console.error('wipe-all-data failed:', e);
    throw new Error('Daten konnten nicht vollständig gelöscht werden.');
  }
});

// === Verschlüsselte PDF-Anhänge (Finanzen-Modul) ===
// AES-256-GCM, identische Schlüsselquelle wie backup-encrypt. Binärformat:
// IV(12) | AuthTag(16) | Ciphertext(N) — kompakt, kein JSON-Wrapper.
const ATTACHMENT_DIR = path.join(app.getPath('userData'), 'attachments');

// Gemeinsame Bausteine — vorher lag dieselbe AES-Logik zweimal in den
// Handlern. Jetzt braucht sie auch der Sync-Motor, der Belege für den
// Transport umschlüsselt.
function assertAttachmentId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Ungültige Anhang-ID.');
  }
  return id;
}

const attachmentPath = (id) => path.join(ATTACHMENT_DIR, `${assertAttachmentId(id)}.pdf.enc`);

/** Klartext → geräteverschlüsselte Datei. Format: IV(12) | AuthTag(16) | Ciphertext. */
function writeAttachmentPlain(id, plaintext) {
  if (!currentEncryptionKey) {
    throw new Error('Verschlüsselung nicht verfügbar — Anhang wurde abgebrochen.');
  }
  fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(currentEncryptionKey, 'hex'), iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  fs.writeFileSync(attachmentPath(id), Buffer.concat([iv, cipher.getAuthTag(), enc]));
  return plaintext.length;
}

/** Geräteverschlüsselte Datei → Klartext. */
function readAttachmentPlain(id) {
  if (!currentEncryptionKey) {
    throw new Error('Verschlüsselung nicht verfügbar — Anhang kann nicht gelesen werden.');
  }
  const file = attachmentPath(id);
  if (!fs.existsSync(file)) throw new Error('Anhang nicht gefunden.');
  const blob = fs.readFileSync(file);
  if (blob.length < 28) throw new Error('Anhang-Datei beschädigt: zu kurz für IV+AuthTag.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(currentEncryptionKey, 'hex'), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

ipcMain.handle('attachment-write', async (_event, { id, base64Plain }) => {
  const plaintext = Buffer.from(base64Plain, 'base64');
  const sizeBytes = writeAttachmentPlain(id, plaintext);
  // Hochladen im Hintergrund: Der Beleg liegt lokal bereits sicher, und der
  // Nutzer soll nicht auf das Netz warten, um weiterzuarbeiten. Schlägt es
  // fehl (etwa offline), holt `reconcileAttachments()` im Motor es beim
  // nächsten Abgleich nach — dort wird die Platte gegen die Ablage verglichen.
  syncEngine?.uploadAttachment(id, async () => plaintext)
    .catch((e) => console.warn('Beleg nicht hochgeladen:', e.message));
  return { sizeBytes };
});

ipcMain.handle('attachment-read', async (_event, id) => {
  assertAttachmentId(id);
  // Metadaten wandern sofort mit, die Datei erst auf Abruf. Fehlt sie hier,
  // ist der Beleg auf einem anderen Gerät entstanden.
  if (!fs.existsSync(attachmentPath(id)) && syncEngine) {
    await syncEngine.downloadAttachment(id, async (_id, plaintext) => writeAttachmentPlain(_id, plaintext));
  }
  return readAttachmentPlain(id).toString('base64');
});

/** Liegt der Beleg schon auf diesem Gerät? Steuert das Wolkensymbol in den Listen. */
ipcMain.handle('attachment-has', (_event, id) => {
  try { return fs.existsSync(attachmentPath(id)); } catch (_) { return false; }
});

ipcMain.handle('attachment-delete', async (_event, id) => {
  const file = attachmentPath(id);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  await syncEngine?.deleteAttachment(id);
  return true;
});

nativeTheme.themeSource = 'dark';

// ============================================================
// APPLICATION MENU
// ============================================================
// Windows/Linux: Menu komplett entfernen — die App bringt eine eigene
// Titelleiste mit. macOS: Menü liegt in der System-Menüleiste und trägt dort
// die komplette Standard-Tastatursteuerung. Ein null-Menü würde unter macOS
// Cmd+C/V/X/A/Z/Q/W app-weit außer Kraft setzen — deshalb hier ein echtes,
// auf Rollen basierendes Menu.
function setupApplicationMenu() {
  if (!IS_MAC) {
    Menu.setApplicationMenu(null);
    return;
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Kavoma Time',
      submenu: [
        { label: 'Über Kavoma Time', role: 'about' },
        { type: 'separator' },
        { label: 'Nach Updates suchen...', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { label: 'Einstellungen...', accelerator: 'Cmd+,', click: () => { showMainWindow(); mainWindow?.webContents.send('navigate-to-view', 'settings'); } },
        { type: 'separator' },
        { label: 'Dienste', role: 'services' },
        { type: 'separator' },
        { label: 'Kavoma Time ausblenden', role: 'hide' },
        { label: 'Andere ausblenden', role: 'hideOthers' },
        { label: 'Alle einblenden', role: 'unhide' },
        { type: 'separator' },
        { label: 'Kavoma Time beenden', role: 'quit' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Widerrufen', role: 'undo' },
        { label: 'Wiederholen', role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
        { label: 'Einfügen und Stil anpassen', role: 'pasteAndMatchStyle' },
        { label: 'Löschen', role: 'delete' },
        { label: 'Alles auswählen', role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Sprache',
          submenu: [
            { label: 'Sprache einblenden', role: 'startSpeaking' },
            { label: 'Sprache ausblenden', role: 'stopSpeaking' },
          ],
        },
      ],
    },
    {
      label: 'Timer',
      submenu: [
        { label: 'Start / Pause', accelerator: 'CommandOrControl+Shift+Space', click: () => mainWindow?.webContents.send('hotkey-toggle') },
        { label: 'Stoppen', click: () => mainWindow?.webContents.send('timer-command', 'stop') },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { label: 'Neu laden', role: 'reload' },
        { label: 'Vollständig neu laden', role: 'forceReload' },
        { label: 'Entwicklerwerkzeuge', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Originalgröße', role: 'resetZoom' },
        { label: 'Vergrößern', role: 'zoomIn' },
        { label: 'Verkleinern', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Vollbild', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Fenster',
      submenu: [
        { label: 'Im Dock ablegen', role: 'minimize' },
        { label: 'Zoomen', role: 'zoom' },
        { label: 'Schließen', role: 'close' },
        { type: 'separator' },
        { label: 'Alle nach vorne bringen', role: 'front' },
      ],
    },
  ]));
}

const DEV_URL = 'http://localhost:5173';
// macOS erwartet in der Menüleiste ein Template-Image (schwarze Silhouette +
// Alpha), das das System selbst für Hell-/Dunkelmodus einfärbt. Das farbige
// 32px-Icon von Windows würde dort unscharf und fehl am Platz wirken.
const TRAY_ICON_PATH = IS_MAC
  ? path.join(__dirname, 'trayTemplate.png')
  : path.join(__dirname, 'tray-icon.png');
const WINDOW_ICON_PATH = path.join(__dirname, 'window-icon.png');
const OVERLAY_ANCHOR_KEY = 'timer_overlay_anchor';
const OVERLAY_WIDTH = 400; // Vergrößert für Schatten-Padding
const OVERLAY_HEIGHT = 320;
const VISIBLE_WIDTH = 184;  // Die tatsächliche Breite der Karte
const VISIBLE_HEIGHT = 54;  // Die tatsächliche Höhe der Karte (ohne ausgeklappte Buttons)
const OVERLAY_MARGIN = 18;

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let trayTicker = null;
let isQuitting = false;
let currentTimerState = null;
let overlayDrag = null;
let overlayDragTimer = null;
let afkPauseTimer = null;
let updateStatus = {
  state: 'idle',
  message: 'Bereit',
  version: null,
  progress: null,
  error: null,
};

// ============================================================
// MAIN WINDOW
// ============================================================

function handleExternalLinks(webContents) {
  webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
      if (!url.startsWith(DEV_URL)) {
        event.preventDefault();
        shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
      }
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
      if (!url.startsWith(DEV_URL)) {
        shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1100,
    minHeight: 750,
    title: 'Kavoma Time',
    icon: WINDOW_ICON_PATH,
    backgroundColor: '#0a0a0a',
    // macOS zeichnet die Ampel-Buttons weiterhin, nur eingerückt —
    // titleBarOverlay gibt es dort nicht, das ist Windows/Linux-only.
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 16, y: 13 } }
      : {
          titleBarOverlay: {
            color: '#0a0a0a',
            symbolColor: '#ffffff',
            height: 40,
          },
        }),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  handleExternalLinks(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Schließen → in Tray verstecken (nicht beenden)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      updateOverlayVisibility();
    }
  });

  // Kein Ansichtswechsel per Wischgeste mehr.
  //
  // Electrons `swipe`-Ereignis feuert unter macOS nur, wenn im System
  // "Zwischen Seiten blättern" auf drei Finger steht. Voreingestellt sind dort
  // zwei Finger, und drei Finger gehören Mission Control. Wer die Geste in der
  // App wollte, musste sie Mission Control wegnehmen — ein schlechter Tausch
  // für etwas, das Cmd+1…6 ohnehin schneller erledigt.
  //
  // Auf zwei Finger auszuweichen ginge nicht: Diese Geste löscht in der
  // Eintragsliste bereits eine Zeile (`SwipeRow`) und würde sich mit
  // waagerechtem Scrollen in Tabellen schlagen.

  mainWindow.on('hide', updateOverlayVisibility);
  mainWindow.on('minimize', updateOverlayVisibility);
  mainWindow.on('blur', updateOverlayVisibility);
  mainWindow.on('show', updateOverlayVisibility);
  mainWindow.on('restore', updateOverlayVisibility);
  mainWindow.on('focus', updateOverlayVisibility);

  mainWindow.on('closed', () => {
    mainWindow = null;
    updateOverlayVisibility();
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ============================================================
// TIMER OVERLAY
// ============================================================

function isTimerInProgress(data) {
  return Boolean(data && (data.isRunning || data.elapsedBefore > 0));
}

function isTimerOverlayEnabled(data) {
  return data?.timerOverlayEnabled !== false;
}

function normalizeOverlayAnchor(anchor) {
  const corner = anchor?.corner || anchor;
  const validCorners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  if (!validCorners.includes(corner)) return { corner: 'top-right', displayId: screen.getPrimaryDisplay().id };

  const displayId = typeof anchor?.displayId === 'number' ? anchor.displayId : screen.getPrimaryDisplay().id;
  return { corner, displayId };
}

function getOverlayAnchor() {
  return normalizeOverlayAnchor(store?.get(OVERLAY_ANCHOR_KEY));
}

function saveOverlayAnchor(anchor) {
  const normalized = normalizeOverlayAnchor(anchor);
  store?.set(OVERLAY_ANCHOR_KEY, normalized);
  overlayWindow?.webContents.send('overlay-anchor-changed', normalized.corner);
  return normalized;
}

function getDisplayForAnchor(anchor) {
  return screen.getAllDisplays().find((display) => display.id === anchor.displayId) || screen.getPrimaryDisplay();
}

function getOverlayBoundsForAnchor(anchor) {
  const display = getDisplayForAnchor(anchor);
  const area = display.workArea;

  // Wir berechnen die Position so, dass die *sichtbare Karte* am Rand klebt,
  // aber das Fenster drumherum genug Platz für den Schatten bietet.
  const paddingX = (OVERLAY_WIDTH - VISIBLE_WIDTH) / 2;
  const paddingY = (OVERLAY_HEIGHT - VISIBLE_HEIGHT) / 2;

  const x = anchor.corner.endsWith('right')
    ? area.x + area.width - VISIBLE_WIDTH - OVERLAY_MARGIN - paddingX
    : area.x + OVERLAY_MARGIN - paddingX;
  
  const y = anchor.corner.startsWith('bottom')
    ? area.y + area.height - VISIBLE_HEIGHT - OVERLAY_MARGIN - paddingY
    : area.y + OVERLAY_MARGIN - paddingY;

  return { x: Math.round(x), y: Math.round(y), width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT };
}

function positionOverlay(anchor = getOverlayAnchor()) {
  if (!overlayWindow) return;
  overlayWindow.setBounds(getOverlayBoundsForAnchor(anchor), false);
  overlayWindow.webContents.send('overlay-anchor-changed', anchor.corner);
}

function createOverlayWindow() {
  if (!OVERLAY_SUPPORTED) return;

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    resizable: false,
    movable: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'Kavoma Time Overlay',
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  handleExternalLinks(overlayWindow.webContents);

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  overlayWindow.setAlwaysOnTop(true, 'floating');
  positionOverlay();

  if (!app.isPackaged) {
    overlayWindow.loadURL(`${DEV_URL}?overlay=timer`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query: { overlay: 'timer' },
    });
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function shouldShowOverlay() {
  if (!OVERLAY_SUPPORTED) return false;
  if (!isTimerOverlayEnabled(currentTimerState)) return false;
  if (!isTimerInProgress(currentTimerState)) return false;
  if (!mainWindow) return true;
  return !mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused();
}

function updateOverlayVisibility() {
  if (!overlayWindow) return;

  if (shouldShowOverlay()) {
    positionOverlay();
    overlayWindow.showInactive();
    overlayWindow.setAlwaysOnTop(true, 'floating');
  } else {
    overlayWindow.hide();
  }
}

function snapOverlayToNearestCorner() {
  if (!overlayWindow) return;

  const bounds = overlayWindow.getBounds();
  const center = {
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2),
  };
  const display = screen.getDisplayNearestPoint(center);
  const area = display.workArea;
  const candidates = [
    { corner: 'top-left', x: area.x + OVERLAY_MARGIN, y: area.y + OVERLAY_MARGIN },
    { corner: 'top-right', x: area.x + area.width - OVERLAY_WIDTH - OVERLAY_MARGIN, y: area.y + OVERLAY_MARGIN },
    { corner: 'bottom-left', x: area.x + OVERLAY_MARGIN, y: area.y + area.height - OVERLAY_HEIGHT - OVERLAY_MARGIN },
    { corner: 'bottom-right', x: area.x + area.width - OVERLAY_WIDTH - OVERLAY_MARGIN, y: area.y + area.height - OVERLAY_HEIGHT - OVERLAY_MARGIN },
  ];

  const nearest = candidates.reduce((best, candidate) => {
    const bestDistance = Math.hypot(bounds.x - best.x, bounds.y - best.y);
    const candidateDistance = Math.hypot(bounds.x - candidate.x, bounds.y - candidate.y);
    return candidateDistance < bestDistance ? candidate : best;
  });

  const anchor = saveOverlayAnchor({ corner: nearest.corner, displayId: display.id });
  positionOverlay(anchor);
}

function startOverlayDrag(cursor) {
  if (!overlayWindow || typeof cursor?.x !== 'number' || typeof cursor?.y !== 'number') return;

  const bounds = overlayWindow.getBounds();
  overlayDrag = {
    startCursor: { x: cursor.x, y: cursor.y },
    startBounds: bounds,
  };

  if (overlayDragTimer) clearInterval(overlayDragTimer);
  overlayDragTimer = setInterval(() => {
    if (!overlayWindow || !overlayDrag) return;
    const point = screen.getCursorScreenPoint();
    const x = Math.round(overlayDrag.startBounds.x + point.x - overlayDrag.startCursor.x);
    const y = Math.round(overlayDrag.startBounds.y + point.y - overlayDrag.startCursor.y);
    overlayWindow.setPosition(x, y, false);
  }, 16);
}

function endOverlayDrag() {
  if (overlayDragTimer) {
    clearInterval(overlayDragTimer);
    overlayDragTimer = null;
  }
  if (!overlayDrag) return;

  overlayDrag = null;
  snapOverlayToNearestCorner();
}

// ============================================================
// AFK AUTO-PAUSE
// ============================================================

function isAfkPauseEnabled(data) {
  return data?.afkPauseEnabled !== false;
}

function isStopOnShutdownEnabled(data) {
  return data?.stopOnShutdownEnabled !== false;
}

function getAfkTimeoutSeconds(data) {
  const minutes = Number(data?.afkTimeoutMinutes);
  const safeMinutes = Number.isFinite(minutes) ? Math.min(240, Math.max(1, minutes)) : 10;
  return Math.round(safeMinutes * 60);
}

/** Unterhalb dieses Werts gilt jemand als zurück am Rechner. */
const AFK_BACK_AT_DESK_SECONDS = 10;

/** Beginn der laufenden Untätigkeit, solange sie andauert. */
let afkIdleSince = null;
/** Beginn von Ruhezustand oder Bildschirmsperre. */
let afkAwaySince = null;
/** Erkannte Pause, über die noch nicht entschieden wurde. */
let pendingAfkPause = null;

/** Beginn des laufenden Eintrags — eine Pause davor gehört nicht zu ihm. */
function runningSessionStart(data) {
  return data?.sessionStartedAt || data?.startedAt || null;
}

/**
 * Eine erkannte Abwesenheit dem Renderer zur Entscheidung vorlegen.
 *
 * Bewusst nicht selbst pausieren: Ob die Zeit abgezogen wird, weiß nur der
 * Mensch davor. Ein stiller Abzug verliert Arbeitszeit, ein stilles Behalten
 * erfindet welche — beides falsch, wenn man einfach fragen kann.
 */
function proposeAfkPause(began, ended, reason) {
  if (pendingAfkPause) return;                       // Eine Frage zur Zeit reicht
  if (!isAfkPauseEnabled(currentTimerState)) return;
  if (!currentTimerState?.isRunning) return;

  const sessionStart = runningSessionStart(currentTimerState);
  if (!sessionStart || began <= sessionStart) return;

  const thresholdMs = getAfkTimeoutSeconds(currentTimerState) * 1000;
  if (ended - began < thresholdMs) return;

  pendingAfkPause = { began, ended, reason };
  mainWindow?.webContents.send('afk-pause-detected', pendingAfkPause);
}

function checkAfkPause() {
  if (!isAfkPauseEnabled(currentTimerState) || !currentTimerState?.isRunning) {
    afkIdleSince = null;
    return;
  }

  const idleSeconds = powerMonitor.getSystemIdleTime();
  const timeoutSeconds = getAfkTimeoutSeconds(currentTimerState);

  if (idleSeconds >= timeoutSeconds) {
    if (afkIdleSince === null) {
      const sessionStart = runningSessionStart(currentTimerState);
      // Die Untätigkeit begann vielleicht schon vor dem Eintrag — dann zählt
      // erst ab dessen Start.
      afkIdleSince = Math.max(Date.now() - idleSeconds * 1000, sessionStart || 0);
    }
    return;
  }

  if (idleSeconds < AFK_BACK_AT_DESK_SECONDS && afkIdleSince !== null) {
    const began = afkIdleSince;
    afkIdleSince = null;
    proposeAfkPause(began, Date.now() - idleSeconds * 1000, 'idle');
  }
}

/** Rückkehr aus Ruhezustand oder Bildschirmsperre. */
function handleAfkReturn(reason) {
  const began = afkAwaySince;
  afkAwaySince = null;
  afkIdleSince = null;
  if (!began) return;
  proposeAfkPause(began, Date.now(), reason);
}

function startAfkPauseWatcher() {
  if (afkPauseTimer) clearInterval(afkPauseTimer);
  afkPauseTimer = setInterval(checkAfkPause, 10_000);

  // Deckel zu oder gesperrt: nur den Zeitpunkt merken. Entschieden wird erst
  // bei der Rückkehr — vorher ist niemand da, der antworten könnte.
  powerMonitor.on('suspend', () => { afkAwaySince = Date.now(); });
  powerMonitor.on('lock-screen', () => { afkAwaySince = Date.now(); });
  powerMonitor.on('resume', () => handleAfkReturn('sleep'));
  powerMonitor.on('unlock-screen', () => handleAfkReturn('lock'));

  // Herunterfahren oder Abmelden: ohne Rückfrage stoppen — dafür bleibt keine
  // Zeit. Das Stoppen läuft trotzdem über den Renderer, damit der Eintrag
  // durch denselben Reducer entsteht wie sonst auch.
  powerMonitor.on('shutdown', (event) => {
    if (!isStopOnShutdownEnabled(currentTimerState)) return;
    if (!currentTimerState?.isRunning) return;
    event.preventDefault();
    isQuitting = true;
    mainWindow?.webContents.send('timer-command', 'stop');
    // Dem Renderer Zeit geben, den Eintrag zu schreiben und zu persistieren.
    setTimeout(() => app.quit(), 1500);
  });
}

ipcMain.handle('afk-pause-get-pending', () => pendingAfkPause);
ipcMain.handle('afk-pause-resolve', () => { pendingAfkPause = null; });

// ============================================================
// FEIERABEND-ERINNERUNG
// ============================================================
// Eine einzige Mitteilung am Abend, solange etwas läuft — bevor daraus über
// Nacht ein Vierzehn-Stunden-Eintrag wird.

const REMINDER_DEFAULT_HOUR = 18;
const REMINDER_DEFAULT_MINUTE = 30;

let reminderTimer = null;
/** Tag, an dem zuletzt erinnert wurde — verhindert Wiederholungen. */
let reminderSentOn = null;

function isReminderEnabled(data) {
  return data?.endOfDayReminderEnabled === true;
}

function checkEndOfDayReminder() {
  if (!isReminderEnabled(currentTimerState)) return;
  if (!currentTimerState?.isRunning) return;

  const now = new Date();
  const today = now.toDateString();
  if (reminderSentOn === today) return;

  const hour = Number.isFinite(currentTimerState?.endOfDayReminderHour)
    ? currentTimerState.endOfDayReminderHour
    : REMINDER_DEFAULT_HOUR;
  const minute = Number.isFinite(currentTimerState?.endOfDayReminderMinute)
    ? currentTimerState.endOfDayReminderMinute
    : REMINDER_DEFAULT_MINUTE;

  const due = now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
  if (!due) return;

  reminderSentOn = today;
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Die Zeiterfassung läuft noch',
    body: 'Feierabend? Dann jetzt stoppen, sonst zählt sie weiter.',
  }).show();
}

function startEndOfDayReminder() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkEndOfDayReminder, 60_000);
}

// ============================================================
// AUTO UPDATER
// ============================================================

function publishUpdateStatus(partial) {
  updateStatus = { ...updateStatus, ...partial };
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('update-status', updateStatus);
  });
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    publishUpdateStatus({
      state: 'checking',
      message: 'Suche nach Updates...',
      progress: null,
      error: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    publishUpdateStatus({
      state: 'available',
      message: `Update ${info.version} wird heruntergeladen...`,
      version: info.version,
      progress: null,
      error: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    publishUpdateStatus({
      state: 'downloading',
      message: `Update wird heruntergeladen (${Math.round(progress.percent)}%)`,
      progress: Math.round(progress.percent),
      error: null,
    });
  });

  autoUpdater.on('update-not-available', () => {
    publishUpdateStatus({
      state: 'not-available',
      message: 'Du nutzt die aktuelle Version.',
      progress: null,
      error: null,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateStatus({
      state: 'downloaded',
      message: `Update ${info.version} ist bereit.`,
      version: info.version,
      progress: 100,
      error: null,
    });
  });

  autoUpdater.on('error', (error) => {
    publishUpdateStatus({
      state: 'error',
      message: 'Update-Prüfung fehlgeschlagen.',
      progress: null,
      error: error?.message || String(error),
    });
  });
}

function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    publishUpdateStatus({
      state: 'dev-disabled',
      message: 'Updates sind nur in der installierten App aktiv.',
      progress: null,
      error: null,
    });
    return Promise.resolve(null);
  }

  // Opt-out: Wenn der Nutzer automatische Updates deaktiviert hat, überspringen
  // wir den automatischen Check beim Start. Manuelle Prüfungen bleiben erlaubt.
  if (!manual && store) {
    const enabled = store.get(AUTO_UPDATE_KEY);
    if (enabled === false) {
      publishUpdateStatus({
        state: 'idle',
        message: 'Automatische Updates sind deaktiviert.',
        progress: null,
        error: null,
      });
      return Promise.resolve(null);
    }
  }

  if (manual) {
    publishUpdateStatus({
      state: 'checking',
      message: 'Suche nach Updates...',
      progress: null,
      error: null,
    });
  }

  return autoUpdater.checkForUpdates().catch((error) => {
    const detail = error?.message || String(error);
    // Unter macOS verweigert electron-updater das Update, wenn das Bundle
    // keine gültige Developer-ID-Signatur hat. Das ist bei lokal gebauten
    // oder ad-hoc signierten Builds der Normalfall — kein echter Fehler,
    // aber der Nutzer muss wissen, dass er manuell aktualisieren muss.
    const unsignedMac = IS_MAC && /code signature|not signed|Developer ID/i.test(detail);
    publishUpdateStatus({
      state: 'error',
      message: unsignedMac
        ? 'Automatische Updates benötigen unter macOS eine Apple-Signatur (Developer ID). Bitte neue Version manuell installieren.'
        : 'Update-Prüfung fehlgeschlagen.',
      progress: null,
      error: detail,
    });
    return null;
  });
}

// ============================================================
// TRAY
// ============================================================

/** Sekunden des laufenden Eintrags — dieselbe Rechnung wie im Renderer. */
function liveElapsedSeconds(data, now = Date.now()) {
  if (!data) return 0;
  const before = data.elapsedBefore || 0;
  if (!data.isRunning || !data.startedAt) return before;
  return before + Math.max(0, Math.floor((now - data.startedAt) / 1000));
}

/** Kompakt für die Menüleiste: unter einer Stunde m:ss, danach h:mm. */
function formatMenuClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (n) => String(n).padStart(2, '0');
  if (total < 3600) return `${Math.floor(total / 60)}:${pad(total % 60)}`;
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}`;
}

/**
 * Die häufigsten Kombinationen aus Kunde, Projekt und Tätigkeit der letzten
 * Einträge — damit sich aus der Menüleiste in einem Klick weiterarbeiten lässt,
 * ohne die App zu öffnen.
 *
 * Einmaliges taugt nicht als Schnellstart: Was nur ein einziges Mal vorkam,
 * ist keine Gewohnheit, sondern Rauschen. Fällt dadurch alles weg, greift
 * weiter unten "Nochmal: …" auf den letzten Eintrag zurück.
 */
function computeQuickStarts(data, limit = 3) {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const projects = Array.isArray(data?.projects) ? data.projects : [];

  const recent = entries
    .filter((e) => e && e.endedAt)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 120);

  const buckets = new Map();
  for (const entry of recent) {
    const description = (entry.description || '').trim();
    const customerId = entry.customerId || 0;
    const projectId = entry.projectId || 0;
    // Ein Eintrag ganz ohne Zuordnung lässt sich nicht sinnvoll wiederholen.
    if (!description && !customerId && !projectId) continue;

    const key = `${customerId}|${projectId}|${description}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { count: 1, entry, customerId, projectId, description });
  }

  return [...buckets.values()]
    .filter((b) => b.count > 1)
    .sort((a, b) => (b.count - a.count) || ((b.entry.startedAt || 0) - (a.entry.startedAt || 0)))
    .slice(0, limit)
    .map((b) => ({
      customerId: b.customerId,
      projectId: b.projectId,
      description: b.description,
      customerName: customers.find((c) => c.id === b.customerId)?.name || null,
      projectName: projects.find((p) => p.id === b.projectId)?.name || null,
    }));
}

/** Letzter abgeschlossener Eintrag — Grundlage für "Nochmal: …". */
function lastFinishedEntry(data) {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return entries
    .filter((e) => e && e.endedAt)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] || null;
}

/** "Tätigkeit — Kunde · Projekt", je nachdem was gesetzt ist. */
function quickStartLabel(quick) {
  const task = quick.description || 'Ohne Tätigkeit';
  const where = [quick.customerName, quick.projectName].filter(Boolean).join(' · ');
  return where ? `${task} — ${where}` : task;
}

function sendQuickStart(target) {
  // Bewusst ohne showMainWindow: Der Sinn des Schnellstarts ist, dass die App
  // dafür gerade nicht nach vorne kommen muss. Ein verstecktes Fenster nimmt
  // die Nachricht genauso entgegen.
  if (mainWindow) {
    mainWindow.webContents.send('timer-quick-start', target);
    return;
  }
  // Nur falls gar kein Fenster mehr existiert: eins anlegen und warten, bis der
  // Renderer bereit ist — dort liegt der Zustand.
  createMainWindow();
  mainWindow?.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('timer-quick-start', target);
  });
}

function buildTrayMenu() {
  const data = currentTimerState;
  const running = Boolean(data?.isRunning);
  const elapsed = liveElapsedSeconds(data);
  const template = [];

  // Kopfzeile: was gerade läuft. Deaktiviert — reine Anzeige.
  if (running || elapsed > 0) {
    const task = (data?.currentDescription || '').trim() || 'Ohne Tätigkeit';
    template.push({
      label: `${running ? '▶' : '❚❚'}  ${task} · ${formatMenuClock(elapsed)}`,
      enabled: false,
    });
  } else {
    template.push({ label: 'Bereit', enabled: false });
  }
  template.push({ type: 'separator' });

  template.push({
    label: running ? 'Pause' : 'Start',
    accelerator: 'CmdOrCtrl+Shift+Space',
    click: () => mainWindow?.webContents.send('hotkey-toggle'),
  });
  template.push({
    label: 'Stoppen und sichern',
    enabled: running || elapsed > 0,
    click: () => mainWindow?.webContents.send('timer-command', 'stop'),
  });

  // Schnellstarts nur anbieten, solange nichts läuft — mitten im Eintrag
  // wäre der Klick ein Themenwechsel, kein Schnellstart.
  if (!running) {
    const quickStarts = computeQuickStarts(data);
    if (quickStarts.length > 0) {
      template.push({ type: 'separator' });
      template.push({ label: 'Weitermachen mit', enabled: false });
      for (const quick of quickStarts) {
        template.push({
          label: quickStartLabel(quick),
          click: () => sendQuickStart({
            customerId: quick.customerId,
            projectId: quick.projectId,
            description: quick.description,
          }),
        });
      }
    } else {
      const last = lastFinishedEntry(data);
      if (last) {
        template.push({ type: 'separator' });
        template.push({
          label: `Nochmal: ${(last.description || '').trim() || 'Ohne Tätigkeit'}`,
          click: () => sendQuickStart({
            customerId: last.customerId || 0,
            projectId: last.projectId || 0,
            description: last.description || '',
          }),
        });
      }
    }
  }

  template.push({ type: 'separator' });
  template.push({ label: 'Kavoma Time öffnen', click: showMainWindow });
  template.push({ label: 'Beenden', click: () => { isQuitting = true; app.quit(); } });

  return Menu.buildFromTemplate(template);
}

/**
 * Menü und Titel des Tray-Icons nachziehen. Der Titel steht unter macOS neben
 * dem Icon in der Menüleiste — dort sieht man die laufende Zeit, ohne irgendwo
 * hinzuklicken. Windows kennt das nicht und bekommt sie im Tooltip.
 */
function refreshTray() {
  if (!tray) return;

  const data = currentTimerState;
  const running = Boolean(data?.isRunning);
  const elapsed = liveElapsedSeconds(data);

  tray.setContextMenu(buildTrayMenu());

  if (IS_MAC) {
    tray.setTitle(running ? ` ${formatMenuClock(elapsed)}` : '');
  }
  tray.setToolTip(running || elapsed > 0
    ? `Kavoma Time — ${formatMenuClock(elapsed)}`
    : 'Kavoma Time');

  // Sekundentakt nur, solange wirklich etwas läuft.
  if (running && !trayTicker) {
    trayTicker = setInterval(refreshTray, 1000);
  } else if (!running && trayTicker) {
    clearInterval(trayTicker);
    trayTicker = null;
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  if (IS_MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  refreshTray();
  // Unter macOS öffnet bereits das gesetzte Kontextmenü bei jedem Klick —
  // ein zusätzlicher click-Handler würde das Fenster ungewollt mit aufmachen.
  if (!IS_MAC) tray.on('click', showMainWindow);
}

// ============================================================
// GLOBAL HOTKEY
// ============================================================

let currentShortcut = null;

function registerStartPauseShortcut(accelerator) {
  if (currentShortcut) {
    try { globalShortcut.unregister(currentShortcut); } catch {}
  }
  currentShortcut = accelerator || null;
  if (!accelerator) return;
  try {
    globalShortcut.register(accelerator, () => {
      mainWindow?.webContents.send('hotkey-toggle');
    });
  } catch (e) {
    console.error('Shortcut registration failed:', accelerator, e);
  }
}

function registerHotkeys() {
  // Beim Start: aus dem Store gespeicherten Shortcut lesen, sonst Default
  const saved = store?.get('kavoma_time');
  const accelerator = saved?.shortcuts?.startPause || 'CommandOrControl+Shift+Space';
  registerStartPauseShortcut(accelerator);
}

ipcMain.handle('set-start-pause-shortcut', (_event, accelerator) => {
  registerStartPauseShortcut(accelerator);
});

ipcMain.handle('timer-overlay-command', (_event, command) => {
  const validCommands = ['toggle', 'start', 'pause', 'stop'];
  if (!validCommands.includes(command)) return;
  mainWindow?.webContents.send('timer-command', command);
});

ipcMain.handle('overlay-get-bounds', () => {
  return overlayWindow?.getBounds() ?? null;
});

ipcMain.handle('overlay-set-position', (_event, position) => {
  if (!overlayWindow || typeof position?.x !== 'number' || typeof position?.y !== 'number') return;
  overlayWindow.setPosition(position.x, position.y, false);
});

ipcMain.handle('overlay-snap-nearest-corner', () => {
  snapOverlayToNearestCorner();
});

ipcMain.handle('overlay-get-anchor', () => {
  return getOverlayAnchor().corner;
});

ipcMain.handle('overlay-start-drag', (_event, cursor) => {
  startOverlayDrag(cursor);
});

ipcMain.handle('overlay-end-drag', () => {
  endOverlayDrag();
});

ipcMain.handle('overlay-show-main-window', () => {
  showMainWindow();
  updateOverlayVisibility();
});

ipcMain.on('overlay-set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    console.error('overlay-set-ignore-mouse-events: No window found for sender');
    event.sender.send('overlay-mouse-events-error', 'No window found');
    return;
  }

  // Validate parameters
  if (typeof ignore !== 'boolean') {
    console.error('overlay-set-ignore-mouse-events: ignore must be a boolean, got:', typeof ignore);
    event.sender.send('overlay-mouse-events-error', 'Invalid ignore parameter');
    return;
  }

  if (options !== undefined && (typeof options !== 'object' || options === null)) {
    console.error('overlay-set-ignore-mouse-events: options must be an object or undefined, got:', typeof options);
    event.sender.send('overlay-mouse-events-error', 'Invalid options parameter');
    return;
  }

  try {
    win.setIgnoreMouseEvents(ignore, options);
  } catch (error) {
    console.error('overlay-set-ignore-mouse-events: Failed to set ignore mouse events:', error);
    event.sender.send('overlay-mouse-events-error', error.message || String(error));
  }
});

// ============================================================
// APP LIFECYCLE
// ============================================================

app.whenReady().then(() => {
  // Verschlüsselter Store — Key aus safeStorage (OS-Keychain / Windows DPAPI).
  // Wenn die OS-Verschlüsselung nicht verfügbar ist (defektes Profil, exotische
  // Linux-Umgebung), würden Daten ungeschützt auf Platte liegen. Das ist
  // DSGVO-Art.-32-relevant, daher hier eine bewusst friktionierte
  // zweistufige Bestätigung — Tippfehler oder Klick-Reflexe sollen nicht
  // ausreichen, um sich für den unsicheren Pfad zu entscheiden.
  if (!safeStorage.isEncryptionAvailable()) {
    const firstChoice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Verschlüsselung nicht verfügbar',
      message: 'Kavoma Time kann Ihre Daten auf diesem System nicht verschlüsseln.',
      detail:
        'Die Betriebssystem-Verschlüsselung (Windows DPAPI / Schlüsselbund) ist derzeit nicht verfügbar.\n\n' +
        'Wenn Sie fortfahren, werden ALLE Zeiterfassungs-, Kunden- und Rechnungsdaten ' +
        'im Klartext im AppData-Ordner gespeichert. Wer Zugriff auf Ihr Benutzerverzeichnis hat, ' +
        'kann diese Daten lesen.\n\n' +
        'Empfehlung: App beenden und einen Administrator kontaktieren oder das Benutzerprofil reparieren.',
      buttons: ['App beenden (empfohlen)', 'Weiter zur zweiten Bestätigung'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (firstChoice === 0) {
      app.exit(0);
      return;
    }
    const secondChoice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Letzte Bestätigung — unverschlüsselt fortfahren?',
      message: 'Sind Sie sicher, dass Sie die App ohne Verschlüsselung starten möchten?',
      detail:
        'Diese Entscheidung kann nicht rückgängig gemacht werden, ohne die App neu zu installieren.\n\n' +
        'Nach dem Start wird ein dauerhafter Warnbanner im Hauptfenster angezeigt, ' +
        'solange Verschlüsselung deaktiviert ist.\n\n' +
        'Diese Wahl widerspricht dem Schutzniveau, das die DSGVO (Art. 32) für ' +
        'personenbezogene Daten erwartet. Eine Verarbeitung mit Echtdaten von Dritten ' +
        '(z. B. Kunden) wird ausdrücklich nicht empfohlen.',
      buttons: ['App beenden', 'Ich verstehe — unverschlüsselt starten'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (secondChoice === 0) {
      app.exit(0);
      return;
    }
  }

  const encryptionKey = getOrCreateEncryptionKey();
  currentEncryptionKey = encryptionKey;
  store = new Store({
    name: 'kavoma-time-data',
    ...(encryptionKey ? { encryptionKey } : {}),
  });
  currentTimerState = store.get('kavoma_time');

  initSyncEngine();

  setupApplicationMenu();

  // Im Dev-Modus läuft die App unter der Electron-Bundle-Identität und würde
  // sonst das Standard-Electron-Icon im Dock zeigen.
  if (IS_MAC && !app.isPackaged) {
    try { app.dock?.setIcon(WINDOW_ICON_PATH); } catch { /* nicht kritisch */ }
  }

  createMainWindow();
  createOverlayWindow();
  createTray();
  registerHotkeys();
  startAfkPauseWatcher();
  startEndOfDayReminder();
  configureAutoUpdater();
  scheduleAutoBackup();
  updateOverlayVisibility();
  setTimeout(() => checkForUpdates(false), 4_000);
  screen.on('display-added', () => positionOverlay());
  screen.on('display-removed', () => positionOverlay());
  screen.on('display-metrics-changed', () => positionOverlay());

  // JumpList Task für Windows (Rechtsklick Taskleiste)
  if (process.platform === 'win32') {
    app.setUserTasks([
      {
        program: process.execPath,
        arguments: '.',
        iconPath: process.execPath,
        iconIndex: 0,
        title: 'Kavoma Time öffnen',
        description: 'Öffnet die Zeiterfassung'
      }
    ]);
  }
});

app.on('window-all-closed', (event) => {
  // verhindere Quit — App bleibt im Tray (macOS: in der Menüleiste).
  // Beendet wird über das Tray-Menü, unter macOS zusätzlich über Cmd+Q.
  event.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  if (afkPauseTimer) clearInterval(afkPauseTimer);
  if (reminderTimer) clearInterval(reminderTimer);
  if (trayTicker) clearInterval(trayTicker);
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  else showMainWindow();
});
