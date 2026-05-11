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
}

export interface Project {
  id: number;
  customerId: number;
  name: string;
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
}

declare global {
  interface Window {
    api?: {
      saveData: (key: string, data: any) => Promise<void>;
      loadData: (key: string) => Promise<any>;
      onHotkeyToggle: (cb: () => void) => () => void;
      setStartPauseShortcut: (accelerator: string) => Promise<void>;
    }
  }
}
