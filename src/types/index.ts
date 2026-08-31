import type { Conflict, SyncStatus, Tombstone } from '../sync/types';

export type CustomerStatus = 'active' | 'paused' | 'archived';

export interface Customer {
  id: number;
  name: string;
  debtorNumber?: string;
  color: string;
  hourlyRate?: number;
  street?: string;
  address2?: string;   // Adresszusatz
  zip?: string;
  city?: string;
  address?: string;     // Legacy / Fallback
  country?: string;     // ISO-3166-1 alpha-2, Default 'DE' — Pflichtangabe für E-Rechnung (BT-55)
  email?: string;
  vatId?: string;       // USt-IdNr. des Kunden (BT-48) — nur für EU-Fälle/Reverse-Charge nötig

  // V1.5 — Kundenverwaltung-Erweiterungen
  status?: CustomerStatus;        // Default 'active'; 'archived' filtert aus Standard-Listen
  tags?: string[];                // Freie Labels, Farbe deterministisch aus String gehasht
  industry?: string;              // Branche, frei
  notes?: string;                 // Markdown-fähig (vorerst Plain-Text)
  acquisitionDate?: number;       // Wann zum Kunden geworden
  firstContactDate?: number;      // Optional, Lead-Tracking-Light
  referredBy?: number;            // Customer.id — wer hat empfohlen
  createdAt?: number;             // Anlegedatum (für neue Kunden gesetzt; Legacy: id ≈ Date.now())
}

export type ProjectStatus = 'active' | 'on-hold' | 'completed' | 'archived';
export type ProjectPriority = 'low' | 'normal' | 'high';

export interface Milestone {
  id: string;                     // crypto.randomUUID()
  title: string;
  description?: string;
  targetDate?: number;            // Soll-Termin
  status: 'open' | 'done';
  estimatedHours?: number;        // optionale Schätzung
  doneAt?: number;                // gesetzt wenn status='done'
  createdAt: number;
}

export interface Project {
  id: number;
  customerId: number;
  name: string;
  description?: string;              // Auftragsbeschreibung / Briefing
  hourlyRate?: number;               // überschreibt Customer.hourlyRate
  budgetHours?: number;              // optionales Stundenbudget für Forecasting
  fixedPrice?: number;               // optionaler Pauschalpreis fürs Projekt (Forecasting + Real-Stundensatz)

  // V1.5 — Projektverwaltung-Erweiterungen
  status?: ProjectStatus;            // Default 'active'
  tags?: string[];
  priority?: ProjectPriority;        // Default 'normal' — Sortier-Faktor
  budgetAmount?: number;             // €-Budget, additiv zu budgetHours
  startDate?: number;
  targetEndDate?: number;
  colorOverride?: string;            // wenn gesetzt: überschreibt Kunden-Farbe in Listen
  createdAt?: number;
  milestones?: Milestone[];          // 3.3 — leichte Meilenstein-Liste
}

export interface TimeEntry {
  id: number;
  customerId: number;
  projectId: number;
  description: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
}

export interface Issuer {
  name: string;
  street: string;
  address2?: string;      // Adresszusatz
  zip: string;
  city: string;
  country?: string;       // ISO-3166-1 alpha-2, Default 'DE' (BT-40)
  email: string;
  phone: string;
  iban: string;
  bic: string;
  bank: string;
  taxId: string;          // Steuernummer (BT-32, schemeID 'FC')
  vatId?: string;         // USt-IdNr. (BT-31, schemeID 'VA') — z. B. DE123456789
  smallBusiness: boolean; // §19 UStG Kleinunternehmer
  vatRate: number;        // % — 0 falls Kleinunternehmer
}

export type InvoiceItemKind = 'time' | 'flat' | 'discount';

