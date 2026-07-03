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
  email?: string;
  eInvoiceAccepted?: boolean;
  eInvoiceConsentDate?: number;   // Zeitpunkt der Zustimmung (ms)

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
  email: string;
  phone: string;
  iban: string;
  bic: string;
  bank: string;
  taxId: string;          // Steuer-Nr. / USt-IdNr.
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
}

declare global {
  interface Window {
    api?: {
      saveData: (key: string, data: any) => Promise<void>;
      loadData: (key: string) => Promise<any>;
      onHotkeyToggle: (cb: () => void) => () => void;
      onStoreUpdated: (cb: (key: string, data: any) => void) => () => void;
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
      encryptBackup: (plaintext: string) => Promise<any>;
      decryptBackup: (payload: any) => Promise<string>;
      wipeAllData: () => Promise<boolean>;
      attachmentWrite: (id: string, base64Plain: string) => Promise<{ sizeBytes: number }>;
      attachmentRead: (id: string) => Promise<string>;
      attachmentDelete: (id: string) => Promise<boolean>;
      getAppInfo: () => Promise<{ os: string; arch: string; version: string }>;
      getEncryptionStatus: () => Promise<{ available: boolean; active: boolean }>;
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
