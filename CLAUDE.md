# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

**Kavoma Time** — Single-User Desktop-App (Electron + React 19 + Vite + TypeScript + Tailwind v4) für Zeiterfassung, Projekt-/Kundenverwaltung, Rechnungsstellung mit Mahnwesen, Finanzen (Eingangsrechnungen + Verträge mit verschlüsselten PDF-Anhängen, Auswertung) und optionaler, Ende-zu-Ende verschlüsselter Geräte-Synchronisierung. **Einen DATEV-Export gibt es nicht** — es existieren ein CSV-Export der Eingangsrechnungen, die verschlüsselte `.kvbak`-Sicherung und ein Klartext-JSON-Export. Debitorennummern werden DATEV-tauglich vergeben, das ist aber Vorbereitung und keine Schnittstelle. UI ist durchgängig **Deutsch**; Code-Kommentare ebenfalls Deutsch. DSGVO-konform (lokale Speicherung, Wipe, Verschlüsselung).

Package-Manager: **pnpm** (Workspace via `pnpm-workspace.yaml`, Lockfile `pnpm-lock.yaml`).

## Commands

```bash
pnpm test             # vitest — Sync-Logik (Merge, Krypto, Nummern)
pnpm typecheck        # tsc --noEmit
pnpm dev              # Vite dev server (Port 5173, strictPort)
pnpm electron:dev     # Vite + Electron parallel (Standard-Dev-Loop)
pnpm electron         # Electron gegen bereits laufenden Vite (oder gegen dist/)
pnpm build            # vite build → dist/
pnpm lint             # eslint . --report-unused-disable-directives
pnpm dist             # build + electron-builder für das aktuelle Betriebssystem
pnpm dist:mac         # build + DMG & ZIP (arm64 + x64), ad-hoc signiert
pnpm dist:mac:signed  # wie dist:mac, aber mit vorhandener Developer-ID-Signatur
pnpm dist:win         # build + NSIS-Installer und Portable .exe (x64)
pnpm dist:portable    # build + nur Portable .exe (x64)
pnpm dist:publish     # Windows-Build + publish auf GitHub Releases (braucht GH_TOKEN env)
pnpm dist:publish:mac # macOS-Build + publish auf GitHub Releases
pnpm version-set X.Y.Z  # bump package.json ohne Git-Tag
pnpm release-tag      # Tag vX.Y.Z anlegen und pushen — VOR jedem publish
```

**Reihenfolge beim Veröffentlichen:** `version-set` → committen → `release-tag`
→ `dist:publish`. Der Tag muss **vorher** existieren.

Ohne ihn legt electron-builder das GitHub-Release selbst an und erzeugt den Tag
als Nebenwirkung. Das geht schief, sobald mehrere Artefakte gleichzeitig
hochgeladen werden: Jedes startet einen eigenen Publisher, alle sehen „Release
existiert nicht", alle wollen es anlegen. Einer gewinnt, die übrigen bekommen
`422 — Published releases must have a valid tag`, und mit ihnen stirbt ihr
Upload. Beim 1.1.2-Release blieb so nur die `.blockmap` übrig, der Installer
fehlte. Das Release sah fertig aus und war leer.

**Der Tag allein genügt nicht.** Beim 1.1.4-Release existierte `v1.1.4` vorher,
trotzdem meldeten zwei Publisher gleichzeitig „release doesn't exist" und legten
es beide an — von den macOS-Artefakten überlebte nur eine `.blockmap`. Fehlt ein
**GitHub-Release** zum Tag, läuft der Wettlauf trotzdem. Deshalb nach jedem
`dist:publish` prüfen:

```bash
gh release view v1.1.4 --json assets --jq '.assets[].name'
```

Erwartet werden zwölf Dateien (mac arm64/x64 je dmg+zip+blockmaps, NSIS-exe +
blockmap, `latest.yml`, `latest-mac.yml`). Fehlendes liegt noch in `release/`
und lässt sich mit `gh release upload <tag> <datei> --clobber` nachreichen —
`latest-mac.yml` nicht vergessen, ohne sie sieht der Updater unter macOS nichts.

**Beide Zielsysteme lassen sich von macOS aus bauen** — electron-builder bringt für
NSIS eigene native Binaries mit, Wine wird nicht gebraucht. Umgekehrt geht es nicht:
macOS-Builds brauchen einen Mac (`codesign`, `hdiutil`).

