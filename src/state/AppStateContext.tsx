import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState } from '../types';
import { runTimerCommand, startTimerWith, TimerCommand, QuickStartTarget } from '../utils/timerActions';
import { evaluateRecurringInvoices } from '../utils/recurring';
import { diffState } from '../sync/diff';
import { applyOps } from '../sync/merge';
import type { Op } from '../sync/types';
import { stampChanges } from '../sync/stamp';
import { resolveDeviceInfo } from '../sync/device';
import { timestampFromId } from '../sync/ids';

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
  vatId: '',
  country: 'DE',
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
  eInvoiceEnabled: true,
  syncTombstones: [],
  syncConflicts: [],
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
  if (typeof migrated.stopOnShutdownEnabled !== 'boolean') migrated.stopOnShutdownEnabled = true;
  // Benachrichtigungen bewusst opt-in: ungefragt zu poppen ist übergriffig.
  if (typeof migrated.endOfDayReminderEnabled !== 'boolean') migrated.endOfDayReminderEnabled = false;
  if (typeof migrated.endOfDayReminderHour !== 'number') migrated.endOfDayReminderHour = 18;
  if (typeof migrated.endOfDayReminderMinute !== 'number') migrated.endOfDayReminderMinute = 30;
  migrated.endOfDayReminderHour = Math.min(23, Math.max(0, migrated.endOfDayReminderHour));
  migrated.endOfDayReminderMinute = Math.min(59, Math.max(0, migrated.endOfDayReminderMinute));

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

  // ZUGFeRD — Einbettung ist Default an
  if (typeof migrated.eInvoiceEnabled !== 'boolean') migrated.eInvoiceEnabled = true;

  // Gerätesynchronisation — ohne Defaults stürzt die App bei alten Backups ab
  if (!Array.isArray(migrated.syncTombstones)) migrated.syncTombstones = [];
  if (!Array.isArray(migrated.syncConflicts)) migrated.syncConflicts = [];
  if (!migrated.syncVersions || typeof migrated.syncVersions !== 'object') migrated.syncVersions = {};
  // Der Zähler muss den Neustart überleben. Fiele er auf 0 zurück, trügen die
  // nächsten Änderungen dieses Geräts niedrigere Stände als die bereits
  // abgeglichenen — und verlören beim Zusammenführen gegen ältere Daten.
  if (!Number.isFinite(migrated.syncLamport) || migrated.syncLamport < 0) migrated.syncLamport = 0;

  // E-Rechnung: `taxId` war früher ein Sammelfeld für Steuernummer UND USt-IdNr.
  // Sah es wie eine USt-IdNr. aus (Ländercode + Ziffern), übernehmen wir es
  // einmalig in das neue, für das XML nötige `vatId`-Feld.
  if (migrated.issuer && !migrated.issuer.vatId && typeof migrated.issuer.taxId === 'string') {
    const compact = migrated.issuer.taxId.replace(/\s+/g, '').toUpperCase();
    if (/^[A-Z]{2}[0-9A-Z]{6,}$/.test(compact)) {
      migrated.issuer.vatId = compact;
      migrated.issuer.taxId = '';
    }
  }
  if (migrated.issuer && !migrated.issuer.country) migrated.issuer.country = 'DE';

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
    // E-Rechnung: Land ist Pflichtangabe im XML
    if (!c.country) c.country = 'DE';
    // Die alte Einverständnis-Spur für PDF-Rechnungen ist mit der
    // E-Rechnungspflicht hinfällig — Felder aus Alt-Backups entfernen.
    delete c.eInvoiceAccepted;
    delete c.eInvoiceConsentDate;

    // V1.5 — neue Customer-Felder mit Defaults
    if (!c.status) c.status = 'active';
    if (!Array.isArray(c.tags)) c.tags = [];
    if (typeof c.notes !== 'string') c.notes = '';
    if (typeof c.createdAt !== 'number') {
      // Legacy: id war Date.now() bei Anlage → als Fallback nutzen
      c.createdAt = typeof c.id === 'number' && c.id > 1000000000000 ? timestampFromId(c.id) : 0;
    }
  });

  // V1.5 — neue Project-Felder mit Defaults
  migrated.projects?.forEach((p: any) => {
    if (!p.status) p.status = 'active';
    if (!Array.isArray(p.tags)) p.tags = [];
    if (!p.priority) p.priority = 'normal';
    if (!Array.isArray(p.milestones)) p.milestones = [];
    if (typeof p.createdAt !== 'number') {
      p.createdAt = typeof p.id === 'number' && p.id > 1000000000000 ? timestampFromId(p.id) : 0;
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
  const [state, setStateRaw] = useState<AppState | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreNonce, setRestoreNonce] = useState(0);
  const skipNextPersistRef = useRef(false);
  const isTimerOverlay = new URLSearchParams(window.location.search).get('overlay') === 'timer';

  // Zuletzt als „bekannt" verbuchter Stand. Der Unterschied zum neuen State
  // ergibt das Änderungsprotokoll — siehe `src/sync/diff.ts`.
  const prevSyncedRef = useRef<AppState | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  /**
   * Der `setState`, den die ganze App benutzt — mit einem Zusatz: Er hält fest,
   * welche Entität wann geändert wurde.
   *
   * Der Stempel entsteht bewusst *im* Updater und nicht in einem Effekt
   * danach. Nur so bleiben Daten und Versionstabelle im selben Schritt
   * konsistent, und nur so muss keine der über 60 Aufrufstellen etwas davon
   * wissen. Der Updater bleibt dabei rein — React 19 ruft ihn im StrictMode
   * zweimal auf und erwartet beide Male dasselbe Ergebnis.
   */
  const setState = useCallback<React.Dispatch<React.SetStateAction<AppState | null>>>((action) => {
    setStateRaw((prev) => {
      const next = typeof action === 'function'
        ? (action as (p: AppState | null) => AppState | null)(prev)
        : action;
      if (next === prev) return next;
      return stampChanges(prev, next, deviceIdRef.current);
    });
  }, []);

  const restoreBackup = async (data: AppState) => {
    setIsRestoring(true);
    // Gib der Animation Zeit zu starten
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Ein eingespieltes Backup ist keine Änderung, sondern ein neuer
    // Ausgangspunkt: Die Versionstabelle des fremden Geräts wird verworfen,
    // der Zähler bleibt stehen (er wird beim nächsten Abgleich ohnehin über
    // den höchsten fremden Stand gezogen).
    const migrated = migrateData(data);
    prevSyncedRef.current = migrated;
    setStateRaw({ ...migrated, syncVersions: {} });

    // Gib der Animation Zeit zum Verweilen
    await new Promise(resolve => setTimeout(resolve, 1200));
    setIsRestoring(false);
    // Force-Remount: Views mit lokalem State auf den neuen Datenstand zwingen
    setRestoreNonce(n => n + 1);
  };

  // Geräte-Kennung einmalig holen
  useEffect(() => {
    if (isTimerOverlay) return;
    resolveDeviceInfo()
      .then((info) => { deviceIdRef.current = info.id; })
      .catch(() => { /* ohne Kennung wird eben nichts protokolliert */ });
  }, []);

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
        // Rohsetzer: Laden ist keine Änderung und darf nichts stempeln.
        prevSyncedRef.current = migrated;
        setStateRaw(migrated);
      } else {
        prevSyncedRef.current = SEED_STATE;
        setStateRaw(SEED_STATE);
      }
    }
    loadData();
  }, []);

  // Persistieren bei jeder Änderung — und derselbe Flaschenhals, aus dem das
  // Änderungsprotokoll abgeleitet wird.
  useEffect(() => {
    if (!state) return;
    if (isTimerOverlay) return;

    const previous = prevSyncedRef.current;
    prevSyncedRef.current = state;

    // Kam die Änderung aus einem anderen Fenster, hat jenes sie bereits
    // protokolliert. `prevSyncedRef` ist oben trotzdem nachgezogen, sonst
    // meldete der nächste Diff die fremde Änderung ein zweites Mal.
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    if (window.api) window.api.saveData(STORAGE_KEY, state);
    else            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const deviceId = deviceIdRef.current;
    if (!previous || !deviceId) return;

    // Der Zähler steht schon im State — `stampChanges` hat ihn beim Setzen
    // weitergedreht. Hier wird nur noch abgeleitet, was zu übertragen wäre.
    const ops = diffState(previous, state, deviceId, state.syncLamport ?? 0);
    if (ops.length === 0) return;

    // Der Motor im Main-Prozess verschlüsselt und lädt hoch. Ist keine
    // Synchronisierung eingerichtet, wirft er die Ops weg — der Renderer muss
    // das nicht wissen.
    window.api?.syncEnqueue?.(ops).catch((e) => {
      console.warn('Änderungen konnten nicht übergeben werden:', e?.message ?? e);
    });
  }, [state]);

  // Fremde Änderungen einspielen.
  //
  // Der Merge läuft im Updater, damit er auf dem tatsächlich aktuellen Stand
  // aufsetzt und nicht auf einem, der zwischenzeitlich veraltet ist. Der
  // Stempel-Wrapper wird bewusst umgangen: Eine fremde Änderung ist keine
  // eigene und darf keine neuen Ops erzeugen — deshalb `prevSyncedRef` **vor**
  // dem Setzen nachziehen, sonst dreht sich die Echo-Schleife.
  useEffect(() => {
    if (isTimerOverlay) return;
    if (!window.api?.onSyncOps) return;

    return window.api.onSyncOps((incoming) => {
      const ops = incoming as Op[];
      if (!Array.isArray(ops) || ops.length === 0) return;

      setStateRaw((prev) => {
        if (!prev) return prev;
        const { state: merged, conflicts } = applyOps(prev, ops);
        prevSyncedRef.current = merged;
        if (conflicts.length > 0 && import.meta.env.DEV) {
          console.debug(`[sync] ${conflicts.length} Konflikt(e)`, conflicts);
        }
        return merged;
      });
    });
  }, []);

  useEffect(() => {
    if (!window.api?.onStoreUpdated) return;

    return window.api.onStoreUpdated((key, data) => {
      if (key !== STORAGE_KEY) return;
      skipNextPersistRef.current = true;
      // Das andere Fenster hat bereits gestempelt — der Stand kommt fertig an.
      setStateRaw(migrateData(data, { recoverRunningTimer: false }));
    });
  }, []);

  useEffect(() => {
    if (isTimerOverlay) return;
    if (!window.api?.onTimerCommand && !window.api?.onHotkeyToggle) return;

    const runCommand = (command: TimerCommand, effectiveNow?: number) => {
      setState(s => s ? runTimerCommand(s, command, effectiveNow) : null);
    };

    // Schnellstart aus der Menüleiste: Kunde, Projekt und Tätigkeit setzen und
    // sofort loslaufen — ohne dass die App dafür geöffnet werden muss.
    const runQuickStart = (target: QuickStartTarget) => {
      setState(s => s ? startTimerWith(s, target) : null);
    };

    const cleanupTimerCommand = window.api?.onTimerCommand?.(runCommand);
    const cleanupHotkey = window.api?.onHotkeyToggle?.(() => runCommand('toggle'));
    const cleanupQuickStart = window.api?.onTimerQuickStart?.(runQuickStart);

    return () => {
      cleanupTimerCommand?.();
      cleanupHotkey?.();
      cleanupQuickStart?.();
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
