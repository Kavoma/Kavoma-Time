import type { Conflict, SyncStatus, Tombstone } from '../sync/types';
import type { DatevSettings } from '../utils/datevExport';

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

/** Wie eine Zahlung in die App kam. */
export type PaymentSource = 'manual' | 'switch';

/**
 * Ein einzelner Zahlungseingang auf eine Rechnung.
 *
 * Mehrere sind ausdrücklich erlaubt — Anzahlung, Restzahlung, Nachzahlung der
 * Mahngebühr. Der Betrag ist immer positiv; eine Rückzahlung wird über eine
 * Storno-Rechnung abgebildet, nicht über einen negativen Eingang.
 */
export interface Payment {
  id: string;
  /** € brutto, positiv. */
  amount: number;
  paidAt: number;
  method?: 'transfer' | 'cash' | 'card' | 'other';
  note?: string;
  /**
   * `'switch'` heisst: aus dem früheren Ja/Nein-Schalter **erschlossen**, nicht
   * erfasst. Der Unterschied gehört in eine Betriebsprüfung — wir wissen, dass
   * die Rechnung als bezahlt galt, nicht, wann welcher Betrag einging.
   */
  source: PaymentSource;
  createdAt: number;
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
  /**
   * Abgeleitet aus `payments` — nicht von Hand setzen.
   *
   * Bleibt als Feld bestehen, weil rund zwanzig Stellen es lesen. Gepflegt wird
   * es ausschliesslich von den Funktionen in `src/utils/payments.ts`.
   */
  paid: boolean;
  /** Tag der Zahlung, die die Rechnung ausgeglichen hat. Ebenfalls abgeleitet. */
  paidAt?: number;
  /**
   * Die einzelnen Zahlungseingänge. Fehlt das Feld, stammt die Rechnung aus
   * der Zeit vor B5 und wird beim Laden umgestellt (`migrateData`).
   */
  payments?: Payment[];

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

  /** Angebot, aus dem diese Rechnung entstanden ist. Audit-Spur wie `recurringId`. */
  quoteId?: string;
}

// === Angebote ===

/**
 * Was aus einem Angebot geworden ist.
 *
 * `expired` steht bewusst **nicht** hier: Ob ein Angebot abgelaufen ist, ergibt
 * sich aus `validUntil` und dem heutigen Datum. Als gespeicherter Zustand
 * müsste es jemand umsetzen — und niemand ist da, wenn die Frist nachts um
 * zwölf verstreicht.
 */
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'invoiced';

export interface Quote {
  id: string;
  /**
   * Eigener Nummernkreis, unabhängig von den Rechnungen.
   *
   * Bewusst **lokal** vergeben, auch bei eingeschalteter Synchronisierung: Ein
   * Angebot ist kein Buchungsbeleg, für seine Nummer gibt es keine
   * Lückenlosigkeitspflicht. Die Vergabe zu verweigern, weil ein Server nicht
   * erreichbar ist, wäre bei einer Rechnung richtig und hier absurd.
   */
  number: string;
  customerId: number;
  projectId: number | null;
  createdAt: number;
  /** Bis wann das Angebot gilt. Danach gilt es als abgelaufen. */
  validUntil: number;
  items: InvoiceItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  status: QuoteStatus;
  sentAt?: number;
  /** Wann angenommen oder abgelehnt wurde. */
  decidedAt?: number;
  declineReason?: string;
  /** Die Rechnung, die daraus entstanden ist. */
  invoiceId?: string;
  /** Vorlage, aus der die Positionen kamen. */
  templateId?: string;
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
  mimeType: 'application/pdf' | 'application/xml';
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
  /**
   * Gesetzt, wenn der Beleg aus einer E-Rechnung eingelesen wurde statt von
   * Hand erfasst. Fehlt das Feld, war es Handarbeit — so ist es bei allen
   * Belegen aus der Zeit vor dem Einlesen.
   *
   * Die Angabe ist Herkunftsnachweis, kein Zwischenspeicher: Die Zahlen stehen
   * im Datensatz, das vollständige XML im Anhang. Beides doppelt zu halten
   * hieße, es könnte auseinanderlaufen.
   */
  eInvoice?: {
    syntax: 'cii' | 'ubl';
    profileLabel?: string;
    /** Lag das XML im PDF, oder war die Datei selbst das XML? */
    source: 'embedded' | 'standalone';
  };
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

