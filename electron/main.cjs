// ============================================================
// Electron Main-Process
// ============================================================

const { app, BrowserWindow, nativeTheme, ipcMain, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('node:path');
const Store = require('electron-store').default || require('electron-store');

const store = new Store({ name: 'kavoma-time-data' });

ipcMain.handle('store-get', (_event, key) => store.get(key));
ipcMain.handle('store-set', (_event, key, data) => store.set(key, data));

nativeTheme.themeSource = 'dark';

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
  const saved = store.get('kavoma_time');
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
  createMainWindow();
  createTray();
  registerHotkeys();
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
