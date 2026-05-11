import { useState, useMemo } from 'react';
import { Download, Plus, FileText, Trash2, Check, Files, Search, ChevronDown, ShieldCheck, ClipboardList, FileSpreadsheet } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Invoice } from '../types';
import { InvoiceCreateModal } from '../components/InvoiceCreateModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { ContextMenu } from '../components/ContextMenu';
import { downloadInvoicePdf, downloadServiceReportPdf, downloadContractPdf } from '../utils/invoicePdf';
import { AnimatedNumber } from '../components/AnimatedNumber';

export function ExportView() {
  const { state, setState } = useAppState();
  const [createOpen, setCreateOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'open'>('all');
  const [menu, setMenu] = useState<{ x: number; y: number; invoiceId: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!state) return null;

  const exportCSV = () => {
    if (filteredInvoices.length === 0) return;

    const headers = ['Nummer', 'Datum', 'Debitor-Nr.', 'Kunde', 'Leistungsdatum', 'Netto', 'USt-Satz', 'USt', 'Gesamt', 'Status'];
    const rows = filteredInvoices.map(inv => {
      const customer = state.customers.find(c => c.id === inv.customerId);
      return [
        inv.number,
        fmtDate(inv.createdAt),
        customer?.debtorNumber || customer?.id || '',
        customer?.name || 'Unbekannt',
        fmtDate(inv.periodTo),
        inv.subtotal.toFixed(2).replace('.', ','),
        `${inv.vatRate} %`.replace('.', ','),
        inv.vatAmount.toFixed(2).replace('.', ','),
        inv.total.toFixed(2).replace('.', ','),
        inv.paid ? 'Bezahlt' : 'Offen'
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kavoma-time-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const bulkDownload = async () => {
    if (isExporting || filteredInvoices.length === 0) return;
    setIsExporting(true);
    for (const inv of filteredInvoices) {
      const customer = state.customers.find(c => c.id === inv.customerId);
      if (customer) {
        downloadInvoicePdf(inv, state.issuer, customer);
        await new Promise(r => setTimeout(r, 600));
      }
    }
    setIsExporting(false);
  };

  const fmtEuro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const filteredInvoices = useMemo(() => {
    return state.invoices.filter(inv => {
      const customer = state.customers.find(c => c.id === inv.customerId);
      const matchesSearch = inv.number.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           customer?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCustomer = filterCustomer === 0 || inv.customerId === filterCustomer;
      const matchesStatus = filterStatus === 'all' || (filterStatus === 'paid' ? inv.paid : !inv.paid);
      return matchesSearch && matchesCustomer && matchesStatus;
    });
  }, [state.invoices, state.customers, searchTerm, filterCustomer, filterStatus]);

  const handleCreate = async (invoice: Invoice, options: { includeReport: boolean; includeConsent: boolean }) => {
    const customer = state.customers.find(c => c.id === invoice.customerId);
    if (!customer) return;
    setState(s => s ? {
      ...s,
      invoices: [invoice, ...s.invoices],
      nextInvoiceCounter: s.nextInvoiceCounter + 1,
    } : null);
    
    // Paket-Download (Kombiniert PDF wenn includeReport gewählt wurde)
    downloadInvoicePdf(invoice, state.issuer, customer, options.includeReport ? state.entries : undefined);
    
    if (options.includeConsent) {
      await new Promise(r => setTimeout(r, 600));
      downloadContractPdf(state.issuer, customer);
    }

    setCreateOpen(false);
  };

  const togglePaid = (id: string) => {
    setState(s => s ? {
      ...s,
      invoices: s.invoices.map(inv => inv.id === id
        ? { ...inv, paid: !inv.paid, paidAt: !inv.paid ? Date.now() : undefined }
        : inv),
    } : null);
  };

  const redownload = (id: string) => {
    const inv = state.invoices.find(i => i.id === id);
    const customer = inv && state.customers.find(c => c.id === inv.customerId);
    if (inv && customer) {
      // Beim erneuten Download hängen wir den Bericht mit an, wenn Zeiteinträge verknüpft sind
      downloadInvoicePdf(inv, state.issuer, customer, inv.entryIds.length > 0 ? state.entries : undefined);
    }
  };

  const downloadReport = (id: string) => {
    const inv = state.invoices.find(i => i.id === id);
    const customer = inv && state.customers.find(c => c.id === inv.customerId);
    if (inv && customer) downloadServiceReportPdf(inv, state.issuer, customer, state.entries);
  };

  const downloadConsent = (id: string) => {
    const inv = state.invoices.find(i => i.id === id);
    const customer = inv && state.customers.find(c => c.id === inv.customerId);
    if (customer) downloadContractPdf(state.issuer, customer);
  };

  const remove = (id: string) => {
    setState(s => s ? { ...s, invoices: s.invoices.filter(i => i.id !== id) } : null);
    setDeletingId(null);
  };

  const deletingInvoice = state.invoices.find(i => i.id === deletingId) || null;

  // Stats (basierend auf gefilterten Daten)
  const totalRevenue = filteredInvoices.reduce((s, i) => s + i.total, 0);
  const paidRevenue  = filteredInvoices.filter(i => i.paid).reduce((s, i) => s + i.total, 0);
  const openRevenue  = totalRevenue - paidRevenue;

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight leading-none">Rechnungsverwaltung</h2>
          <p className="mt-1.5 text-xs text-muted">{filteredInvoices.length} Dokumente gefunden</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Download size={18} className="text-muted" />
        </div>
      </div>

      {/* Hero Stats */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        <div
          onClick={() => setFilterStatus(filterStatus === 'paid' ? 'all' : 'paid')}
          className={`cursor-pointer rounded-xl border p-5 transition-all hover:scale-[1.02] ${
            filterStatus === 'paid' ? 'border-green-500 bg-green-500/5 shadow-lg shadow-green-500/10' : 'border-divider bg-surface'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Bezahlt</div>
          <div className="mt-2 font-display text-2xl font-bold tabular-nums text-green-500">
            <AnimatedNumber value={paidRevenue} />
          </div>
        </div>
        <div
          onClick={() => setFilterStatus(filterStatus === 'open' ? 'all' : 'open')}
          className={`cursor-pointer rounded-xl border p-5 transition-all hover:scale-[1.02] ${
            filterStatus === 'open' ? 'border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10' : 'border-divider bg-surface'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Offen</div>
          <div className="mt-2 font-display text-2xl font-bold tabular-nums text-amber-400">
            <AnimatedNumber value={openRevenue} />
          </div>
        </div>
        <div
          onClick={() => setFilterStatus('all')}
          className={`cursor-pointer rounded-xl border p-5 transition-all hover:scale-[1.02] ${
            filterStatus === 'all' ? 'border-ink bg-ink/5 shadow-lg shadow-ink/5' : 'border-divider bg-surface'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Gesamt</div>
          <div className="mt-2 font-display text-2xl font-bold tabular-nums text-ink">
            <AnimatedNumber value={totalRevenue} />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 min-w-[300px]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Suche nach Nummer oder Kunde..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-divider bg-surface py-2 pl-9 pr-4 text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </div>
          <div className="relative">
            <select
              value={filterCustomer}
              onChange={e => setFilterCustomer(Number(e.target.value))}
              className="w-full"
            >
              <option value={0}>Alle Kunden</option>
              {state.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={filteredInvoices.length === 0}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-surface px-4 text-xs font-bold uppercase tracking-widest transition-all hover:border-ink disabled:opacity-30"
            title="Export für Steuerberater (CSV)"
          >
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button
            onClick={bulkDownload}
            disabled={isExporting || filteredInvoices.length === 0}
            className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-surface px-4 text-xs font-bold uppercase tracking-widest transition-all hover:border-ink disabled:opacity-30 ${isExporting ? 'animate-pulse' : ''}`}
          >
            <Files size={14} /> {isExporting ? 'Lädt...' : 'Alle Export'}
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={state.customers.length === 0}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-ink bg-ink px-4 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:bg-paper hover:text-ink active:scale-95 disabled:opacity-30"
          >
            <Plus size={14} /> Rechnung
          </button>
        </div>
      </div>

      {/* Invoice Grid */}
      {filteredInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-paper py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface">
            <FileText size={32} className="text-muted/40" />
          </div>
          <h3 className="text-sm font-bold text-ink">Keine Rechnungen gefunden</h3>
          <p className="mt-1 text-xs text-muted">Pass deine Filter an oder erstelle eine neue Rechnung.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredInvoices.map(inv => {
            const customer = state.customers.find(c => c.id === inv.customerId);
            const overdue = !inv.paid && inv.dueDate < Date.now();
            return (
              <div
                key={inv.id}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, invoiceId: inv.id }); }}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-divider bg-surface p-4 transition-all hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5 cursor-context-menu"
              >
                {/* Accent line */}
                <div className="absolute left-0 top-0 h-full w-1" style={{ background: customer?.color || '#525252' }} />

                <div className="mb-4 flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-bold tabular-nums text-ink">{inv.number}</span>
                      {inv.paid ? (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-500">
                          <Check size={10} /> Bezahlt
                        </span>
                      ) : overdue ? (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-500">
                          Überfällig
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-500">
                          Offen
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-xs font-medium text-muted">{customer?.name}</div>
                  </div>
                  <button
                    onClick={() => togglePaid(inv.id)}
                    className={`flex size-8 items-center justify-center rounded-lg border-2 transition-all ${
                      inv.paid ? 'border-green-500 bg-green-500 text-paper' : 'border-divider bg-paper text-muted hover:border-accent'
                    }`}
                  >
                    <Check size={14} />
                  </button>
                </div>

                <div className="flex items-end justify-between">
                  <div className="text-[10px] leading-relaxed text-muted tabular-nums">
                    Erstellt: {fmtDate(inv.createdAt)}<br />
                    Fällig: {fmtDate(inv.dueDate)}
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-lg font-bold text-ink">{fmtEuro(inv.total)}</div>
                    <div className="text-[10px] text-muted">
                      {inv.mode === 'hourly' ? `${inv.items.reduce((s, i) => s + i.quantity, 0).toFixed(1)} h` : 'Pauschal'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <InvoiceCreateModal
        open={createOpen}
        customers={state.customers}
        projects={state.projects}
        entries={state.entries}
        issuer={state.issuer}
        nextCounter={state.nextInvoiceCounter}
        invoicePrefix={state.invoicePrefix ?? 'YYYY-'}
        onSave={handleCreate}
        onCancel={() => setCreateOpen(false)}
      />

      <ContextMenu
        position={menu}
        onClose={() => setMenu(null)}
        items={menu ? [
          { label: 'Rechnung (PDF)', icon: <Download size={13} />, onClick: () => redownload(menu.invoiceId) },
          { label: 'Tätigkeitsbericht', icon: <ClipboardList size={13} />, onClick: () => downloadReport(menu.invoiceId) },
          { label: 'E-Rechnung Vertrag', icon: <ShieldCheck size={13} />, onClick: () => downloadConsent(menu.invoiceId) },
          { type: 'separator' },
          { label: 'Löschen', icon: <Trash2 size={13} />, danger: true, onClick: () => setDeletingId(menu.invoiceId) },
        ] : []}
      />

      <ConfirmDeleteModal
        open={deletingInvoice !== null}
        title="Rechnung löschen?"
        description={deletingInvoice ? `Rechnung ${deletingInvoice.number} wird unwiderruflich gelöscht. Die Zeiteinträge bleiben erhalten.` : ''}
        onConfirm={() => deletingId !== null && remove(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </>
  );
}