  // === Erscheinungsbild ===
  /**
   * Gewaehltes Thema. `'system'` folgt dem Betriebssystem und ist die
   * Vorgabe — auch fuer bestehende Installationen, damit ein bisher
   * dunkles System keinen ueberraschenden Bruch erlebt.
   */
  appearance?: 'system' | 'light' | 'dark';
  /**
   * Benannter Akzent. Eine freie Farbwahl gibt es bewusst nicht: Jede
   * Kombination muss in beiden Themen fuer Text, Fokus, Auswahl und
   * Warnung geprueft sein.
   */
  accent?: 'neutral' | 'crimson';
  /**
   * Dezentes Glas auf Navigation und Ueberlagerungen. Geraetelokal, weil
   * es an Bildschirm und Grafikleistung haengt — siehe DEVICE_LOCAL_KEYS.
   * Wird erst in Etappe 5 ausgewertet.
   */
  glassEnabled?: boolean;

  // === Anhänge und dokumentierte Belege/Verträge ===
  attachments: Attachment[];
  vendorInvoices: VendorInvoice[];
  contracts: Contract[];
  nextVendorInvoiceId?: number;
  nextContractId?: number;

  // === Angebote ===
  quotes: Quote[];
  /**
   * Präfix für Angebotsnummern. Vorgabe: `AN-<Jahr>-`.
   *
   * Einen Zähler gibt es bewusst **nicht**: Die nächste Nummer wird aus dem
   * tatsächlichen Bestand errechnet (`nextQuoteNumber`). Ein mitwandernder
   * Zähler wäre auf einem zweiten Gerät entweder zu niedrig oder er müsste
   * synchronisiert werden — beides schlechter, als nachzusehen, was es schon
   * gibt.
   */
  quotePrefix?: string;

  // === Phase 1.5: Vorlagen + Wiederkehrend ===
  invoiceTemplates: InvoiceTemplate[];
  recurringInvoices: RecurringInvoice[];
  nextTemplateId?: number;
  nextRecurringId?: number;

  // === E-Rechnung (ZUGFeRD / Factur-X, Profil EN 16931) ===
  /** Default true — bettet das CII-XML in jedes Rechnungs-PDF ein. */
  eInvoiceEnabled?: boolean;

  // === Steuerliche Exporte ===
  /**
   * Kontenrahmen und Kontonummern für den DATEV-Export. Fehlt das Feld, gilt
   * die Vorgabe aus `DATEV_VORGABEN` — der Export ist dann noch nicht
   * abgestimmt, aber lauffähig.
   */
  datev?: DatevSettings;

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
  /** Ob die PDF-Belege mitgesichert werden. Voreingestellt an. */
  includeAttachments: boolean;
  lastError?: string | null;
  lastFile?: string | null;
}

/** Ein Beleg, der beim Sichern oder Einspielen liegengeblieben ist. */
export interface BackupAttachmentIssue {
  id: string;
  filename: string | null;
  grund: string;
}

/** Zustand des Wiederherstellungscodes für den Sicherungsschlüssel. */
export interface BackupRecoveryStatus {
  /** Ob für diesen Rechner ein Code angelegt wurde. */
  hasEnvelope: boolean;
  /**
   * Ob der Code einmal richtig abgetippt wurde. Angelegt ist nicht dasselbe
   * wie angekommen: Wer ihn nur wegklickt, hat ihn nicht.
   */
  confirmed: boolean;
  createdAt: string | null;
  /** Ob überhaupt ein Verschlüsselungsschlüssel geladen ist. */
  keyAvailable: boolean;
}

export interface BackupExportResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  file?: string;
  bytes?: number;
  attachmentCount?: number;
  skippedAttachments?: BackupAttachmentIssue[];
  /** Ob die Datei einen Wiederherstellungs-Umschlag trägt. */
  hasRecovery?: boolean;
}

/**
 * Was beim Öffnen einer Sicherung herauskommt, bevor sie eingespielt wird.
 *
 * `version` ist 2 für den Container, 1 für die alte JSON-Sicherung und 0 für
 * einen Klartext-Export. `needsCode` heisst: Der Schlüssel dieses Rechners
 * passt nicht — die Datei stammt von woanders und braucht den
 * Wiederherstellungscode.
 */
