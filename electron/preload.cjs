// ACHTUNG: Preload-Skripte laufen im Sandbox (seit Electron 20 die Voreinstellung,
// solange `nodeIntegration` aus ist). Dort ist `require` auf wenige eingebaute
// Module beschränkt — 'electron' geht, eine eigene Datei nicht. Ein `require`
// auf `./irgendwas.cjs` wirft, und weil das ganze Skript daran stirbt, wird
// `window.api` nie gesetzt: Die App verhält sich dann wie im Browser, ohne
// Fehlermeldung. Alles, was aus dem Main-Prozess kommen muss, geht über IPC.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Plattform, damit der Renderer die Titelleiste korrekt layouten kann
  // (macOS-Ampel links vs. Windows-Fenstersteuerung rechts).
  platform: process.platform,
  /** Ob dieses System das schwebende Timer-Overlay anbietet (macOS: nein). */
  overlaySupported: process.platform !== 'darwin',


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
  onNavigateToView: (cb) => {
    const handler = (_event, view) => cb(view);
    ipcRenderer.on('navigate-to-view', handler);
    return () => ipcRenderer.removeListener('navigate-to-view', handler);
  },
  onTimerQuickStart: (cb) => {
    const handler = (_event, target) => cb(target);
    ipcRenderer.on('timer-quick-start', handler);
    return () => ipcRenderer.removeListener('timer-quick-start', handler);
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

  // Erkannte Abwesenheit — der Renderer fragt nach, was mit der Zeit passieren soll
  onAfkPauseDetected: (cb) => {
    const handler = (_event, pause) => cb(pause);
    ipcRenderer.on('afk-pause-detected', handler);
    return () => ipcRenderer.removeListener('afk-pause-detected', handler);
  },
  getPendingAfkPause: () => ipcRenderer.invoke('afk-pause-get-pending'),
  resolveAfkPause: () => ipcRenderer.invoke('afk-pause-resolve'),

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
  attachmentHas: (id) => ipcRenderer.invoke('attachment-has', id),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getEncryptionStatus: () => ipcRenderer.invoke('get-encryption-status'),

  // Gerätesynchronisation
  syncGetDeviceInfo: () => ipcRenderer.invoke('sync-get-device-info'),

  // Gerätesynchronisation — Konto, Schlüssel, Abgleich
  /** Serverstandort für die Datenschutzerklärung. Über IPC statt `require`,
   *  siehe Hinweis oben. */
  syncGetRegion: () => ipcRenderer.invoke('sync-get-region'),
  syncGetStatus: () => ipcRenderer.invoke('sync-get-status'),
  syncSignIn: (email, password) => ipcRenderer.invoke('sync-sign-in', email, password),
  syncSignOut: () => ipcRenderer.invoke('sync-sign-out'),
  syncHasKeys: () => ipcRenderer.invoke('sync-has-keys'),
  syncSetupPassphrase: (passphrase) => ipcRenderer.invoke('sync-setup-passphrase', passphrase),
  syncInitializeKey: () => ipcRenderer.invoke('sync-initialize-key'),
  syncStartLink: () => ipcRenderer.invoke('sync-start-link'),
  syncCancelLink: () => ipcRenderer.invoke('sync-cancel-link'),
  syncListLinks: () => ipcRenderer.invoke('sync-list-links'),
  syncRespondLink: (id) => ipcRenderer.invoke('sync-respond-link', id),
  syncApproveLink: (id, code) => ipcRenderer.invoke('sync-approve-link', id, code),
  syncRejectLink: (id) => ipcRenderer.invoke('sync-reject-link', id),
  onSyncLinkRequest: (cb) => {
    const handler = (_e, anfrage) => cb(anfrage);
    ipcRenderer.on('sync-link-request', handler);
    return () => ipcRenderer.removeListener('sync-link-request', handler);
  },
  onSyncLinkCode: (cb) => {
    const handler = (_e, daten) => cb(daten);
    ipcRenderer.on('sync-link-code', handler);
    return () => ipcRenderer.removeListener('sync-link-code', handler);
  },
  onSyncLinkDone: (cb) => {
    const handler = (_e, daten) => cb(daten);
    ipcRenderer.on('sync-link-done', handler);
    return () => ipcRenderer.removeListener('sync-link-done', handler);
  },
  syncUnlock: (secret) => ipcRenderer.invoke('sync-unlock', secret),
  syncStart: () => ipcRenderer.invoke('sync-start'),
  syncEnqueue: (ops) => ipcRenderer.invoke('sync-enqueue', ops),
  syncNow: () => ipcRenderer.invoke('sync-now'),
  syncFetchAll: () => ipcRenderer.invoke('sync-fetch-all'),
  syncAcceptCursor: (seq) => ipcRenderer.invoke('sync-accept-cursor', seq),
  syncListDevices: () => ipcRenderer.invoke('sync-list-devices'),
  syncRevokeDevice: (id) => ipcRenderer.invoke('sync-revoke-device', id),
  onSyncOps: (cb) => {
    const handler = (_event, ops) => cb(ops);
    ipcRenderer.on('sync-ops', handler);
    return () => ipcRenderer.removeListener('sync-ops', handler);
  },
  onSyncStatus: (cb) => {
    const handler = (_event, status) => cb(status);
    ipcRenderer.on('sync-status', handler);
    return () => ipcRenderer.removeListener('sync-status', handler);
  },
  syncAllocateNumber: (kind, year) => ipcRenderer.invoke('sync-allocate-number', kind, year),
  syncReserveStatus: (kind, year) => ipcRenderer.invoke('sync-reserve-status', kind, year),
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
