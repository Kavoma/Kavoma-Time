import { useState } from 'react';
import { Receipt, FileSignature, FileText, LineChart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExportView } from './ExportView';
import { VendorInvoicesTab } from '../components/finance/VendorInvoicesTab';
import { ContractsTab } from '../components/finance/ContractsTab';
import { AnalyticsTabPlaceholder } from '../components/finance/AnalyticsTabPlaceholder';

type FinanceTab = 'invoices' | 'vendor' | 'contracts' | 'analytics';

const TABS: { id: FinanceTab; label: string; icon: typeof Receipt }[] = [
  { id: 'invoices', label: 'Rechnungen', icon: Receipt },
  { id: 'vendor', label: 'Eingangsrechnungen', icon: FileText },
  { id: 'contracts', label: 'Verträge', icon: FileSignature },
  { id: 'analytics', label: 'Auswertung', icon: LineChart },
];

export function FinanceView() {
  const [tab, setTab] = useState<FinanceTab>('invoices');

  return (
    <>
      <div className="mb-8 flex items-center gap-1 rounded-lg border border-divider bg-surface p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                isActive ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="finance-tab-pill"
                  className="absolute inset-0 rounded-md bg-paper shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                  transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon size={13} />
                {t.label}
              </span>
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
          {tab === 'invoices' && <ExportView />}
          {tab === 'vendor' && <VendorInvoicesTab />}
          {tab === 'contracts' && <ContractsTab />}
          {tab === 'analytics' && <AnalyticsTabPlaceholder />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