export interface InvoiceItem {
  description: string;
  quantity: number;       // Stunden, 1 bei Pauschal, Prozent bei Rabatt
  unit: string;           // "h" | "Pauschal" | "%" | "€"
  unitPrice: number;      // €
  total: number;          // € (bei Rabatt negativ)
  kind?: InvoiceItemKind; // optional — Migration leitet aus 'unit' ab
}

export type InvoiceMode = 'hourly' | 'fixed' | 'mixed';

export type InvoiceStatus = 'active' | 'cancelled' | 'draft';

export interface DunningReminder {
  level: 1 | 2 | 3;        // 1. Zahlungserinnerung, 2. Mahnung, 3. letzte Mahnung
  sentAt: number;
  newDueDate: number;      // Neue Zahlungsfrist
  fee: number;             // Mahngebühr in €
  notes?: string;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: number;
  projectId: number | null;    // null = alle Projekte des Kunden
  mode: InvoiceMode;
  periodFrom: number;
  periodTo: number;
  createdAt: number;
  dueDate: number;
  items: InvoiceItem[];
  entryIds: number[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  paid: boolean;
  paidAt?: number;

  // === Status (active | cancelled | draft) ===
  // Drafts sind in Umsatz-Statistiken unsichtbar und können nachträglich
  // finalisiert (auf 'active' wechseln) oder verworfen werden.
  status: InvoiceStatus;
  cancelledAt?: number;
  cancellationReason?: string;
  cancelsInvoiceId?: string;     // wenn diese Rechnung eine Storno-Rechnung ist
  cancelledByInvoiceId?: string; // wenn diese Rechnung storniert wurde, ID der Storno-Rechnung

  // === Mahnsystem ===
  reminders: DunningReminder[];

  // === Phase 1.5: Recurring-Herkunft ===
  // ID der RecurringInvoice-Definition, aus der dieser Draft generiert wurde.
  // Wird beim Finalisieren beibehalten als Audit-Spur.
  recurringId?: string;
}

// === Phase 1.5: Rechnungs-Vorlagen ===
export interface InvoiceTemplate {
  id: string;
  name: string;
  customerId?: number;     // optionaler Default-Kunde
  projectId?: number;
  items: InvoiceItem[];    // freie Positionen mit kind
  serviceType: string;
  notes: string;
  dueDays: number;         // Default 14
  createdAt: number;
}

// === Phase 1.5: Wiederkehrende Rechnungen ===
export type RecurringCadence = 'monthly' | 'quarterly' | 'yearly';

export interface RecurringInvoice {
  id: string;
  templateId: string;
  customerId: number;
  cadence: RecurringCadence;
  dayOfPeriod: number;     // 1..28 (Maximum für sicheren Monatstag)
  nextDueAt: number;
  lastGeneratedAt?: number;
  active: boolean;
}

// === Anhang-System (verschlüsselte PDFs in userData/attachments/) ===
export interface Attachment {
  id: string;                       // UUID, identisch zum Dateinamen
  filename: string;                 // Original-Dateiname für Anzeige
  mimeType: 'application/pdf';
  sizeBytes: number;
  sha256: string;                   // Integritäts-Check, hex
  uploadedAt: number;
}

export type VendorInvoiceCategory =
  | 'hardware'
  | 'software'
  | 'office'
  | 'travel'
  | 'service'
  | 'other';

export interface VendorInvoice {
  id: number;
  attachmentId: string;             // FK → Attachment.id
  vendorName: string;
  invoiceNumber?: string;
  invoiceDate: number;
  amountGross: number;
  vatAmount?: number;
  category: VendorInvoiceCategory;
  note?: string;
  createdAt: number;
}

export interface Contract {
  id: number;
  customerId: number;               // FK → Customer.id
  attachmentId: string;             // FK → Attachment.id
  title: string;
  signedAt: number;
  validUntil?: number;
  note?: string;
  createdAt: number;
}

/** Vom Main-Prozess erkannte Abwesenheit, über die entschieden werden muss. */
export interface DetectedPause {
  began: number;
  ended: number;
  reason: 'idle' | 'sleep' | 'lock';
}

export interface AppState {
  isRunning: boolean;
  startedAt: number | null;
  sessionStartedAt: number | null;
  elapsedBefore: number;
  currentCustomerId: number;
  currentProjectId: number;
  currentDescription: string;
  entries: TimeEntry[];
  customers: Customer[];
  projects: Project[];
  weeklyTargetHours: number;
  shortcuts: { startPause: string };
  issuer: Issuer;
  invoices: Invoice[];
  nextInvoiceCounter: number;   // für laufende Nummer
  invoicePrefix?: string;       // Präfix für Rechnungen (Standard: Jahr-)
  nextDebtorNumber: number;     // für Kunden/Debitoren (DATEV konform)
  timerOverlayEnabled?: boolean;
  afkPauseEnabled?: boolean;
  afkTimeoutMinutes?: number;
  /** Laufende Erfassung beim Herunterfahren/Abmelden automatisch beenden. */
  stopOnShutdownEnabled?: boolean;
  /** Abends einmal erinnern, falls noch etwas läuft. */
  endOfDayReminderEnabled?: boolean;
  endOfDayReminderHour?: number;
  endOfDayReminderMinute?: number;

