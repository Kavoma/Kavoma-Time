# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

**Kavoma Time** — Single-User Desktop-App (Electron + React 19 + Vite + TypeScript + Tailwind v4) für Zeiterfassung, Projekt-/Kundenverwaltung, Rechnungsstellung mit Mahnwesen, Finanzen (Eingangsrechnungen + Verträge mit verschlüsselten PDF-Anhängen) und DATEV-Export. UI ist durchgängig **Deutsch**; Code-Kommentare ebenfalls Deutsch. DSGVO-konform (lokale Speicherung, Wipe, Verschlüsselung).

Package-Manager: **pnpm** (Workspace via `pnpm-workspace.yaml`, Lockfile `pnpm-lock.yaml`).

## Commands

```bash
pnpm dev              # Vite dev server (Port 5173, strictPort)
pnpm electron:dev     # Vite + Electron parallel (Standard-Dev-Loop)
pnpm electron         # Electron gegen bereits laufenden Vite (oder gegen dist/)
pnpm build            # vite build → dist/
pnpm lint             # eslint . --report-unused-disable-directives
pnpm dist             # build + electron-builder NSIS (Windows-Installer in release/)
pnpm dist:portable    # build + Portable .exe
pnpm dist:publish     # build + publish auf GitHub Releases (braucht GH_TOKEN env)
pnpm version-set X.Y.Z  # bump package.json ohne Git-Tag
```

Es gibt **keine Tests / kein Test-Framework**. Type-Check läuft implizit via `tsc --noEmit` Settings in `tsconfig.json`, wird aber nicht durch ein Script aufgerufen — bei Bedarf `npx tsc --noEmit` manuell.

## Architektur — die Teile, die mehrere Dateien zusammen ergeben

### Zwei-Prozess-Modell (Electron)

- **`electron/main.cjs`** ist der Main-Prozess und der zentrale Punkt für: `electron-store` (verschlüsselt), AES-256-GCM Backup-Ver-/Entschlüsselung, verschlüsselte PDF-Anhänge (`userData/attachments/<id>.pdf.enc`, Format `IV(12)|AuthTag(16)|Ciphertext`), Tray, Global-Shortcut, AFK-Auto-Pause (via `powerMonitor.getSystemIdleTime`), Auto-Updater (`electron-updater` gegen GitHub Releases), Timer-Overlay-Fenster (Snap-to-Corner), Single-Instance-Lock, JumpList.
- **`electron/preload.cjs`** ist die **einzige** API-Surface zum Renderer. Alle neuen IPC-Kanäle müssen sowohl in `main.cjs` (`ipcMain.handle`) als auch in `preload.cjs` (`contextBridge.exposeInMainWorld('api', …)`) **und** in der `Window['api']`-Deklaration in `src/types/index.ts` ergänzt werden, sonst sind sie TS-seitig unsichtbar.
- **Renderer** läuft als React-App in zwei Modi: Hauptfenster oder Timer-Overlay. Welcher Modus aktiv ist, entscheidet `?overlay=timer` in der URL (`src/main.tsx`). Beide Modi teilen sich `AppStateProvider`, aber das Overlay **persistiert nicht** (siehe `isTimerOverlay`-Guard in `AppStateContext.tsx`).

### Single Source of Truth: `AppStateContext`

`src/state/AppStateContext.tsx` hält **den gesamten** Anwendungs-State (Entries, Customers, Projects, Invoices, Issuer, Attachments, VendorInvoices, Contracts, Timer-State, Settings) in einem einzigen `AppState`-Objekt unter dem Storage-Key `'kavoma_time'`.

- Persistenz: bei Existenz von `window.api` → `electron-store` (AES-verschlüsselt, Schlüssel via Windows DPAPI / `safeStorage`); sonst Fallback auf `localStorage` (Browser-Preview).
- **Migrationen leben ausschließlich in `migrateData()`**. Beim Hinzufügen neuer State-Felder dort einen Default + Migration ergänzen, sonst stürzt die App bei alten Backups ab.
- Cross-Window-Sync: `store-set` im Main broadcastet `store-updated` an alle anderen Fenster; `skipNextPersistRef` verhindert dabei Echo-Loops.
- Nach `restoreBackup()` wird `restoreNonce` inkrementiert; `App.tsx` hängt diesen Nonce an den View-Key, damit Komponenten mit lokalem State (Filter, Modals) re-mounten.
- Crash-Recovery: lief der Timer beim Schließen, wird die Zeit beim Laden in `elapsedBefore` gerettet (`migrateData` mit `recoverRunningTimer: true`).

