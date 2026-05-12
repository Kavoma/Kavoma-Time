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

  setStartPauseShortcut: (accelerator) => ipcRenderer.invoke('set-start-pause-shortcut', accelerator),

  // Backup-Verschlüsselung
  encryptBackup: (plaintext) => ipcRenderer.invoke('backup-encrypt', plaintext),
  decryptBackup: (payload)   => ipcRenderer.invoke('backup-decrypt', payload),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
});