Die `--x64`-Flags in den Windows-Skripten sind Absicht: sobald ein Target auf der
CLI steht (`--win nsis`), ersetzt es die `arch`-Liste aus der Config und
electron-builder fällt auf die Architektur des Build-Rechners zurück — auf einem
Apple-Silicon-Mac käme sonst ein Windows-ARM64-Installer heraus.

**pnpm-Install**: `pnpm-workspace.yaml` muss `electron` unter `allowBuilds`
führen. Seit pnpm 10/11 sind Install-Skripte standardmäßig blockiert, und Electron
lädt seine ~250 MB Binary genau im `postinstall` herunter — fehlt der Eintrag,
bleibt `node_modules/…/electron/dist` leer und nichts startet. Der frühere
`pnpm`-Block in der `package.json` wird von pnpm 11 nicht mehr gelesen.

Tests gibt es **nur für die Synchronisierung** (`pnpm test`, vitest): Merge,
Krypto, Nummernvergabe, Motor. Der Rest der App ist ungetestet — das ist eine
bewusste Grenze, keine Lücke, die nebenbei geschlossen werden sollte.

`pnpm typecheck` läuft `tsc --noEmit`. Achtung: Ohne `"ignoreDeprecations": "6.0"`
in der `tsconfig.json` bricht TypeScript 6 mit TS5107 ab, **bevor** es eine
einzige Datei prüft — der Typecheck meldet dann fälschlich Erfolg. **Baseline ist
null Fehler.** Wer das prüft, sollte den Erfolg gegenprobieren: eine Datei mit
einem absichtlichen Typfehler anlegen und sehen, dass er gemeldet wird. Genau so
fiel auf, dass die früher hier genannten „drei vorbestehenden Fehler" in
`attachments.ts` und `invoicePdf.ts` längst behoben waren.

`pnpm lint` meldet 100 vorbestehende Warnungen (`any`, `exhaustive-deps`) und
null Fehler. Neue Warnungen sind ein Signal, keine Normalität.

## Architektur — die Teile, die mehrere Dateien zusammen ergeben

### Zwei-Prozess-Modell (Electron)

- **`electron/main.cjs`** ist der Main-Prozess und der zentrale Punkt für: `electron-store` (verschlüsselt), AES-256-GCM Backup-Ver-/Entschlüsselung, verschlüsselte PDF-Anhänge (`userData/attachments/<id>.pdf.enc`, Format `IV(12)|AuthTag(16)|Ciphertext`), Tray, Global-Shortcut, AFK-Auto-Pause (via `powerMonitor.getSystemIdleTime`), Auto-Updater (`electron-updater` gegen GitHub Releases), Timer-Overlay-Fenster (Snap-to-Corner), Single-Instance-Lock, JumpList.
- **`electron/preload.cjs`** läuft im **Sandbox** — seit Electron 20 die
  Voreinstellung, solange `nodeIntegration` aus ist (die `webPreferences` der App
  setzen `sandbox` nicht, also gilt der Default). Dort kennt `require` nur
  `electron`, `events`, `timers` und `url`. **Ein `require('./irgendwas.cjs')`
  wirft** — und weil das ganze Skript daran stirbt, läuft
  `contextBridge.exposeInMainWorld` nie. Das Ergebnis ist heimtückisch:
  `window.api` bleibt undefiniert, die App fällt still auf ihre Browser-Pfade
  zurück (leerer Datenstand bei jedem Start, Onboarding immer wieder, keine
  Backups, keine Synchronisierung) — ohne eine einzige Fehlermeldung im
  Terminal. Alles aus dem Main-Prozess geht über IPC, nie über `require`.
  `electron/preload.test.mjs` prüft das.
- **`electron/preload.cjs`** ist die **einzige** API-Surface zum Renderer. Alle neuen IPC-Kanäle müssen sowohl in `main.cjs` (`ipcMain.handle`) als auch in `preload.cjs` (`contextBridge.exposeInMainWorld('api', …)`) **und** in der `Window['api']`-Deklaration in `src/types/index.ts` ergänzt werden, sonst sind sie TS-seitig unsichtbar.
- **Renderer** läuft als React-App in zwei Modi: Hauptfenster oder Timer-Overlay. Welcher Modus aktiv ist, entscheidet `?overlay=timer` in der URL (`src/main.tsx`). Beide Modi teilen sich `AppStateProvider`, aber das Overlay **persistiert nicht** (siehe `isTimerOverlay`-Guard in `AppStateContext.tsx`). Unter macOS wird der Overlay-Modus nie geladen — siehe `OVERLAY_SUPPORTED`.

