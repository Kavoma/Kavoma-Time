import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState } from '../types';

const STORAGE_KEY = 'kavoma_time';

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space';

const DEFAULT_ISSUER = {
  name: '',
  street: '',
  address2: '',
  zip: '',
  city: '',
  email: '',
  phone: '',
  iban: '',
  bic: '',
  bank: '',
  taxId: '',
  smallBusiness: true,
  vatRate: 19,
};

const SEED_STATE: AppState = {
  isRunning: false,
  startedAt: null,
  sessionStartedAt: null,
  elapsedBefore: 0,
  currentCustomerId: 0,
  currentProjectId: 0,
  currentDescription: '',
  entries: [],
  customers: [],
  projects: [],
  weeklyTargetHours: 40,
  shortcuts: { startPause: DEFAULT_SHORTCUT },
  issuer: DEFAULT_ISSUER,
  invoices: [],
  nextInvoiceCounter: 1,
  invoicePrefix: 'YYYY-',
  nextDebtorNumber: 10001,
};

interface ContextValue {
  state: AppState | null;
  setState: React.Dispatch<React.SetStateAction<AppState | null>>;
  isRestoring: boolean;
  restoreBackup: (data: AppState) => Promise<void>;
}

const AppStateContext = createContext<ContextValue | null>(null);

function migrateData(data: any): AppState {
  const migrated = { ...data };

  // Migration für ältere Saves
  if (!Array.isArray(migrated.customers)) migrated.customers = SEED_STATE.customers;
  if (!Array.isArray(migrated.projects)) migrated.projects = SEED_STATE.projects;
  if (typeof migrated.weeklyTargetHours !== 'number') migrated.weeklyTargetHours = SEED_STATE.weeklyTargetHours;
  if (!migrated.shortcuts || typeof migrated.shortcuts.startPause !== 'string') migrated.shortcuts = SEED_STATE.shortcuts;
  if (!migrated.issuer || typeof migrated.issuer !== 'object') migrated.issuer = SEED_STATE.issuer;
  else migrated.issuer = { ...SEED_STATE.issuer, ...migrated.issuer };
  if (!Array.isArray(migrated.invoices)) migrated.invoices = [];
  if (typeof migrated.nextInvoiceCounter !== 'number') migrated.nextInvoiceCounter = 1;
  if (typeof migrated.invoicePrefix !== 'string') migrated.invoicePrefix = SEED_STATE.invoicePrefix;
  if (typeof migrated.nextDebtorNumber !== 'number') migrated.nextDebtorNumber = SEED_STATE.nextDebtorNumber;

  // Migration: Strukturierte Adressen
  if (migrated.issuer && (migrated.issuer as any).address && !migrated.issuer.street) {
    const lines = (migrated.issuer as any).address.split('\n');
    migrated.issuer.street = lines[0]?.trim() || '';
    migrated.issuer.city = lines.slice(1).join(', ').trim() || '';
  }
  migrated.customers?.forEach((c: any) => {
    if (c.address && !c.street) {
      const lines = c.address.split('\n');
      c.street = lines[0]?.trim() || '';
      c.city = lines.slice(1).join(', ').trim() || '';
    }
    if (!c.debtorNumber) {
      c.debtorNumber = String(migrated.nextDebtorNumber);
      migrated.nextDebtorNumber++;
    }
  });

  // Migration: Invoice-Status + Mahn-Array
  migrated.invoices?.forEach((inv: any) => {
    if (!inv.status) inv.status = 'active';
    if (!Array.isArray(inv.reminders)) inv.reminders = [];
  });

  // Crash Recovery — Timer lief beim Schließen → verstrichene Zeit retten
  if (migrated.isRunning && migrated.startedAt) {
    const crashed = Math.floor((Date.now() - migrated.startedAt) / 1000);
    return { ...migrated, isRunning: false, startedAt: null, elapsedBefore: migrated.elapsedBefore + crashed };
  }

  return migrated;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const restoreBackup = async (data: AppState) => {
    setIsRestoring(true);
    // Gib der Animation Zeit zu starten
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const migrated = migrateData(data);
    setState(migrated);
    
    // Gib der Animation Zeit zum Verweilen
    await new Promise(resolve => setTimeout(resolve, 1200));
    setIsRestoring(false);
  };

  // Laden (einmalig)
  useEffect(() => {
    async function loadData() {
      let data: any = null;
      if (window.api) {
        data = await window.api.loadData(STORAGE_KEY);
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) data = JSON.parse(saved);
      }

      if (data) {
        setState(migrateData(data));
      } else {
        setState(SEED_STATE);
      }
    }
    loadData();
  }, []);

  // Persistieren bei jeder Änderung
  useEffect(() => {
    if (!state) return;
    if (window.api) window.api.saveData(STORAGE_KEY, state);
    else            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return (
    <AppStateContext.Provider value={{ state, setState, isRestoring, restoreBackup }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}
