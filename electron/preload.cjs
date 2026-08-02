const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveData: (key, data) => ipcRenderer.invoke('store-set', key, data),
  loadData: (key) => ipcRenderer.invoke('store-get', key),

  // Hotkey-Listener: registriert Callback und gibt cleanup-Funktion zurück
  onHotkeyToggle: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('hotkey-toggle', handler);
    return () => ipcRenderer.removeListener('hotkey-toggle', handler);
  },
  onStoreUpdated: (cb) => {
    const handler = (_event, key, data) => cb(key, data);
    ipcRenderer.on('store-updated', handler);
    return () => ipcRenderer.removeListener('store-updated', handler);
  },
  onTimerCommand: (cb) => {
    const handler = (_event, command, effectiveNow) => cb(command, effectiveNow);
    ipcRenderer.on('timer-command', handler);
    return () => ipcRenderer.removeListener('timer-command', handler);
  },
  sendTimerOverlayCommand: (command) => ipcRenderer.invoke('timer-overlay-command', command),
  getOverlayBounds: () => ipcRenderer.invoke('overlay-get-bounds'),
  setOverlayPosition: (position) => ipcRenderer.invoke('overlay-set-position', position),
  snapOverlayToNearestCorner: () => ipcRenderer.invoke('overlay-snap-nearest-corner'),
  getOverlayAnchor: () => ipcRenderer.invoke('overlay-get-anchor'),
  onOverlayAnchorChanged: (cb) => {
    const handler = (_event, anchor) => cb(anchor);
    ipcRenderer.on('overlay-anchor-changed', handler);
    return () => ipcRenderer.removeListener('overlay-anchor-changed', handler);
  },
  startOverlayDrag: (cursor) => ipcRenderer.invoke('overlay-start-drag', cursor),
  endOverlayDrag: () => ipcRenderer.invoke('overlay-end-drag'),
  showMainWindowFromOverlay: () => ipcRenderer.invoke('overlay-show-main-window'),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('overlay-set-ignore-mouse-events', ignore, options),

  setStartPauseShortcut: (accelerator) => ipcRenderer.invoke('set-start-pause-shortcut', accelerator),

  // Backup-Verschlüsselung
  encryptBackup: (plaintext) => ipcRenderer.invoke('backup-encrypt', plaintext),
  decryptBackup: (payload)   => ipcRenderer.invoke('backup-decrypt', payload),

  // Automatisches Backup
  autoBackupGetConfig: () => ipcRenderer.invoke('auto-backup-get-config'),
  autoBackupSetConfig: (patch) => ipcRenderer.invoke('auto-backup-set-config', patch),
  autoBackupChooseDirectory: () => ipcRenderer.invoke('auto-backup-choose-directory'),
  autoBackupRunNow: () => ipcRenderer.invoke('auto-backup-run-now'),
  autoBackupOpenDirectory: () => ipcRenderer.invoke('auto-backup-open-directory'),

  // DSGVO Art. 17 — Recht auf Löschung
  wipeAllData: () => ipcRenderer.invoke('wipe-all-data'),

  // Verschlüsselte PDF-Anhänge (Finanzen-Modul)
  attachmentWrite: (id, base64Plain) => ipcRenderer.invoke('attachment-write', { id, base64Plain }),
  attachmentRead: (id) => ipcRenderer.invoke('attachment-read', id),
  attachmentDelete: (id) => ipcRenderer.invoke('attachment-delete', id),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getEncryptionStatus: () => ipcRenderer.invoke('get-encryption-status'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installDownloadedUpdate: () => ipcRenderer.invoke('install-downloaded-update'),
  getAutoUpdateEnabled: () => ipcRenderer.invoke('get-auto-update-enabled'),
  setAutoUpdateEnabled: (enabled) => ipcRenderer.invoke('set-auto-update-enabled', enabled),
  getOnboardingCompleted: () => ipcRenderer.invoke('get-onboarding-completed'),
  setOnboardingCompleted: () => ipcRenderer.invoke('set-onboarding-completed'),
  onUpdateStatus: (cb) => {
    const handler = (_event, status) => cb(status);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});