### Plattform-Unterschiede Windows / macOS

`main.cjs` setzt oben `IS_MAC` / `IS_WIN`; alles Plattformabhängige hängt an diesen Flags:

- **Application-Menu**: Unter Windows/Linux `Menu.setApplicationMenu(null)` — die App hat eine eigene Titelleiste. Unter macOS **niemals** `null` setzen: dort hängt an der System-Menüleiste die komplette Standard-Tastatursteuerung (Cmd+C/V/X/A/Z/Q/W). `setupApplicationMenu()` baut deshalb ein rollenbasiertes Menü.
- **Titelleiste**: `titleBarStyle: 'hidden'` auf beiden. Windows/Linux bekommen zusätzlich `titleBarOverlay` (dort rechts), macOS stattdessen `trafficLightPosition` (dort links). `TitleBar.tsx` liest `window.api.platform` und lässt auf der jeweils belegten Seite Platz frei.
- **Tray**: macOS braucht ein Template-Image (`electron/trayTemplate.png` + `@2x`, schwarze Silhouette mit Alpha) plus `icon.setTemplateImage(true)`; das System färbt es selbst für Hell/Dunkel ein. Windows nutzt das farbige `electron/tray-icon.png`. Unter macOS reagiert der Tray bereits auf das gesetzte Context-Menu — ein zusätzlicher `click`-Handler würde das Fenster ungewollt mit öffnen.
- **Timer-Overlay**: `OVERLAY_SUPPORTED` ist unter macOS `false` — das Fenster wird gar nicht erst angelegt und der Schalter in den Einstellungen ausgeblendet (`window.api.overlaySupported`). Grund: Die laufende Zeit steht dort ohnehin in der Menüleiste, und ein Fenster, das sich über alles legt, ist auf einem einzelnen Bildschirm eher im Weg. Unter Windows bleibt es — dort gibt es keine Menüleisten-Uhr.
- **Trackpad-Geste** (nur macOS): Zwei-Finger-Wischen nach rechts auf einer Eintragszeile löscht (`SwipeRow`). Das funktioniert mit den Werkseinstellungen, weil zwei Finger waagerecht als normales `wheel`-Ereignis mit `deltaX` ankommen.

  **Kein Ansichtswechsel per Geste mehr.** Electrons `swipe`-Ereignis feuert unter macOS nur, wenn im System „Zwischen Seiten blättern" auf *drei* Finger steht — voreingestellt sind dort zwei, und drei Finger gehören Mission Control. Die Funktion war damit entweder tot oder erkaufte sich Mission Control ab. Auf zwei Finger auszuweichen ginge nicht: Diese Geste löscht bereits eine Zeile und schlüge sich mit waagerechtem Scrollen in Tabellen. `Cmd+1…6` erledigt es schneller.
- **JumpList / `setAppUserModelId`**: nur Windows.
- **Auto-Updater**: Unter macOS verweigert `electron-updater` das Update ohne gültige Developer-ID-Signatur. `checkForUpdates()` fängt das ab und meldet es als verständlichen Hinweis statt als Fehler.

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
- Herunterfahren / Abmelden → Main schickt `stop` und verzögert `app.quit()` um 1,5 s, damit der Renderer den Eintrag noch schreiben kann (nur wenn `stopOnShutdownEnabled`).
- Schnellstart im Tray-Menü → Main sendet `timer-quick-start` mit `{customerId, projectId, description}` → Renderer ruft `startTimerWith`. Das schließt einen laufenden Eintrag zuerst ab, sonst landete dessen Zeit unter der neu gewählten Tätigkeit.

Wenn neue Auslöser hinzukommen, **niemals** den Timer-State direkt manipulieren, sondern über `runTimerCommand` bzw. `startTimerWith` gehen.

### Pausenerkennung

