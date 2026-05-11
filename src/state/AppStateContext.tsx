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
}

const AppStateContext = createContext<ContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);

  // Laden (einmalig)
  useEffect(() => {
    async function loadData() {
      let data: AppState | null = null;
      if (window.api) {
        data = await window.api.loadData(STORAGE_KEY);
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) data = JSON.parse(saved);
      }

      if (data) {
        // Migration für ältere Saves
        if (!Array.isArray(data.customers))   data.customers   = SEED_STATE.customers;
        if (!Array.isArray(data.projects))    data.projects    = SEED_STATE.projects;
        if (typeof data.weeklyTargetHours !== 'number') data.weeklyTargetHours = SEED_STATE.weeklyTargetHours;
        if (!data.shortcuts || typeof data.shortcuts.startPause !== 'string') data.shortcuts = SEED_STATE.shortcuts;
        if (!data.issuer || typeof data.issuer !== 'object') data.issuer = SEED_STATE.issuer;
        else data.issuer = { ...SEED_STATE.issuer, ...data.issuer };
        if (!Array.isArray(data.invoices)) data.invoices = [];
        if (typeof data.nextInvoiceCounter !== 'number') data.nextInvoiceCounter = 1;
        if (typeof data.invoicePrefix !== 'string') data.invoicePrefix = SEED_STATE.invoicePrefix;
        if (typeof data.nextDebtorNumber !== 'number') data.nextDebtorNumber = SEED_STATE.nextDebtorNumber;

        // Migration: Strukturierte Adressen
        if (data.issuer && (data.issuer as any).address && !data.issuer.street) {
          const lines = (data.issuer as any).address.split('\n');
          data.issuer.street = lines[0]?.trim() || '';
          data.issuer.city   = lines.slice(1).join(', ').trim() || '';
        }
        data.customers?.forEach((c: any) => {
          if (c.address && !c.street) {
            const lines = c.address.split('\n');
            c.street = lines[0]?.trim() || '';
            c.city   = lines.slice(1).join(', ').trim() || '';
          }
          if (!c.debtorNumber) {
            c.debtorNumber = String(data!.nextDebtorNumber);
            data!.nextDebtorNumber++;
          }
        });

        // Crash Recovery — Timer lief beim Schließen → verstrichene Zeit retten
        if (data.isRunning && data.startedAt) {
          const crashed = Math.floor((Date.now() - data.startedAt) / 1000);
          data = { ...data, isRunning: false, startedAt: null, elapsedBefore: data.elapsedBefore + crashed };
        }
        setState(data);
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
    <AppStateContext.Provider value={{ state, setState }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}
