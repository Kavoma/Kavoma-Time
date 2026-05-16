// ============================================================
// Electron Main-Process
// ============================================================

const { app, BrowserWindow, dialog, nativeTheme, ipcMain, Tray, Menu, globalShortcut, nativeImage, safeStorage, screen, powerMonitor } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const crypto = require('node:crypto');
const Store = require('electron-store').default || require('electron-store');
const { autoUpdater } = require('electron-updater');

// === APP IDENTIFICATION & PATHS ===
app.name = 'Kavoma Time';
if (process.platform === 'win32') {
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
  }

  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id === event.sender.id) return;
    win.webContents.send('store-updated', key, data);
  });
});

// === Backup-Verschlüsselung (AES-256-GCM mit dem App-Schlüssel) ===
ipcMain.handle('backup-encrypt', (_event, plaintext) => {
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
});

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

ipcMain.handle('get-app-info', () => {
  const release = require('os').release();
  const major = parseInt(release.split('.')[0]);
  const build = parseInt(release.split('.')[2]);
  
  let osName = `Windows ${release}`;
  if (major === 10) {
    if (build >= 22000) osName = `Windows 11 (${build})`;
    else osName = `Windows 10 (${build})`;
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
    const filesToRemove = ['kavoma.key', 'kavoma-time-data.json'];
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

ipcMain.handle('attachment-write', async (_event, { id, base64Plain }) => {
  if (!currentEncryptionKey) {
    throw new Error('Verschlüsselung nicht verfügbar — Anhang wurde abgebrochen.');
  }
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Ungültige Anhang-ID.');
  }
  fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
  const plaintext = Buffer.from(base64Plain, 'base64');
  const iv  = crypto.randomBytes(12);
  const key = Buffer.from(currentEncryptionKey, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, enc]);
  fs.writeFileSync(path.join(ATTACHMENT_DIR, `${id}.pdf.enc`), blob);
  return { sizeBytes: plaintext.length };
});

ipcMain.handle('attachment-read', async (_event, id) => {
  if (!currentEncryptionKey) {
    throw new Error('Verschlüsselung nicht verfügbar — Anhang kann nicht gelesen werden.');
  }
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Ungültige Anhang-ID.');
  }
  const file = path.join(ATTACHMENT_DIR, `${id}.pdf.enc`);
  if (!fs.existsSync(file)) throw new Error('Anhang nicht gefunden.');
  const blob = fs.readFileSync(file);
  // Format: IV(12) | AuthTag(16) | Ciphertext(≥0). Mindestlänge 28.
  if (blob.length < 28) {
    throw new Error('Anhang-Datei beschädigt: zu kurz für IV+AuthTag.');
  }
  const iv  = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  const key = Buffer.from(currentEncryptionKey, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('base64');
});

ipcMain.handle('attachment-delete', async (_event, id) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Ungültige Anhang-ID.');
  }
  const file = path.join(ATTACHMENT_DIR, `${id}.pdf.enc`);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  return true;
});

nativeTheme.themeSource = 'dark';
Menu.setApplicationMenu(null); // Entfernt das Standard-Electron-Menu komplett

const DEV_URL = 'http://localhost:5173';
const TRAY_ICON_PATH = path.join(__dirname, 'tray-icon.png');
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

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1100,
    minHeight: 750,
    title: 'Kavoma Time',
    icon: WINDOW_ICON_PATH,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#ffffff',
      height: 40
    },
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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

function getAfkTimeoutSeconds(data) {
  const minutes = Number(data?.afkTimeoutMinutes);
  const safeMinutes = Number.isFinite(minutes) ? Math.min(240, Math.max(1, minutes)) : 10;
  return Math.round(safeMinutes * 60);
}

function checkAfkPause() {
  if (!currentTimerState?.isRunning || !currentTimerState.startedAt) return;
  if (!isAfkPauseEnabled(currentTimerState)) return;

  const idleSeconds = powerMonitor.getSystemIdleTime();
  const timeoutSeconds = getAfkTimeoutSeconds(currentTimerState);
  if (idleSeconds < timeoutSeconds) return;

  const effectivePauseAt = Date.now() - idleSeconds * 1000;
  mainWindow?.webContents.send('timer-command', 'pause', effectivePauseAt);
}

function pauseRunningTimerAt(timestamp) {
  if (!currentTimerState?.isRunning || !currentTimerState.startedAt) return;
  mainWindow?.webContents.send('timer-command', 'pause', timestamp);
}

function startAfkPauseWatcher() {
  if (afkPauseTimer) clearInterval(afkPauseTimer);
  afkPauseTimer = setInterval(checkAfkPause, 10_000);
  powerMonitor.on('suspend', () => pauseRunningTimerAt(Date.now()));
  powerMonitor.on('lock-screen', () => pauseRunningTimerAt(Date.now()));
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
      message: 'Update-Pruefung fehlgeschlagen.',
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
    publishUpdateStatus({
      state: 'error',
      message: 'Update-Pruefung fehlgeschlagen.',
      progress: null,
      error: error?.message || String(error),
    });
    return null;
  });
}

// ============================================================
// TRAY
// ============================================================

function createTray() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip('Kavoma Time');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Öffnen', click: showMainWindow },
    { type: 'separator' },
    { label: 'Start / Pause', accelerator: 'CmdOrCtrl+Shift+Space', click: () => mainWindow?.webContents.send('hotkey-toggle') },
    { type: 'separator' },
    { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', showMainWindow);
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

  createMainWindow();
  createOverlayWindow();
  createTray();
  registerHotkeys();
  startAfkPauseWatcher();
  configureAutoUpdater();
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
  // verhindere Quit — App bleibt im Tray
  event.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  if (afkPauseTimer) clearInterval(afkPauseTimer);
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  else showMainWindow();
});
