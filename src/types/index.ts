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
}

export interface Project {
  id: number;
  customerId: number;
  name: string;
  description?: string;              // Auftragsbeschreibung / Briefing
  hourlyRate?: number;               // überschreibt Customer.hourlyRate
  budgetHours?: number;              // optionales Stundenbudget für Forecasting
  fixedPrice?: number;               // optionaler Pauschalpreis fürs Projekt (Forecasting + Real-Stundensatz)
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

export interface InvoiceItem {
  description: string;
  quantity: number;       // Stunden oder 1 bei Pauschal
  unit: string;           // "h" | "Pauschal"
  unitPrice: number;      // €
  total: number;          // €
}

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
  mode: 'hourly' | 'fixed';
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

  // === Storno ===
  status: 'active' | 'cancelled';
  cancelledAt?: number;
  cancellationReason?: string;
  cancelsInvoiceId?: string;   // wenn diese Rechnung eine Storno-Rechnung ist
  cancelledByInvoiceId?: string; // wenn diese Rechnung storniert wurde, ID der Storno-Rechnung

  // === Mahnsystem ===
  reminders: DunningReminder[];
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
