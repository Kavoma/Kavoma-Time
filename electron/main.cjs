// ============================================================
// Electron Main-Process
// ============================================================

const { app, BrowserWindow, nativeTheme, ipcMain, Tray, Menu, globalShortcut, nativeImage, safeStorage } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const crypto = require('node:crypto');
const Store = require('electron-store').default || require('electron-store');

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
  const keyFile = path.join(app.getPath('userData'), 'kavoma.key');
  try {
    if (fs.existsSync(keyFile) && safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(keyFile);
      return safeStorage.decryptString(encrypted);
    }
  } catch (e) {
    console.warn('Konnte Schlüssel nicht entschlüsseln, generiere neu:', e.message);
  }
  // Neuen Schlüssel erzeugen
  const key = crypto.randomBytes(32).toString('hex');
  try {
    if (safeStorage.isEncryptionAvailable()) {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      const encrypted = safeStorage.encryptString(key);
      fs.writeFileSync(keyFile, encrypted);
    }
  } catch (e) {
    console.warn('Konnte Schlüssel nicht speichern (Daten werden unverschlüsselt gespeichert):', e.message);
    return undefined;
  }
  return key;
}

// Store wird erst nach app.whenReady() initialisiert, damit safeStorage verfügbar ist
let store = null;
let currentEncryptionKey = null;

ipcMain.handle('store-get', (_event, key) => store?.get(key));
ipcMain.handle('store-set', (_event, key, data) => store?.set(key, data));

// === Backup-Verschlüsselung (AES-256-GCM mit dem App-Schlüssel) ===
ipcMain.handle('backup-encrypt', (_event, plaintext) => {
  if (!currentEncryptionKey) return { encrypted: false, data: plaintext };
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

nativeTheme.themeSource = 'dark';
Menu.setApplicationMenu(null); // Entfernt das Standard-Electron-Menu komplett

const DEV_URL = 'http://localhost:5173';
const TRAY_ICON_PATH = path.join(__dirname, 'tray-icon.png');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ============================================================
// MAIN WINDOW
// ============================================================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'Kavoma Time',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

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
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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

// ============================================================
// APP LIFECYCLE
// ============================================================

app.whenReady().then(() => {
  // Verschlüsselter Store — Key aus safeStorage
  const encryptionKey = getOrCreateEncryptionKey();
  currentEncryptionKey = encryptionKey;
  store = new Store({
    name: 'kavoma-time-data',
    ...(encryptionKey ? { encryptionKey } : {}),
  });

  createMainWindow();
  createTray();
  registerHotkeys();

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
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  else showMainWindow();
});