export interface BackupImportResult {
  canceled?: boolean;
  error?: string;
  version?: 0 | 1 | 2;
  file?: string;
  createdAt?: string | null;
  appVersion?: string | null;
  attachmentCount?: number;
  skippedAttachments?: BackupAttachmentIssue[];
  needsCode?: boolean;
  /** Ob die Datei überhaupt einen Umschlag trägt, den ein Code öffnen könnte. */
  hasRecovery?: boolean;
  /** Der Datenbestand als JSON-Text — `null`, solange der Code fehlt. */
  state?: string | null;
}

declare global {
  interface Window {
    api?: {
      /** 'darwin' | 'win32' | 'linux' — für plattformabhängiges UI-Layout. */
      platform: string;
      /** Ob dieses System das schwebende Timer-Overlay anbietet (macOS: nein). */
      overlaySupported: boolean;

      /**
       * Meldet das WIRKSAME Thema an den Main-Prozess — nicht die
       * Einstellung. Im Systemmodus weiss nur der Renderer, was das
       * Betriebssystem gerade sagt. Der Main-Prozess zieht daraufhin
       * `nativeTheme`, Fensterhintergrund und (unter Windows) die eigene
       * Titelleiste nach.
       */
      setNativeTheme: (resolved: 'light' | 'dark') => Promise<void>;

      saveData: (key: string, data: any) => Promise<void>;
      loadData: (key: string) => Promise<any>;
      onHotkeyToggle: (cb: () => void) => () => void;
      onStoreUpdated: (cb: (key: string, data: any) => void) => () => void;
      onNavigateToView: (cb: (view: string) => void) => () => void;
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
      // === Sicherungen ===
      backupRecoveryStatus: () => Promise<BackupRecoveryStatus>;
      /** Legt den Code an und gibt ihn **genau einmal** zurück. */
      backupRecoveryCreate: (options?: { force?: boolean }) => Promise<{ recoveryCode: string }>;
      backupRecoveryVerify: (code: string) => Promise<boolean>;
      backupExport: (options?: {
        mode?: 'dialog' | 'auto';
        prefix?: string;
        includeAttachments?: boolean;
      }) => Promise<BackupExportResult>;
      /** Öffnet den Dateidialog und liest, was drinsteht. Spielt noch nichts ein. */
      backupImportPick: () => Promise<BackupImportResult>;
      /** Zweiter Anlauf für eine fremde Sicherung, mit dem Wiederherstellungscode. */
      backupImportUnlock: (code: string) => Promise<{ ok: boolean; state?: string; error?: string }>;
      /** Packt die Belege aus — erst nach der Bestätigung aufrufen. */
      backupRestoreAttachments: () => Promise<{ restored: number; failed: BackupAttachmentIssue[] }>;
      backupImportCancel: () => Promise<boolean>;
      /** Schreibt eine einzelne Exportdatei nach Rückfrage. */
      exportWriteFile: (options: {
        dateiname: string;
        bytes: Uint8Array;
        titel?: string;
        filter?: { name: string; extensions: string[] };
      }) => Promise<{ ok: boolean; canceled?: boolean; error?: string; file?: string }>;
      /** Schreibt mehrere zusammengehörige Dateien in einen neuen Unterordner. */
      exportWriteFolder: (options: {
        ordnerName: string;
        dateien: { name: string; bytes: Uint8Array }[];
        titel?: string;
      }) => Promise<{
        ok: boolean; canceled?: boolean; error?: string;
        directory?: string; files?: string[];
      }>;
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
       * `floor` ist die Untergrenze aus dem eigenen Datenbestand: die kleinste
       * Nummer, die noch frei sein muss. Sie hebt einen zurückgebliebenen
       * Zähler auf dem Server an und kann ihn nie senken.
       *
       * `local`       — Sync nicht eingerichtet, der Aufrufer nimmt `floor`.
       * `server`      — atomar aus der Datenbank vergeben.
       * `unavailable` — Sync an, Server nicht erreichbar. Dann gibt es keine
       *                 Nummer; auf den lokalen Zähler zurückzufallen erzeugte
       *                 Dubletten.
       */
      syncAllocateNumber: (kind: 'invoice' | 'debtor', year: number, floor: number) => Promise<
        | { source: 'local' }
        | { source: 'server'; value: number }
        | { source: 'unavailable'; error?: string }
      >;

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