Der Main-Prozess pausiert **nicht** selbst. Er erkennt die Abwesenheit und legt sie dem Renderer als Frage vor — ob die Zeit abgezogen wird, weiß nur der Mensch davor. Stiller Abzug verliert Arbeitszeit, stilles Behalten erfindet welche.

- `checkAfkPause()` läuft alle 10 s über `powerMonitor.getSystemIdleTime()`. Überschreitet die Untätigkeit die Schwelle, wird ihr Beginn in `afkIdleSince` gemerkt (geklemmt auf `sessionStartedAt` — eine Pause vor dem Eintrag gehört nicht zu ihm). Fällt sie unter `AFK_BACK_AT_DESK_SECONDS`, ist jemand zurück.
- `suspend`/`lock-screen` merken nur `afkAwaySince`; entschieden wird bei `resume`/`unlock-screen`, weil vorher niemand antworten kann.
- `proposeAfkPause()` verwirft alles, was kürzer als die Schwelle ist oder vor dem Eintragsstart begann, und lässt immer nur **eine** offene Frage zu (`pendingAfkPause`).
- Der Renderer holt beim Start `afk-pause-get-pending` nach — eine Pause kann erkannt worden sein, bevor er zuhören konnte — und meldet die Antwort über `afk-pause-resolve` zurück.
- `applyPause()` in `timerActions.ts` beendet den Eintrag beim Pausenbeginn und startet bei `continueRunning` einen zweiten ab der Rückkehr, mit denselben Angaben.

### Tray-Menü

`buildTrayMenu()` in `main.cjs` wird bei **jedem** `store-set` neu gebaut, plus im Sekundentakt (`trayTicker`), solange der Timer läuft. Inhalt:

- Kopfzeile mit laufender Tätigkeit und Zeit, Start/Pause, „Stoppen und sichern".
- **Schnellstarts** (`computeQuickStarts`): die drei häufigsten Kombinationen aus Kunde, Projekt und Tätigkeit der letzten 120 abgeschlossenen Einträge. Was nur einmal vorkam, fällt raus — dann greift „Nochmal: …" auf den letzten Eintrag zurück. Nur sichtbar, solange nichts läuft.
- Unter macOS zeigt `tray.setTitle()` die laufende Zeit direkt in der Menüleiste (`formatMenuClock`: unter einer Stunde `m:ss`, danach `h:mm`). Windows kennt keinen Tray-Titel und bekommt sie im Tooltip.

`sendQuickStart()` holt das Fenster bewusst **nicht** nach vorne — der Sinn ist, aus der Menüleiste heraus zu starten, ohne die App zu öffnen. Ein verstecktes Fenster nimmt die IPC-Nachricht genauso entgegen.

### Trackpad-Geste (macOS)

`SwipeRow` ersetzt das `<li>` der Eintragsliste. Das Trackpad liefert die Geste als `wheel`-Ereignis mit `deltaX`; React hängt `onWheel` **passiv** ein, dort ließe sich das Scrollen nicht unterdrücken — deshalb ein eigener Listener mit `passive: false` über eine Ref.

