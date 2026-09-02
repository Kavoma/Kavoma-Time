import { useEffect, useMemo, useState } from 'react';
import {
  Plus, FileSignature,
} from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { SearchField } from '../SearchField';
import { FilterButton, FilterSection, FilterChoice } from '../FilterButton';
import { Attachment, Contract } from '../../types';
import { ContractUploadModal } from './ContractUploadModal';
import { PdfViewerModal } from './PdfViewerModal';
import { deletePdf, formatFileSize } from '../../utils/attachments';

interface Props {
  initialCustomerFilter?: number;
  onInitialFilterConsumed?: () => void;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('de-DE');
}

export function ContractsTab({ initialCustomerFilter, onInitialFilterConsumed }: Props = {}) {
  const { state, setState } = useAppState();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [customerFilter, setCustomerFilter] = useState<number>(initialCustomerFilter ?? 0);
  const [search, setSearch] = useState('');

  // Wenn von außen ein Vorfilter reinkommt (z. B. Sprung von der Kunden-Liste),
  // einmalig übernehmen und consumeren.
  useEffect(() => {
    if (typeof initialCustomerFilter === 'number') {
      setCustomerFilter(initialCustomerFilter);
      onInitialFilterConsumed?.();
    }
  }, [initialCustomerFilter, onInitialFilterConsumed]);

  const contracts = state?.contracts ?? [];
  const attachments = state?.attachments ?? [];
  const customers = state?.customers ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...contracts]
      .filter((c) => customerFilter === 0 || c.customerId === customerFilter)
      .filter((c) => {
        if (!term) return true;
        return c.title.toLowerCase().includes(term) || (c.note ?? '').toLowerCase().includes(term);
      })
      .sort((a, b) => b.signedAt - a.signedAt);
  }, [contracts, customerFilter, search]);

  const viewer = viewerId !== null ? contracts.find((c) => c.id === viewerId) : null;
  const viewerAttachment = viewer ? attachments.find((a) => a.id === viewer.attachmentId) ?? null : null;

  const handleSave = (contract: Contract, attachment: Attachment) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        attachments: [...s.attachments, attachment],
        contracts: [...s.contracts, contract],
      };
    });
  };

  const handleDelete = async (id: number) => {
    const target = contracts.find((c) => c.id === id);
    if (!target) return;
    try {
      await deletePdf(target.attachmentId);
      setState((s) => {
        if (!s) return s;
        return {
          ...s,
          contracts: s.contracts.filter((c) => c.id !== id),
          attachments: s.attachments.filter((a) => a.id !== target.attachmentId),
        };
      });
      setViewerId(null);
    } catch (e) {
      console.error('Konnte Anhang nicht löschen — State unverändert:', e);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Verträge</h2>
          <p className="mt-1 text-[12px] text-muted">
            Unterschriebene Kundenverträge als PDF archivieren — verschlüsselt lokal abgelegt.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          disabled={customers.length === 0}
          className="flex cursor-pointer items-center gap-2 rounded-md bg-ink px-3 py-2 text-xs font-bold text-paper transition-colors hover:bg-paper hover:text-ink hover:ring-2 hover:ring-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={13} /> Vertrag hochladen
        </button>
      </div>

      <div className="kv-toolbar mb-4">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Verträge durchsuchen"
        />

        <FilterButton
          activeCount={customerFilter === 0 ? 0 : 1}
          onReset={() => setCustomerFilter(0)}
        >
          <FilterSection title="Kunde">
            <FilterChoice
              role="radio"
              label="Alle Kunden"
              checked={customerFilter === 0}
              onToggle={() => setCustomerFilter(0)}
            />
            {customers.map((c) => (
              <FilterChoice
                key={c.id}
                role="radio"
                label={c.name}
                checked={customerFilter === c.id}
                onToggle={() => setCustomerFilter(c.id)}
              />
            ))}
          </FilterSection>
        </FilterButton>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-divider bg-surface/40 p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-paper text-muted">
            <FileSignature size={20} />
          </div>
          <div className="text-sm font-bold">Noch keine Verträge archiviert</div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted">
            Lade unterschriebene Verträge hoch, damit du sie später beim Kunden wiederfindest.
            Dateien werden AES-256 verschlüsselt im Benutzerprofil abgelegt.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((c) => {
            const customer = customers.find((cu) => cu.id === c.customerId);
            const att = attachments.find((a) => a.id === c.attachmentId);
            const expired = c.validUntil ? c.validUntil < Date.now() : false;
            return (
              <button
                key={c.id}
                onClick={() => setViewerId(c.id)}
                className="group cursor-pointer kv-card p-5 text-left transition-colors hover:border-muted hover:bg-paper/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-display text-base font-bold">{c.title}</div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">{customer?.name ?? 'Unbekannter Kunde'}</div>
                  </div>
                  <FileSignature size={16} className="shrink-0 text-muted group-hover:text-ink" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="text-muted">Unterzeichnet</div>
                    <div className="mt-0.5 tabular-nums">{formatDate(c.signedAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted">Gültig bis</div>
                    <div className={`mt-0.5 tabular-nums ${expired ? 'text-warning' : ''}`}>
                      {c.validUntil ? formatDate(c.validUntil) : '—'}
                    </div>
                  </div>
                </div>
                {att && (
                  <div className="mt-3 text-[10px] uppercase tracking-widest text-muted">
                    {att.filename} · {formatFileSize(att.sizeBytes)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ContractUploadModal
        open={uploadOpen}
        customers={customers}
        onClose={() => setUploadOpen(false)}
        onSave={handleSave}
      />

      <PdfViewerModal
        open={viewer !== null && viewerAttachment !== null}
        attachment={viewerAttachment}
        title={viewer ? viewer.title : undefined}
        onClose={() => setViewerId(null)}
        onDelete={viewer ? () => handleDelete(viewer.id) : undefined}
      />
    </>
  );
}
