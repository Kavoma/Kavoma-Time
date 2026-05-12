import { useState, useMemo } from 'react';
import { Download, Plus, FileText, Trash2, Check, Files, Search, ShieldCheck, ClipboardList, FileSpreadsheet, Ban, AlertTriangle } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Invoice, DunningReminder } from '../types';
import { InvoiceCreateModal } from '../components/InvoiceCreateModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { ContextMenu } from '../components/ContextMenu';
import { CancelInvoiceModal } from '../components/CancelInvoiceModal';
import { DunningModal } from '../components/DunningModal';
import { downloadInvoicePdf, downloadServiceReportPdf, downloadContractPdf } from '../utils/invoicePdf';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { createCancellationInvoice } from '../utils/analytics';

export function ExportView() {
  const { state, setState } = useAppState();
  const [createOpen, setCreateOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'open' | 'cancelled' | 'dunning'>('all');
  const [menu, setMenu] = useState<{ x: number; y: number; invoiceId: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [dunningId, setDunningId] = useState<string | null>(null);

  const filteredInvoices = useMemo(() => {
    if (!state) return [];
    return state.invoices.filter(inv => {
      const customer = state.customers.find(c => c.id === inv.customerId);
      const matchesSearch = inv.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           customer?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCustomer = filterCustomer === 0 || inv.customerId === filterCustomer;
      const isCancelled = inv.status === 'cancelled';
      const isStorno    = !!inv.cancelsInvoiceId;
      let matchesStatus = true;
      if      (filterStatus === 'paid')      matchesStatus = inv.paid && !isCancelled && !isStorno;
      else if (filterStatus === 'open')      matchesStatus = !inv.paid && !isCancelled && !isStorno;
      else if (filterStatus === 'cancelled') matchesStatus = isCancelled || isStorno;
      else if (filterStatus === 'dunning')   matchesStatus = !isCancelled && !isStorno && !inv.paid && inv.dueDate < Date.now();
      return matchesSearch && matchesCustomer && matchesStatus;
    });
  }, [state, searchTerm, filterCustomer, filterStatus]);

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
    setState(s => {
      if (!s) return null;
      const inv = s.invoices.find(i => i.id === id);
      if (!inv) return s;

      // Beim Storno-Paar IMMER beide löschen — sonst Geister-Einträge
      // (Original ohne Storno oder Storno ohne Original) und falsche Hero-Card-Zählungen
      const idsToDelete = new Set<string>([id]);
      if (inv.cancelledByInvoiceId) idsToDelete.add(inv.cancelledByInvoiceId); // Original → Storno mit weg
      if (inv.cancelsInvoiceId)     idsToDelete.add(inv.cancelsInvoiceId);     // Storno → Original mit weg

      return { ...s, invoices: s.invoices.filter(i => !idsToDelete.has(i.id)) };
    });
    setDeletingId(null);
  };

  const cancelInvoice = (reason: string) => {
    if (!cancellingId || !state) return;
    const original = state.invoices.find(i => i.id === cancellingId);
    if (!original || original.status === 'cancelled') { setCancellingId(null); return; }

    const year = new Date().getFullYear();
    const newNumber = `${state.invoicePrefix?.replace('YYYY', String(year)) ?? `${year}-`}${String(state.nextInvoiceCounter).padStart(3, '0')}-S`;
    const stornoInv = createCancellationInvoice(original, reason, newNumber);

    setState(s => s ? {
      ...s,
      nextInvoiceCounter: s.nextInvoiceCounter + 1,
      invoices: [
        stornoInv,
        ...s.invoices.map(i => i.id === original.id
          ? { ...i, status: 'cancelled' as const, cancelledAt: Date.now(), cancellationReason: reason, cancelledByInvoiceId: stornoInv.id }
          : i),
      ],
    } : null);

    // Storno-PDF direkt herunterladen
    const customer = state.customers.find(c => c.id === original.customerId);
    if (customer) downloadInvoicePdf(stornoInv, state.issuer, customer);

    setCancellingId(null);
  };

  const addReminder = (reminder: DunningReminder) => {
    if (!dunningId || !state) return;
    const inv = state.invoices.find(i => i.id === dunningId);
    if (!inv || inv.status === 'cancelled' || inv.cancelsInvoiceId) {
      setDunningId(null);
      return;
    }
    setState(s => s ? {
      ...s,
      invoices: s.invoices.map(i => i.id === dunningId ? { ...i, reminders: [...i.reminders, reminder] } : i),
    } : null);
    setDunningId(null);
  };

  const deletingInvoice = state.invoices.find(i => i.id === deletingId) || null;

  // Stats (basierend auf gefilterten Daten)
  // Aktive Rechnungen — Stornierte + Storno-Rechnungen aus den Finanz-Summen raus
  const activeInvoices = filteredInvoices.filter(i => i.status !== 'cancelled' && !i.cancelsInvoiceId);
  const paidRevenue  = activeInvoices.filter(i => i.paid).reduce((s, i) => s + i.total, 0);
  const openRevenue  = activeInvoices.filter(i => !i.paid).reduce((s, i) => s + i.total, 0);
  const totalRevenue = paidRevenue + openRevenue;

  // Zähler für Header-Cards (basieren auf allen Rechnungen, nicht gefiltert)
  const allInvoices = state.invoices;
  const overdueInvoices  = allInvoices.filter(i => i.status !== 'cancelled' && !i.cancelsInvoiceId && !i.paid && i.dueDate < Date.now());
  // Mahnungen nur für aktive Rechnungen — stornierte fallen aus dem Mahnverfahren raus
  const dunningInvoices  = allInvoices.filter(i =>
    i.reminders.length > 0 && i.status !== 'cancelled' && !i.cancelsInvoiceId
  );
  const dunningFees      = dunningInvoices.reduce((s, i) => s + i.reminders.reduce((rs, r) => rs + r.fee, 0), 0);
  const cancelledCount   = allInvoices.filter(i => i.status === 'cancelled').length;
  const cancelledVolume  = allInvoices.filter(i => i.status === 'cancelled').reduce((s, i) => s + i.total, 0);
  const paidCount = activeInvoices.filter(i => i.paid).length;
  const openCount = activeInvoices.filter(i => !i.paid).length;

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
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div
          onClick={() => setFilterStatus(filterStatus === 'paid' ? 'all' : 'paid')}
          className={`cursor-pointer rounded-xl border p-5 transition-all hover:scale-[1.02] ${
            filterStatus === 'paid' ? 'border-green-500 bg-green-500/5 shadow-lg shadow-green-500/10' : 'border-divider bg-surface'
          }`}
        >
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Bezahlt</div>
            <div className="text-[10px] tabular-nums text-muted">{paidCount}×</div>
          </div>
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
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Offen</div>
            <div className="text-[10px] tabular-nums text-muted">{openCount}×{overdueInvoices.length > 0 ? ` · ${overdueInvoices.length} überfällig` : ''}</div>
          </div>
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
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Gesamt</div>
            <div className="text-[10px] tabular-nums text-muted">{paidCount + openCount}×</div>
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular-nums text-ink">
            <AnimatedNumber value={totalRevenue} />
          </div>
        </div>
      </div>

      {/* Sekundär-Stats: Mahnungen + Stornierungen */}
      <div className="mb-8 grid grid-cols-2 gap-3">
        <div
          onClick={() => setFilterStatus(filterStatus === 'dunning' ? 'all' : 'dunning')}
          className={`cursor-pointer rounded-xl border p-4 transition-all hover:scale-[1.01] ${
            filterStatus === 'dunning' ? 'border-red-500 bg-red-500/5 shadow-lg shadow-red-500/10' : 'border-divider bg-surface'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Mahnungen</span>
            </div>
            <span className="text-[10px] tabular-nums text-muted">
              {dunningFees > 0 ? `${dunningFees.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} Gebühren` : ''}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums text-red-400">{dunningInvoices.length}</span>
            <span className="text-[11px] text-muted">{dunningInvoices.length === 1 ? 'Rechnung in Mahnung' : 'Rechnungen in Mahnung'}</span>
          </div>
        </div>

        <div
          onClick={() => setFilterStatus(filterStatus === 'cancelled' ? 'all' : 'cancelled')}
          className={`cursor-pointer rounded-xl border p-4 transition-all hover:scale-[1.01] ${
            filterStatus === 'cancelled' ? 'border-zinc-400 bg-zinc-500/5 shadow-lg shadow-zinc-500/10' : 'border-divider bg-surface'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Stornierungen</span>
            </div>
            <span className="text-[10px] tabular-nums text-muted">
              {cancelledVolume > 0 ? `Volumen ${cancelledVolume.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}` : ''}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums text-zinc-400">{cancelledCount}</span>
            <span className="text-[11px] text-muted">{cancelledCount === 1 ? 'Rechnung storniert' : 'Rechnungen storniert'}</span>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-display text-lg font-bold tabular-nums ${inv.status === 'cancelled' ? 'text-muted line-through' : 'text-ink'}`}>{inv.number}</span>
                      {inv.status === 'cancelled' ? (
                        <span className="flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                          <Ban size={10} /> Storniert
                        </span>
                      ) : inv.cancelsInvoiceId ? (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-500">
                          <Ban size={10} /> Storno-Rechnung
                        </span>
                      ) : inv.paid ? (
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
                      {inv.reminders.length > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                          <AlertTriangle size={10} /> Mahnstufe {inv.reminders.reduce((m, r) => Math.max(m, r.level), 0)}
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
        items={menu ? (() => {
          const inv = state.invoices.find(i => i.id === menu.invoiceId);
          const isCancelled = inv?.status === 'cancelled';
          const isStorno    = !!inv?.cancelsInvoiceId;
          const overdue = inv && !inv.paid && !isCancelled && !isStorno && inv.dueDate < Date.now();
          const items: any[] = [
            { label: 'Rechnung (PDF)',     icon: <Download size={13} />, onClick: () => redownload(menu.invoiceId) },
            { label: 'Tätigkeitsbericht',  icon: <ClipboardList size={13} />, onClick: () => downloadReport(menu.invoiceId) },
            { label: 'E-Rechnung Vertrag', icon: <ShieldCheck size={13} />, onClick: () => downloadConsent(menu.invoiceId) },
          ];
          if (overdue) {
            items.push({ type: 'separator' });
            items.push({ label: 'Mahnung verbuchen', icon: <AlertTriangle size={13} />, onClick: () => setDunningId(menu.invoiceId) });
          }
          if (!isCancelled && !isStorno) {
            items.push({ type: 'separator' });
            items.push({ label: 'Stornieren', icon: <Ban size={13} />, danger: true, onClick: () => setCancellingId(menu.invoiceId) });
          }
          items.push({ type: 'separator' });
          items.push({ label: 'Löschen', icon: <Trash2 size={13} />, danger: true, onClick: () => setDeletingId(menu.invoiceId) });
          return items;
        })() : []}
      />

      <ConfirmDeleteModal
        open={deletingInvoice !== null}
        title="Rechnung löschen?"
        description={(() => {
          if (!deletingInvoice) return '';
          const hasPair = deletingInvoice.cancelsInvoiceId || deletingInvoice.cancelledByInvoiceId;
          const base = `Rechnung ${deletingInvoice.number} wird unwiderruflich gelöscht. Zeiteinträge bleiben erhalten.`;
          const pairWarn = hasPair ? ' Das verknüpfte Storno-Paar wird ebenfalls entfernt, damit die Übersicht konsistent bleibt.' : '';
          const gobd = ' (Achtung: Für GoBD bitte stattdessen stornieren statt löschen.)';
          return base + pairWarn + gobd;
        })()}
        onConfirm={() => deletingId !== null && remove(deletingId)}
        onCancel={() => setDeletingId(null)}
      />

      <CancelInvoiceModal
        invoice={state.invoices.find(i => i.id === cancellingId) || null}
        onConfirm={cancelInvoice}
        onCancel={() => setCancellingId(null)}
      />

      <DunningModal
        invoice={state.invoices.find(i => i.id === dunningId) || null}
        onConfirm={addReminder}
        onCancel={() => setDunningId(null)}
      />
    </>
  );
}
