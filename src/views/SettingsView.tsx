import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Sliders, Palette, Receipt, Database, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ConfirmRestoreModal } from '../components/ConfirmRestoreModal';
import { ConfirmWipeModal } from '../components/ConfirmWipeModal';
import { LegalModal, type LegalDocument } from '../components/LegalModal';
import { TemplateManagementModal } from '../components/TemplateManagementModal';
import { GeneralTab } from '../components/settings/GeneralTab';
import { AppearanceTab } from '../components/settings/AppearanceTab';
import { InvoicesTab } from '../components/settings/InvoicesTab';
import { DataTab } from '../components/settings/DataTab';
import { AboutTab } from '../components/settings/AboutTab';
import { useAppState } from '../state/AppStateContext';

type TabKey = 'general' | 'appearance' | 'invoices' | 'data' | 'about';

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  subtitle: string;
}

const TABS: ReadonlyArray<TabDef> = [
  { key: 'general',    label: 'Allgemein',   icon: Sliders,  subtitle: 'Workflow, Timer und Tastenkürzel' },
  { key: 'appearance', label: 'Darstellung', icon: Palette,  subtitle: 'Thema und Akzentfarbe' },
  { key: 'invoices',   label: 'Rechnungen',  icon: Receipt,  subtitle: 'Nummernkreis, Vorlagen und Absender' },
  { key: 'data',     label: 'Daten',      icon: Database, subtitle: 'Backup, Export und DSGVO' },
  { key: 'about',    label: 'Über',       icon: Info,     subtitle: 'Updates, System und Rechtliches' },
];

const TAB_STORAGE_KEY = 'kavoma_settings_tab';

function isTabKey(v: unknown): v is TabKey {
  return v === 'general' || v === 'appearance' || v === 'invoices' || v === 'data' || v === 'about';
}

function loadInitialTab(): TabKey {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    return isTabKey(raw) ? raw : 'general';
  } catch {
    return 'general';
  }
}

export function SettingsView() {
  const { state, setState, restoreBackup, restoreNonce } = useAppState();
  const [activeTab, setActiveTab] = useState<TabKey>(loadInitialTab);

  // Modal-States — leben hier, damit sie unabhängig vom aktiven Tab persistieren
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<{ open: boolean; doc: LegalDocument }>({ open: false, doc: 'imprint' });
  const [pendingBackupData, setPendingBackupData] = useState<any>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Tab-Persistenz
  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, activeTab); } catch { /* localStorage gesperrt */ }
  }, [activeTab]);

  // Nach Backup-Restore: zurück auf 'general' (sicherer Default)
  useEffect(() => {
    if (restoreNonce > 0) setActiveTab('general');
  }, [restoreNonce]);

  // Keyboard-Navigation in der Tab-Bar: ←/→
  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = (idx + dir + TABS.length) % TABS.length;
    setActiveTab(TABS[next].key);
    const btn = document.getElementById(`settings-tab-${TABS[next].key}`);
    btn?.focus();
  };

  // Template + Recurring Management (bleibt im Parent, da modal hier sitzt)
  const handleDeleteTemplate = (id: string) => {
    setState(s => s ? { ...s, invoiceTemplates: s.invoiceTemplates.filter(t => t.id !== id) } : null);
  };
  const handleDeleteRecurring = (id: string) => {
    setState(s => s ? { ...s, recurringInvoices: s.recurringInvoices.filter(r => r.id !== id) } : null);
  };
  const handleToggleRecurring = (id: string) => {
    setState(s => s ? {
      ...s,
      recurringInvoices: s.recurringInvoices.map(r => r.id === id ? { ...r, active: !r.active } : r),
    } : null);
  };

  if (!state) return null;

  const currentTab = TABS.find(t => t.key === activeTab) ?? TABS[0];

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight leading-none">Einstellungen</h2>
          <p className="mt-1.5 text-xs text-muted">{currentTab.subtitle}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Settings size={18} className="text-muted" />
        </div>
      </div>

      {/* Tab-Bar */}
      <div role="tablist" aria-label="Einstellungs-Kategorien" className="mb-6 flex items-center gap-1 border-b border-divider">
        {TABS.map((tab, idx) => {
          const isActive = tab.key === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              id={`settings-tab-${tab.key}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`relative flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${ isActive ? 'text-ink' : 'text-muted hover:text-ink' }`}
            >
              <Icon size={14} aria-hidden="true" />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="settings-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-ink"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab-Content mit Crossfade */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'invoices' && (
            <InvoicesTab onOpenTemplateModal={() => setTemplateModalOpen(true)} />
          )}
          {activeTab === 'data' && (
            <DataTab
              onRequestRestore={(data) => {
                setPendingBackupData(data);
                setIsRestoreModalOpen(true);
              }}
              onRequestWipe={() => setIsWipeModalOpen(true)}
            />
          )}
          {activeTab === 'about' && (
            <AboutTab onOpenLegal={(doc) => setLegalModal({ open: true, doc })} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Modals — global gemounted, tab-unabhängig */}
      <ConfirmRestoreModal
        open={isRestoreModalOpen}
        onCancel={() => {
          setIsRestoreModalOpen(false);
          setPendingBackupData(null);
        }}
        onConfirm={async () => {
          if (pendingBackupData) {
            setIsRestoreModalOpen(false);
            await restoreBackup(pendingBackupData);
            setPendingBackupData(null);
          }
        }}
      />

      <ConfirmWipeModal
        open={isWipeModalOpen}
        onCancel={() => setIsWipeModalOpen(false)}
        onConfirm={async () => {
          if (typeof window.api?.wipeAllData !== 'function') {
            setIsWipeModalOpen(false);
            alert('Datenlöschung nicht verfügbar (kein Electron-Kontext). Bitte App manuell deinstallieren.');
            return;
          }
          try {
            await window.api.wipeAllData();
          } catch (e) {
            console.error(e);
            alert('Daten konnten nicht vollständig gelöscht werden. Bitte App manuell deinstallieren oder den AppData-Ordner entfernen.');
            setIsWipeModalOpen(false);
          }
        }}
      />

      <LegalModal
        open={legalModal.open}
        initial={legalModal.doc}
        onClose={() => setLegalModal((prev) => ({ ...prev, open: false }))}
      />

      <TemplateManagementModal
        open={templateModalOpen}
        templates={state.invoiceTemplates}
        recurrings={state.recurringInvoices}
        customers={state.customers}
        onDelete={handleDeleteTemplate}
        onDeleteRecurring={handleDeleteRecurring}
        onToggleRecurring={handleToggleRecurring}
        onClose={() => setTemplateModalOpen(false)}
      />
    </>
  );
}