  // === Anhänge und dokumentierte Belege/Verträge ===
  attachments: Attachment[];
  vendorInvoices: VendorInvoice[];
  contracts: Contract[];
  nextVendorInvoiceId?: number;
  nextContractId?: number;

  // === Phase 1.5: Vorlagen + Wiederkehrend ===
  invoiceTemplates: InvoiceTemplate[];
  recurringInvoices: RecurringInvoice[];
  nextTemplateId?: number;
  nextRecurringId?: number;

  // === E-Rechnung (ZUGFeRD / Factur-X, Profil EN 16931) ===
  /** Default true — bettet das CII-XML in jedes Rechnungs-PDF ein. */
  eInvoiceEnabled?: boolean;

  // === Gerätesynchronisation ===
  // Die Geräte-Kennung liegt bewusst NICHT hier, sondern unter einem eigenen
  // Store-Schlüssel (`sync_device_id`) — wie `auto_backup_config`. Ein
  // eingespieltes Backup würde sie sonst auf ein zweites Gerät klonen, und
  // zwei Geräte mit derselben Kennung machen die Lamport-Reihenfolge
  // unauflösbar.
  /** Zählt Änderungsbündel. Uhren gehen falsch, Zähler nicht. */
  syncLamport?: number;
  /**
   * Wann jede Entität zuletzt geändert wurde — `"customer:5"` → Lamport+Gerät.
   *
   * Ohne diese Tabelle kann „letzte Änderung gewinnt" nicht entscheiden: Die
   * Domänen-Typen selbst tragen keine Version, und sie sollen auch keine
   * bekommen (eine `_rev` in `Invoice` landete im Backup und im PDF-Export).
   * Wird nicht synchronisiert — jedes Gerät führt seine eigene.
   */
  syncVersions?: Record<string, { l: number; d: string }>;
  /** Spuren von Löschungen — ohne sie bringt ein lange offline gewesenes Gerät
   *  gelöschte Einträge mit einem alten Upsert zurück. */
  syncTombstones?: Tombstone[];
  /** Die letzten sichtbar gemachten Konflikte (gekappt auf 100). */
  syncConflicts?: Conflict[];
}

/**
 * Konfiguration des automatischen Backups. Liegt NICHT im AppState, sondern
 * im electron-store unter eigenem Schlüssel — der Main-Prozess muss ohne
 * geöffnetes Fenster darauf zugreifen können.
 */
export interface AutoBackupConfig {
  enabled: boolean;
  intervalHours: number;
  directory: string | null;
  /** Wie viele Backups im Zielordner behalten werden. */
  keep: number;
  lastRunAt: number;
  lastError?: string | null;
  lastFile?: string | null;
}

declare global {
  interface Window {
    api?: {
      /** 'darwin' | 'win32' | 'linux' — für plattformabhängiges UI-Layout. */
      platform: string;
      /** Ob dieses System das schwebende Timer-Overlay anbietet (macOS: nein). */
      overlaySupported: boolean;

      saveData: (key: string, data: any) => Promise<void>;
      loadData: (key: string) => Promise<any>;
      onHotkeyToggle: (cb: () => void) => () => void;
      onStoreUpdated: (cb: (key: string, data: any) => void) => () => void;
      onNavigateToView: (cb: (view: string) => void) => () => void;
      onViewSwipe: (cb: (direction: 'left' | 'right') => void) => () => void;
      onTimerQuickStart: (cb: (target: { customerId: number; projectId: number; description: string }) => void) => () => void;
      onTimerCommand: (cb: (command: 'toggle' | 'start' | 'pause' | 'stop', effectiveNow?: number) => void) => () => void;
      sendTimerOverlayCommand: (command: 'toggle' | 'start' | 'pause' | 'stop') => Promise<void>;
      getOverlayBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
      setOverlayPosition: (position: { x: number; y: number }) => Promise<void>;
      snapOverlayToNearestCorner: () => Promise<void>;
      getOverlayAnchor: () => Promise<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>;
      onOverlayAnchorChanged: (cb: (anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => void) => () => void;
      startOverlayDrag: (cursor: { x: number; y: number }) => Promise<void>;
      endOverlayDrag: () => Promise<void>;
      showMainWindowFromOverlay: () => Promise<void>;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
      setStartPauseShortcut: (accelerator: string) => Promise<void>;
      onAfkPauseDetected: (cb: (pause: DetectedPause) => void) => () => void;
      getPendingAfkPause: () => Promise<DetectedPause | null>;
      resolveAfkPause: () => Promise<void>;
      encryptBackup: (plaintext: string) => Promise<any>;
      decryptBackup: (payload: any) => Promise<string>;
      autoBackupGetConfig: () => Promise<AutoBackupConfig>;
      autoBackupSetConfig: (patch: Partial<AutoBackupConfig>) => Promise<AutoBackupConfig>;
      autoBackupChooseDirectory: () => Promise<string | null>;
      autoBackupRunNow: () => Promise<{ ok: boolean; file?: string; removed?: number; error?: string }>;
      autoBackupOpenDirectory: () => Promise<boolean>;
      wipeAllData: () => Promise<boolean>;
      attachmentWrite: (id: string, base64Plain: string) => Promise<{ sizeBytes: number }>;
      attachmentRead: (id: string) => Promise<string>;
      attachmentDelete: (id: string) => Promise<boolean>;
      /** Liegt der Beleg auf diesem Gerät, oder muss er erst geladen werden? */
      attachmentHas: (id: string) => Promise<boolean>;
      getAppInfo: () => Promise<{ os: string; arch: string; version: string }>;
      getEncryptionStatus: () => Promise<{ available: boolean; active: boolean }>;
      /** Kennung, Name und Plattform dieses Geräts (Synchronisierung). */
      syncGetDeviceInfo: () => Promise<{ id: string; name: string; platform: string } | null>;
      /**
       * Zieht die nächste laufende Nummer.
       *
       * `local`       — Sync nicht eingerichtet, der Aufrufer nimmt den lokalen Zähler.
       * `server`      — atomar aus der Datenbank vergeben.
       * `reserve`     — offline aus vorab gezogenem Vorrat.
       * `unavailable` — Sync an, offline, Vorrat leer. Dann gibt es keine Nummer;
       *                 auf den lokalen Zähler zurückzufallen erzeugte Dubletten.
       */
      syncAllocateNumber: (kind: 'invoice' | 'debtor', year: number) => Promise<
        | { source: 'local' }
        | { source: 'server' | 'reserve'; value: number }
        | { source: 'unavailable'; error?: string }
      >;
      syncReserveStatus: (kind: 'invoice' | 'debtor', year: number) => Promise<{ kind: string; year: number; remaining: number; target: number }>;

      // === Gerätesynchronisation ===
      /** Serverstandort für die Datenschutzerklärung. */
      syncGetRegion: () => Promise<{ region: string; isThirdCountry: boolean }>;
      syncGetStatus: () => Promise<SyncStatus>;
      syncSignIn: (email: string, password: string) => Promise<SyncStatus>;
      syncSignOut: () => Promise<SyncStatus>;
      /** Ob für dieses Konto schon eine Passphrase eingerichtet ist. */
      syncHasKeys: () => Promise<boolean>;
      /** Erstmalige Einrichtung. Der Wiederherstellungscode kommt genau einmal. */
      syncSetupPassphrase: (passphrase: string) => Promise<{ recoveryCode: string }>;
      /** Erstes Gerät: Schlüssel anlegen, ohne Passphrase. Code kommt genau einmal. */
      syncInitializeKey: () => Promise<{ recoveryCode: string }>;
      /** Neues Gerät: Verbindungsanfrage stellen. Die Zahl kommt über `onSyncLinkCode`. */
      syncStartLink: () => Promise<{ linkId: string }>;
      syncCancelLink: () => Promise<boolean>;
      syncListLinks: () => Promise<Array<{ id: string; name: string; platform: string; createdAt: string }>>;
      /** Eingerichtetes Gerät: mit der eigenen öffentlichen Hälfte antworten. */
      syncRespondLink: (id: string) => Promise<{ id: string; name: string; platform: string }>;
      /** Eingerichtetes Gerät: Zahl prüfen und den Schlüssel freigeben. */
      syncApproveLink: (id: string, code: string) => Promise<{ ok: boolean }>;
      syncRejectLink: (id: string) => Promise<{ ok: boolean }>;
      onSyncLinkRequest: (cb: (anfrage: { id: string; name: string; platform: string }) => void) => () => void;
      onSyncLinkCode: (cb: (daten: { code: string }) => void) => () => void;
      onSyncLinkDone: (cb: (daten: { ok: boolean; error?: string }) => void) => () => void;
      /** Zweites Gerät: Passphrase oder Wiederherstellungscode. */
      syncUnlock: (secret: string) => Promise<SyncStatus>;
      /** Abgleich aufnehmen — erst nach dem Erstabgleich aufrufen. */
      syncStart: () => Promise<SyncStatus>;
      syncEnqueue: (ops: unknown[]) => Promise<SyncStatus>;
      syncNow: () => Promise<SyncStatus>;
      /** Für die Erstabgleich-Vorschau: alles vom Server, ohne den Zeiger zu bewegen. */
      syncFetchAll: () => Promise<{ ops: unknown[]; upTo: number }>;
      syncAcceptCursor: (seq: number) => Promise<boolean>;
      syncListDevices: () => Promise<Array<{ id: string; name: string; platform: string; created_at: string; last_seen_at: string }>>;
      syncRevokeDevice: (id: string) => Promise<unknown>;
      onSyncOps: (cb: (ops: unknown[]) => void) => () => void;
      onSyncStatus: (cb: (status: SyncStatus) => void) => () => void;
      getUpdateStatus: () => Promise<UpdateStatus>;
      checkForUpdates: () => Promise<void>;
      installDownloadedUpdate: () => Promise<boolean>;
      onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void;
      getAutoUpdateEnabled: () => Promise<boolean>;
      setAutoUpdateEnabled: (enabled: boolean) => Promise<boolean>;
      getOnboardingCompleted: () => Promise<boolean>;
      setOnboardingCompleted: () => Promise<boolean>;
    }
  }
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'not-available' | 'downloaded' | 'error' | 'dev-disabled';
  message: string;
  version: string | null;
  progress: number | null;
  error: string | null;
}
