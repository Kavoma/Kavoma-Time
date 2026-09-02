import { useEffect, useState } from 'react';
import { Receipt, FileSignature, FileText, LineChart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExportView } from './ExportView';
import { VendorInvoicesTab } from '../components/finance/VendorInvoicesTab';
import { ContractsTab } from '../components/finance/ContractsTab';
import { AnalyticsTab } from '../components/finance/AnalyticsTab';
import type { NavIntent, ViewKey } from '../App';

export type FinanceTab = 'invoices' | 'vendor' | 'contracts' | 'analytics';

const TABS: { id: FinanceTab; label: string; icon: typeof Receipt }[] = [
  { id: 'invoices', label: 'Rechnungen', icon: Receipt },
  { id: 'vendor', label: 'Eingangsrechnungen', icon: FileText },
  { id: 'contracts', label: 'Verträge', icon: FileSignature },
  { id: 'analytics', label: 'Auswertung', icon: LineChart },
];

export interface FinanceNavIntent {
  tab?: FinanceTab;
  customerFilter?: number;
  /** Öffnet im Rechnungen-Tab direkt den Detail-Drawer dieser Rechnung. */
  invoiceId?: string;
}

interface Props {
  intent?: FinanceNavIntent | null;
  navigateTo?: (view: ViewKey, intent?: NavIntent) => void;
  onIntentConsumed?: () => void;
}

export function FinanceView({ intent, navigateTo, onIntentConsumed }: Props = {}) {
  const [tab, setTab] = useState<FinanceTab>('invoices');
  const [pendingCustomerFilter, setPendingCustomerFilter] = useState<number | undefined>(undefined);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | undefined>(undefined);

  // Intent konsumieren (nur einmal pro Intent-Ref-Wechsel)
  useEffect(() => {
    if (!intent) return;
    if (intent.tab) setTab(intent.tab);
    if (typeof intent.customerFilter === 'number') {
      setPendingCustomerFilter(intent.customerFilter);
    }
    if (typeof intent.invoiceId === 'string') {
      setPendingInvoiceId(intent.invoiceId);
    }
    onIntentConsumed?.();
  }, [intent, onIntentConsumed]);

  return (
    <>
      {/* Reiter — dasselbe Muster wie in den Einstellungen. Vorher war es
          hier eine gefuellte Pille, dort ein Unterstrich: zwei Loesungen
          fuer dieselbe Aufgabe. */}
      <div role="tablist" aria-label="Finanz-Bereiche" className="kv-tabs mb-8">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.id)}
              className="kv-tab"
            >
              <Icon size={14} aria-hidden="true" />
              {t.label}
              {isActive && (
                <motion.div
                  layoutId="finance-tab-marker"
                  className="kv-tab-marker"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'invoices' && (
            <ExportView
              navigateTo={navigateTo}
              initialInvoiceId={pendingInvoiceId}
              onInitialInvoiceConsumed={() => setPendingInvoiceId(undefined)}
            />
          )}
          {tab === 'vendor' && <VendorInvoicesTab />}
          {tab === 'contracts' && (
            <ContractsTab
              initialCustomerFilter={pendingCustomerFilter}
              onInitialFilterConsumed={() => setPendingCustomerFilter(undefined)}
            />
          )}
          {tab === 'analytics' && <AnalyticsTab />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