- Nur waagerechte Gesten werden abgefangen (`isHorizontalSwipe`), senkrechtes Scrollen gehört weiter der Liste.
- Mit macOS-Standardeinstellung („natürliches Scrollen") liefert ein Wisch nach rechts ein **negatives** `deltaX`.
- Das Ende der Geste wird über eine Pause von 140 ms ohne weitere Ereignisse erkannt — das Trackpad meldet kein Loslassen.
- Absichtlich **nur macOS**: Unter Windows liefert auch das Kipprad einer Maus horizontales `deltaX`, dort wäre der Fehlgriff zu leicht.
- Keine Rückfrage vor dem Löschen — der Fehlgriff wird über `UndoToast` aufgefangen, nicht über einen Dialog, der jedes Mal im Weg steht.

### Schutz vor vergessenen Timern

Drei unabhängige Netze, alle abschaltbar:

- **Feierabend-Erinnerung** (`checkEndOfDayReminder`, Minutentakt im Main): eine `Notification` pro Tag, sobald die eingestellte Uhrzeit vorbei ist und noch etwas läuft. `reminderSentOn` verhindert Wiederholungen. Bewusst opt-in.
- **Langläufer-Warnung** (`LONG_RUN_THRESHOLD_SECONDS` in `App.tsx`): ab 12 h Laufzeit eine Rückfrage — beim Fokussieren des Fensters und alle 5 Minuten. Pro `sessionStartedAt` nur einmal (`dismissedLongRunRef`).
- **Stopp beim Herunterfahren**: `powerMonitor.on('shutdown')`, siehe Timer-Command-Flow.

### View-Routing

Statisches `switch` in `App.tsx` (`renderView`). Kein React Router. Sichtbare Views: `tracker | projects | customers | statistics | finance | settings`. `ExportView.tsx` existiert noch im Code, ist aber **nicht mehr gerouted** — die Export-Funktionalität ist in `FinanceView` aufgegangen. `Strg`/`Cmd`+1…6 springt **direkt** zur jeweiligen Ansicht (nicht sequentiell); die Reihenfolge steht in `VIEW_ORDER`.

### Gerätesynchronisation (Issue #31)

Ende-zu-Ende verschlüsselter Abgleich über Supabase. **Standardmäßig aus** — ohne
Einrichtung verhält sich die App wie zuvor.

**Die wichtigste Regel: niemals Ops von Hand schreiben.** Das Änderungsprotokoll
entsteht in `src/sync/diff.ts`, aufgerufen im Persist-Effekt von
`AppStateContext`. Wer eine neue Mutation einbaut, muss nichts tun — der Diff
findet sie. Wer anfängt, Ops manuell zu erzeugen, baut die Fehlerquelle wieder
ein, die dieser Aufbau vermeidet.

- **Was synchronisiert wird**, steht ausschließlich in `src/sync/classify.ts`.
  Laufender Timer, Overlay-Schalter, Tastenkürzel, AFK- und Erinnerungs-
  Einstellungen sind bewusst gerätelokal.
- **`setState` stempelt.** Der Provider umhüllt den Setter, damit
  `syncVersions` und `syncLamport` im selben Update entstehen wie die Änderung.
  Ladevorgänge, Backup-Restore und Fenster-zu-Fenster-Sync gehen über
  `setStateRaw` — sie sind keine Änderungen und dürfen nichts stempeln.
- **Echo-Falle:** Fremde Ops werden über `applyOps` eingespielt, und
  `prevSyncedRef` wird **vor** dem Setzen nachgezogen. Sonst meldet der nächste
  Diff die fremde Änderung als eigene zurück.
- **Kein Passphrase.** Das erste Gerät erzeugt den Datenschlüssel
  (`initializeKey`), weitere bekommen ihn über einen X25519-Austausch, den eine
  sechsstellige Zahl gegen einen Zwischenmann absichert
  (`electron/sync/linking.cjs`). Die Zahl ist **kein Geheimnis**, sondern ein
  Fingerabdruck: Sie wird aus dem gemeinsamen Geheimnis und beiden öffentlichen
  Schlüsseln abgeleitet, weicht bei einem Zwischenmann auf beiden Seiten
  voneinander ab und wird deshalb **eingetippt statt angezeigt** — stünde sie
  auf beiden Bildschirmen, ließe sie sich blind abnicken.
  `unlock()` mit dem Wiederherstellungscode bleibt der Weg, wenn kein zweites
  Gerät zur Hand ist; bestehende Passphrase-Umschläge funktionieren weiter.
- **Krypto und Transport liegen im Main-Prozess** (`electron/sync/`), der
  Datenschlüssel verlässt ihn nie. Zusammengeführt wird im Renderer — als reine,
  testbare Funktion.
- **Rechnungsnummern** entstehen erst beim Finalisieren, nie beim Anlegen eines
  Entwurfs. Ist Sync an und der Server nicht erreichbar, wird die Vergabe
  **verweigert** statt auf den lokalen Zähler zurückzufallen — das wäre genau
  die Dublette, die zu vermeiden ist. Einen Offline-Vorrat gibt es bewusst
  nicht mehr; er zog nach jeder Vergabe still zehn weitere Nummern und riss
  damit Löcher in den Nummernkreis.
- **Die Untergrenze ist der Kern der Vergabe.** `invoiceFloor`/`debtorFloor` in
  `src/sync/numbers.ts` errechnen aus dem *tatsächlichen* Bestand, welche Nummer
  noch frei sein muss; `allocate_number` hebt den Server-Zähler darauf an und
  kann ihn nie senken. Ohne diesen Wert begann der Server bei 1 und vergab die
  001 ein zweites Mal — der Fehler vom 1. September 2026. Wer eine neue
  Vergabestelle einbaut, muss die Untergrenze mitgeben.
  Debitorennummern laufen **ohne** Jahresbindung (`DEBTOR_YEAR = 0`), weil eine
  Debitorennummer dauerhaft zu einem Kunden gehört.
- **Datenbank-Migrationen liegen in `supabase/migrations/`** und müssen **vor
  oder mit** dem App-Update eingespielt werden. Die App ruft die Vergabe mit der
  Untergrenze auf; ohne die Migration kennt die Datenbank den Aufruf nicht und
  das Finalisieren schlägt fehl.
- **Tests:** `pnpm test` (vitest). Getestet wird ausschließlich `src/sync/*` und
  `electron/sync/*` — der Teil, der nicht falsch sein darf.
- **Serverstandort** steht in `electron/sync/config.cjs` und wird von dort in die
  Datenschutzerklärung durchgereicht. Beides muss zusammenpassen.

### Finanzen-Modul & Anhänge

`FinanceView` ist ein Tab-Container; die echten Tabs liegen unter `src/components/finance/`. PDFs (Eingangsrechnungen / Verträge) werden **nie** in den State serialisiert — nur `Attachment`-Metadaten (`id`, `sha256`, `sizeBytes`) liegen im Store, der Inhalt wird über `attachmentWrite/Read/Delete` IPC verschlüsselt auf Platte gehalten (`userData/attachments/`). `wipe-all-data` löscht dieses Verzeichnis mit.

### PDF-Generierung

`jspdf` + `jspdf-autotable` in `src/utils/invoicePdf.ts` und `dunningPdf.ts`. Rechnungen und Mahnungen werden client-seitig im Renderer erzeugt — der Issuer (Firmenstammdaten) kommt aus dem AppState.

## Konventionen

- **Sprache**: Identifier englisch (`startTimer`, `entries`), User-Facing-Strings + Kommentare deutsch. Niemals `ä/ö/ü/ß` durch ASCII-Ersatz ausschreiben.
- **Styling**: Tailwind v4 (via `@tailwindcss/vite`-Plugin, kein `tailwind.config.js`
  — die gesamte Konfiguration liegt in `src/style.css`).

  **Farbe wird nicht mehr in Komponenten gewählt, sondern eine Rolle.** Flächen:
  `paper` (Seitenhintergrund), `surface` (ruhiger Inhalt), `raised` (Block darin),
  `overlay` (Drawer/Dialog/Menü), `scrim` (Schleier). Text: `ink`, `muted`.
  Trennung: `divider`, `divider-soft`. Interaktion: `primary`/`on-primary`
  (die eine Primäraktion), `accent` (Hover, Fokusrand, Auswahl), `focus`
  (bewusst akzentunabhängig). Zustände: `danger`, `warning`, `success`, `info`,
  je als Text, `-soft` (Fläche) und `-line` (Rand), dazu `-solid` wo es gefüllte
  Knöpfe gibt, und `on-solid` für den Text darauf.

  `@theme` trägt die dunklen Werte als Rückfallebene; ein ungelayerter Block
  `:root[data-theme='light']` überschreibt sie. Tailwind legt `@theme` in
  `@layer theme` ab, ungelayerte Regeln gewinnen dagegen unabhängig von der
  Spezifität — deshalb braucht der Hellmodus kein `!important`. `data-theme`,
  `data-accent` und `data-glass` setzt `src/utils/theme.ts`.

  **Maße sind verbindlich und stehen als Variablen**: `--kv-h-control` (36 px)
  für Knopf, Feld, Auswahl, Suche und Filter; `--kv-h-row` (44 px);
  `--kv-r-control`/`-card`/`-overlay` (8/12/16 px); `--kv-dur-fast`/`--kv-dur`/
  `--kv-dur-slow` und `--kv-ease` für alle Übergänge.

  **Neue Ansichten bauen keine eigenen Varianten aus Utilities.** Dafür gibt es
  die `.kv-*`-Bausteine in `@layer components`: `kv-btn` (+ `-primary`,
  `-outline`, `-quiet`, `-danger`), `kv-icon-btn`, `kv-input`, `kv-label`,
  `kv-card`, `kv-raised`, `kv-overlay`, `kv-badge`, `kv-toolbar`,
  `kv-segmented`/`kv-segment`, `kv-popover`, `kv-count`, `kv-glass`, `kv-scrim`.
  Fehlt etwas, entsteht es dort — nicht an der Aufrufstelle.

  Versalien gehören zu `kv-label`, `kv-badge`, Tabellenköpfen und Überschriften,
  **nicht** zu Schaltflächen. Interaktive Schrift nie unter 12 px.

  **Glas ist Material, kein Effekt**: eine Stufe, nur auf Titelleiste,
  Seitenleiste, schwebenden Leisten und Tooltips — nie unter Tabellen,
  Formularen, Zahlenreihen oder der PDF-Vorschau. Den Schleier (`kv-scrim`)
  trägt die Unschärfe, nicht die Dialogfläche darüber. Abschaltbar
  (gerätelokal), und `prefers-reduced-transparency` sticht die Einstellung.

  Bewegung: `prefers-reduced-motion` wird an **zwei** Stellen bedient — per
  Media Query in `style.css` für CSS-Übergänge und per `<MotionConfig
  reducedMotion="user">` in `src/main.tsx` für Framer Motion, dessen
  Inline-Styles keine Media Query erreicht. Beide Hebel werden gebraucht.

  Ausgenommen von alldem ist `src/components/TimerOverlay.tsx`: eigenes
  transparentes Fenster, eigene Farben, fest dunkel.

  Konzept: `documentation/erscheinungsbild-2.md`. Was davon umgesetzt ist
  und was nicht, steht gemessen in `documentation/umsetzungsstand.md`.
- **Icons**: ausschließlich `lucide-react`.
- **State-Updates in Effects**: explizit erlaubt (`react-hooks/set-state-in-effect: off` in `eslint.config.js`) — wird für Form-Init in Modals genutzt.
- **`window.api`** ist optional (`?.`) — Code muss auch ohne Electron lauffähig sein (Browser-Preview via `pnpm dev` ohne `electron`).
- **Versions-Bump**: `pnpm version-set X.Y.Z` (kein Git-Tag). `dist:publish` veröffentlicht automatisch auf GitHub Releases (`Kavoma/Kavoma-Time`).

## userData-Layout

Bewusst nicht der Electron-Default, sondern `app.getPath('appData')/Kavoma/KavomaTime`:

- Windows: `%APPDATA%/Kavoma/KavomaTime/`
- macOS: `~/Library/Application Support/Kavoma/KavomaTime/`

Enthält:

- `kavoma-time-data.json` — verschlüsselter electron-store
- `kavoma.key` — AES-Schlüssel, gewrappt über `safeStorage` (Windows DPAPI / macOS Schlüsselbund)
- `attachments/<uuid>.pdf.enc` — verschlüsselte PDF-Belege

Der Keychain-Eintrag hinter `safeStorage` hängt unter macOS an der Code-Signatur-
Identität des Bundles. Deshalb signiert `build/afterPack.cjs` unsignierte Builds
ad-hoc auf `com.kavoma.time` — ohne das trüge das Bundle nur die geerbte
Electron-Signatur und der AES-Schlüssel wäre nach jedem Rebuild ein anderer.

Wenn `safeStorage.isEncryptionAvailable()` false ist, zeigt die App beim Start eine bewusst friktionierte zweistufige Warn-Dialog-Kette und einen permanenten `EncryptionBanner`. Backup-/Anhang-Operationen werfen dann hart, statt Klartext zu schreiben — das ist gewollt und sollte nicht aufgeweicht werden.

## Branding & Docs

`branding/` enthält Markdown-Briefings (`APP_SUMMARY.md`, `DSGVO.md`, `FINANZEN.md`, `V2_IDEAS.md`, `Kavoma_Suite_Masterplan_Ultimate.md`) — gute Kontextquelle für fachliche Fragen. **Hinweis**: `branding/Token.md` enthält einen GitHub-PAT im Klartext. Der ganze
Ordner steht in der `.gitignore` und war nie eingecheckt (auch nicht in der
Historie) — die Datei bleibt trotzdem etwas, das man nicht versehentlich
weiterreicht.