### Timer-Command-Flow

Alle Timer-Aktionen (Tray-Menü, Global Hotkey `Ctrl+Shift+Space`, Overlay-Buttons, In-App-Buttons) gehen durch **denselben Pure-Function-Reducer** `runTimerCommand` in `src/utils/timerActions.ts`. Pfade:

- Hotkey/Tray → Main sendet `hotkey-toggle` / `timer-command` → Renderer-Handler in `AppStateContext.tsx` ruft `runTimerCommand`.
- Overlay-Button → `window.api.sendTimerOverlayCommand` → Main → `timer-command` IPC → Renderer.
- AFK / Lock / Suspend → Main schickt `pause` mit `effectiveNow` = Zeitpunkt des Idle-Beginns, damit die nachträgliche Pause korrekt rückdatiert wird.

Wenn neue Auslöser hinzukommen, **niemals** den Timer-State direkt manipulieren, sondern über `runTimerCommand` gehen.

### View-Routing

Statisches `switch` in `App.tsx` (`renderView`). Kein React Router. Sichtbare Views: `tracker | projects | customers | statistics | finance | settings`. `ExportView.tsx` existiert noch im Code, ist aber **nicht mehr gerouted** — die Export-Funktionalität ist in `FinanceView` aufgegangen. Strg+1…6 navigiert sequentiell durch die Views.

### Finanzen-Modul & Anhänge

`FinanceView` ist ein Tab-Container; die echten Tabs liegen unter `src/components/finance/`. PDFs (Eingangsrechnungen / Verträge) werden **nie** in den State serialisiert — nur `Attachment`-Metadaten (`id`, `sha256`, `sizeBytes`) liegen im Store, der Inhalt wird über `attachmentWrite/Read/Delete` IPC verschlüsselt auf Platte gehalten (`userData/attachments/`). `wipe-all-data` löscht dieses Verzeichnis mit.

### PDF-Generierung

`jspdf` + `jspdf-autotable` in `src/utils/invoicePdf.ts` und `dunningPdf.ts`. Rechnungen und Mahnungen werden client-seitig im Renderer erzeugt — der Issuer (Firmenstammdaten) kommt aus dem AppState.

## Konventionen

- **Sprache**: Identifier englisch (`startTimer`, `entries`), User-Facing-Strings + Kommentare deutsch. Niemals `ä/ö/ü/ß` durch ASCII-Ersatz ausschreiben.
- **Styling**: Tailwind v4 (via `@tailwindcss/vite`-Plugin, kein `tailwind.config.js` — Konfiguration in `src/style.css` als `@theme`). Eigene Design-Tokens: `bg-paper`, `bg-surface`, `border-divider`, `text-ink`, `text-muted`, `text-accent`, `font-display`.
- **Icons**: ausschließlich `lucide-react`.
- **State-Updates in Effects**: explizit erlaubt (`react-hooks/set-state-in-effect: off` in `eslint.config.js`) — wird für Form-Init in Modals genutzt.
- **`window.api`** ist optional (`?.`) — Code muss auch ohne Electron lauffähig sein (Browser-Preview via `pnpm dev` ohne `electron`).
- **Versions-Bump**: `pnpm version-set X.Y.Z` (kein Git-Tag). `dist:publish` veröffentlicht automatisch auf GitHub Releases (`Kavoma/Kavoma-Time`).

## userData-Layout (Windows)

`%APPDATA%/Kavoma/KavomaTime/` — bewusst nicht der Electron-Default. Enthält:

- `kavoma-time-data.json` — verschlüsselter electron-store
- `kavoma.key` — AES-Schlüssel, gewrappt mit DPAPI über `safeStorage`
- `attachments/<uuid>.pdf.enc` — verschlüsselte PDF-Belege

Wenn `safeStorage.isEncryptionAvailable()` false ist, zeigt die App beim Start eine bewusst friktionierte zweistufige Warn-Dialog-Kette und einen permanenten `EncryptionBanner`. Backup-/Anhang-Operationen werfen dann hart, statt Klartext zu schreiben — das ist gewollt und sollte nicht aufgeweicht werden.

## Branding & Docs

`branding/` enthält Markdown-Briefings (`APP_SUMMARY.md`, `DSGVO.md`, `FINANZEN.md`, `V2_IDEAS.md`, `Kavoma_Suite_Masterplan_Ultimate.md`) — gute Kontextquelle für fachliche Fragen. **Hinweis**: `branding/Token.md` enthält einen GitHub-PAT im Klartext und ist nicht via `.gitignore` geschützt — beim Anfassen dieser Datei vorsichtig sein.
