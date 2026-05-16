import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState } from '../types';
import { runTimerCommand, TimerCommand } from '../utils/timerActions';
import { evaluateRecurringInvoices } from '../utils/recurring';

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
  timerOverlayEnabled: true,
  afkPauseEnabled: true,
  afkTimeoutMinutes: 10,
  attachments: [],
  vendorInvoices: [],
  contracts: [],
  nextVendorInvoiceId: 1,
  nextContractId: 1,
  invoiceTemplates: [],
  recurringInvoices: [],
  nextTemplateId: 1,
  nextRecurringId: 1,
};

interface ContextValue {
  state: AppState | null;
  setState: React.Dispatch<React.SetStateAction<AppState | null>>;
  isRestoring: boolean;
  restoreBackup: (data: AppState) => Promise<void>;
  /**
   * Inkrementiert nach jedem erfolgreichen restoreBackup. Wird in App.tsx
   * an den View-Key gehängt, damit Komponenten mit lokalem State (Filter,
   * Issuer-Kopien, Selects) nach einem Restore frisch gemountet werden und
   * sofort die neuen Daten anzeigen, statt am alten Zustand zu hängen.
   */
  restoreNonce: number;
}

const AppStateContext = createContext<ContextValue | null>(null);

function migrateData(data: any, { recoverRunningTimer = true } = {}): AppState {
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
  if (typeof migrated.timerOverlayEnabled !== 'boolean') migrated.timerOverlayEnabled = true;
  if (typeof migrated.afkPauseEnabled !== 'boolean') migrated.afkPauseEnabled = true;
  if (typeof migrated.afkTimeoutMinutes !== 'number') migrated.afkTimeoutMinutes = 10;
  migrated.afkTimeoutMinutes = Math.min(240, Math.max(1, migrated.afkTimeoutMinutes));

  // Finanzen-Modul (Anhänge / Eingangsrechnungen / Verträge)
  if (!Array.isArray(migrated.attachments)) migrated.attachments = [];
  if (!Array.isArray(migrated.vendorInvoices)) migrated.vendorInvoices = [];
  if (!Array.isArray(migrated.contracts)) migrated.contracts = [];
  if (!Number.isFinite(migrated.nextVendorInvoiceId)) {
    const maxId = migrated.vendorInvoices.reduce((m: number, v: any) => Math.max(m, Number(v.id) || 0), 0);
    migrated.nextVendorInvoiceId = Math.max(1, maxId + 1);
  }
  if (!Number.isFinite(migrated.nextContractId)) {
    const maxId = migrated.contracts.reduce((m: number, c: any) => Math.max(m, Number(c.id) || 0), 0);
    migrated.nextContractId = Math.max(1, maxId + 1);
  }

  // Phase 1.5 — Rechnungs-Vorlagen + Wiederkehrende Rechnungen
  if (!Array.isArray(migrated.invoiceTemplates)) migrated.invoiceTemplates = [];
  if (!Array.isArray(migrated.recurringInvoices)) migrated.recurringInvoices = [];
  if (typeof migrated.nextTemplateId !== 'number') migrated.nextTemplateId = 1;
  if (typeof migrated.nextRecurringId !== 'number') migrated.nextRecurringId = 1;

  // InvoiceItem.kind aus 'unit' ableiten für alte Daten (nicht-destruktiv,
  // wird nur als Default gesetzt, falls fehlend — Backups bleiben gültig)
  migrated.invoices?.forEach((inv: any) => {
    if (Array.isArray(inv.items)) {
      inv.items.forEach((it: any) => {
        if (!it.kind) {
          it.kind = it.unit === 'h' ? 'time' : 'flat';
        }
      });
    }
  });

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
  if (recoverRunningTimer && migrated.isRunning && migrated.startedAt) {
    const crashed = Math.floor((Date.now() - migrated.startedAt) / 1000);
    return { ...migrated, isRunning: false, startedAt: null, elapsedBefore: migrated.elapsedBefore + crashed };
  }

  return migrated;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreNonce, setRestoreNonce] = useState(0);
  const skipNextPersistRef = useRef(false);
  const isTimerOverlay = new URLSearchParams(window.location.search).get('overlay') === 'timer';

  const restoreBackup = async (data: AppState) => {
    setIsRestoring(true);
    // Gib der Animation Zeit zu starten
    await new Promise(resolve => setTimeout(resolve, 1000));

    const migrated = migrateData(data);
    setState(migrated);

    // Gib der Animation Zeit zum Verweilen
    await new Promise(resolve => setTimeout(resolve, 1200));
    setIsRestoring(false);
    // Force-Remount: Views mit lokalem State auf den neuen Datenstand zwingen
    setRestoreNonce(n => n + 1);
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
        let migrated = migrateData(data, { recoverRunningTimer: !isTimerOverlay });
        // Phase 1.5: Beim Start fällige wiederkehrende Rechnungen als Drafts
        // materialisieren. Pure Function, keine Side-Effects.
        if (!isTimerOverlay) {
          const evalResult = evaluateRecurringInvoices(Date.now(), migrated);
          if (evalResult.generatedCount > 0) {
            migrated = evalResult.state;
          }
        }
        setState(migrated);
      } else {
        setState(SEED_STATE);
      }
    }
    loadData();
  }, []);

  // Persistieren bei jeder Änderung
  useEffect(() => {
    if (!state) return;
    if (isTimerOverlay) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (window.api) window.api.saveData(STORAGE_KEY, state);
    else            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!window.api?.onStoreUpdated) return;

    return window.api.onStoreUpdated((key, data) => {
      if (key !== STORAGE_KEY) return;
      skipNextPersistRef.current = true;
      setState(migrateData(data, { recoverRunningTimer: false }));
    });
  }, []);

  useEffect(() => {
    if (isTimerOverlay) return;
    if (!window.api?.onTimerCommand && !window.api?.onHotkeyToggle) return;

    const runCommand = (command: TimerCommand, effectiveNow?: number) => {
      setState(s => s ? runTimerCommand(s, command, effectiveNow) : null);
    };

    const cleanupTimerCommand = window.api?.onTimerCommand?.(runCommand);
    const cleanupHotkey = window.api?.onHotkeyToggle?.(() => runCommand('toggle'));

    return () => {
      cleanupTimerCommand?.();
      cleanupHotkey?.();
    };
  }, []);

  return (
    <AppStateContext.Provider value={{ state, setState, isRestoring, restoreBackup, restoreNonce }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}
