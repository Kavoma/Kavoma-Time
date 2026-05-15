import { useMemo, useState } from 'react';
import { Plus, FileText, Search, Filter, FileSpreadsheet } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { Attachment, VendorInvoice, VendorInvoiceCategory } from '../../types';
import { VendorInvoiceUploadModal } from './VendorInvoiceUploadModal';
import { PdfViewerModal } from './PdfViewerModal';
import { deletePdf, formatFileSize } from '../../utils/attachments';

const CATEGORY_LABELS: Record<VendorInvoiceCategory, string> = {
  hardware: 'Hardware',
  software: 'Software',
  office: 'Büro',
  travel: 'Reise',
  service: 'Dienstleistung',
  other: 'Sonstiges',
};

const CATEGORY_COLORS: Record<VendorInvoiceCategory, string> = {
  hardware: 'bg-sky-500/15 text-sky-200',
  software: 'bg-violet-500/15 text-violet-200',
  office: 'bg-amber-500/15 text-amber-200',
  travel: 'bg-emerald-500/15 text-emerald-200',
  service: 'bg-pink-500/15 text-pink-200',
  other: 'bg-divider text-muted',
};

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('de-DE');
}

export function VendorInvoicesTab() {
  const { state, setState } = useAppState();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | VendorInvoiceCategory>('all');

  const vendorInvoices = state?.vendorInvoices ?? [];
  const attachments = state?.attachments ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...vendorInvoices]
      .filter((v) => categoryFilter === 'all' || v.category === categoryFilter)
      .filter((v) => {
        if (!term) return true;
        return (
          v.vendorName.toLowerCase().includes(term) ||
          (v.invoiceNumber ?? '').toLowerCase().includes(term) ||
          (v.note ?? '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.invoiceDate - a.invoiceDate);
  }, [vendorInvoices, search, categoryFilter]);

  const totals = useMemo(() => {
    const gross = filtered.reduce((s, v) => s + v.amountGross, 0);
    const vat = filtered.reduce((s, v) => s + (v.vatAmount ?? 0), 0);
    return { gross, vat, net: gross - vat };
  }, [filtered]);

  const viewer = viewerId !== null ? vendorInvoices.find((v) => v.id === viewerId) : null;
  const viewerAttachment = viewer ? attachments.find((a) => a.id === viewer.attachmentId) ?? null : null;

  const handleSave = (vendor: VendorInvoice, attachment: Attachment) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        attachments: [...s.attachments, attachment],
        vendorInvoices: [...s.vendorInvoices, vendor],
        nextVendorInvoiceId: vendor.id + 1,
      };
    });
  };

  const handleDelete = async (id: number) => {
    const target = vendorInvoices.find((v) => v.id === id);
    if (!target) return;
    try {
      await deletePdf(target.attachmentId);
    } catch (e) {
      console.error('Konnte Anhang nicht löschen:', e);
    }
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        vendorInvoices: s.vendorInvoices.filter((v) => v.id !== id),
        attachments: s.attachments.filter((a) => a.id !== target.attachmentId),
      };
    });
    setViewerId(null);
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    const header = ['Datum', 'Lieferant', 'Beleg-Nr.', 'Kategorie', 'Brutto (EUR)', 'USt (EUR)', 'Netto (EUR)', 'Notiz'];
    const rows = filtered.map((v) => [
      formatDate(v.invoiceDate),
      v.vendorName,
      v.invoiceNumber ?? '',
      CATEGORY_LABELS[v.category],
      v.amountGross.toFixed(2).replace('.', ','),
      (v.vatAmount ?? 0).toFixed(2).replace('.', ','),
      (v.amountGross - (v.vatAmount ?? 0)).toFixed(2).replace('.', ','),
      (v.note ?? '').replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell)}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eingangsrechnungen-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Eingangsrechnungen</h2>
          <p className="mt-1 text-[12px] text-muted">
            Belege von Lieferanten als PDF dokumentieren — verschlüsselt im Benutzerprofil gespeichert.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet size={13} /> CSV
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-md bg-ink px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-paper hover:text-ink hover:ring-2 hover:ring-ink active:scale-95"
          >
            <Plus size={13} /> Beleg hochladen
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-divider bg-surface px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Brutto gesamt</div>
          <div className="mt-1 font-display text-lg font-bold tabular-nums">{EUR.format(totals.gross)}</div>
        </div>
        <div className="rounded-lg border border-divider bg-surface px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted">davon USt</div>
          <div className="mt-1 font-display text-lg font-bold tabular-nums text-muted">{EUR.format(totals.vat)}</div>
        </div>
        <div className="rounded-lg border border-divider bg-surface px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Netto gesamt</div>
          <div className="mt-1 font-display text-lg font-bold tabular-nums">{EUR.format(totals.net)}</div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-lg border border-divider bg-surface px-3 py-2">
        <div className="flex flex-1 items-center gap-2">
          <Search size={14} className="text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Lieferant, Beleg-Nr. oder Notiz suchen…"
            className="flex-1 border-0 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | VendorInvoiceCategory)}
            className="border-0 bg-transparent text-[12px] font-bold uppercase tracking-widest text-ink focus:outline-none focus:ring-0"
          >
            <option value="all">Alle Kategorien</option>
            {(Object.keys(CATEGORY_LABELS) as VendorInvoiceCategory[]).map((k) => (
              <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-divider bg-surface/40 p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-paper text-muted">
            <FileText size={20} />
          </div>
          <div className="text-sm font-bold">Noch keine Eingangsrechnungen</div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted">
            Lade dein erstes PDF hoch — z. B. einen Hardware-Kauf für einen Mitarbeiter
            oder eine Software-Lizenz. Die Datei wird AES-256 verschlüsselt abgelegt.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-divider">
          <table className="w-full">
            <thead className="bg-surface text-left text-[10px] font-bold uppercase tracking-widest text-muted">
              <tr>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Lieferant</th>
                <th className="px-4 py-3">Kategorie</th>
                <th className="px-4 py-3 text-right">Brutto</th>
                <th className="px-4 py-3 text-right">USt</th>
                <th className="px-4 py-3 text-right">Datei</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const att = attachments.find((a) => a.id === v.attachmentId);
                return (
                  <tr
                    key={v.id}
                    onClick={() => setViewerId(v.id)}
                    className="cursor-pointer border-t border-divider bg-paper/40 text-sm transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3 tabular-nums text-muted">{formatDate(v.invoiceDate)}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{v.vendorName}</div>
                      {v.invoiceNumber && (
                        <div className="text-[11px] text-muted">Nr. {v.invoiceNumber}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${CATEGORY_COLORS[v.category]}`}>
                        {CATEGORY_LABELS[v.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{EUR.format(v.amountGross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {v.vatAmount !== undefined ? EUR.format(v.vatAmount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[11px] text-muted">
                      {att ? formatFileSize(att.sizeBytes) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <VendorInvoiceUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSave={handleSave}
        nextId={state?.nextVendorInvoiceId ?? 1}
      />

      <PdfViewerModal
        open={viewer !== null && viewerAttachment !== null}
        attachment={viewerAttachment}
        title={viewer ? `${viewer.vendorName}${viewer.invoiceNumber ? ' · ' + viewer.invoiceNumber : ''}` : undefined}
        onClose={() => setViewerId(null)}
        onDelete={viewer ? () => handleDelete(viewer.id) : undefined}
      />
    </>
  );
}
