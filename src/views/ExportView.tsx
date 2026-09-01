import { useState, useMemo, useEffect } from 'react';
import { Download, Plus, FileText, Trash2, Check, Files, Search, FileCode2, ClipboardList, FileSpreadsheet, Ban, AlertTriangle, Repeat, Edit2, Wand2, Eye } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Invoice, DunningReminder, InvoiceTemplate, RecurringInvoice } from '../types';
import { InvoiceCreateModal } from '../components/InvoiceCreateModal';
import { InvoiceDetailDrawer } from '../components/finance/InvoiceDetailDrawer';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { ContextMenu } from '../components/ContextMenu';
import { CancelInvoiceModal } from '../components/CancelInvoiceModal';
import { DunningModal } from '../components/DunningModal';
import { downloadInvoicePdf, downloadServiceReportPdf, downloadEInvoiceXml } from '../utils/invoicePdf';
import { downloadDunningPdf } from '../utils/dunningPdf';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { createCancellationInvoice } from '../utils/analytics';
import { Tooltip } from '../components/Tooltip';
import type { NavIntent, ViewKey } from '../App';
import { advanceCounter, allocateNumber, formatInvoiceNumber, invoiceFloor, DRAFT_NUMBER_LABEL } from '../sync/numbers';

interface ExportViewProps {
  navigateTo?: (view: ViewKey, intent?: NavIntent) => void;
  /** Wenn gesetzt: öffnet beim Mounten direkt den Detail-Drawer dieser Rechnung. */
  initialInvoiceId?: string;
  onInitialInvoiceConsumed?: () => void;
}

export function ExportView({ navigateTo, initialInvoiceId, onInitialInvoiceConsumed }: ExportViewProps = {}) {
  const { state, setState } = useAppState();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'open' | 'cancelled' | 'dunning' | 'draft'>('all');
  const [menu, setMenu] = useState<{ x: number; y: number; invoiceId: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [dunningId, setDunningId] = useState<string | null>(null);
  const [drawerInvoiceId, setDrawerInvoiceId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: 'createdAt' | 'total' | 'status', direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  // Cross-View-Intent: kommt eine Rechnungs-ID rein (z. B. aus dem Kunden-Drawer),
  // öffnen wir direkt den Detail-Drawer dieser Rechnung.
  useEffect(() => {
    if (initialInvoiceId) {
      setDrawerInvoiceId(initialInvoiceId);
      onInitialInvoiceConsumed?.();
    }
  }, [initialInvoiceId, onInitialInvoiceConsumed]);
  
  // Helper to check if an invoice is overdue (due today or in the past)
  const isOverdue = (invoice: Invoice) => {
    if (invoice.paid) return false;
    const due = new Date(invoice.dueDate);
    due.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return due < now;
  };

  const filteredInvoices = useMemo(() => {
    if (!state) return [];
    const result = state.invoices.filter(inv => {
      const customer = state.customers.find(c => c.id === inv.customerId);
      const matchesSearch = inv.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           customer?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCustomer = filterCustomer === 0 || inv.customerId === filterCustomer;
      const isCancelled = inv.status === 'cancelled';
      const isStorno    = !!inv.cancelsInvoiceId;
      const isDraft     = inv.status === 'draft';
      let matchesStatus: boolean;
      if      (filterStatus === 'paid')      matchesStatus = inv.paid && !isCancelled && !isStorno && !isDraft;
      else if (filterStatus === 'open')      matchesStatus = !inv.paid && !isCancelled && !isStorno && !isDraft;
      else if (filterStatus === 'cancelled') matchesStatus = isCancelled || isStorno;
      else if (filterStatus === 'dunning')   matchesStatus = !isCancelled && !isStorno && !isDraft && isOverdue(inv);
      else if (filterStatus === 'draft')     matchesStatus = isDraft;
      else /* all */                         matchesStatus = !isDraft; // Drafts standardmäßig nicht in "Alle" — eigener Filter
      return matchesSearch && matchesCustomer && matchesStatus;
    });

    // Sorting
    result.sort((a, b) => {
      let valA: any = a[sortConfig.key];
      let valB: any = b[sortConfig.key];

      // Special case for status sorting
      if (sortConfig.key === 'status') {
        // Status priority: cancelled (0) < open (1) < overdue (2) < paid (3)
        const getStatusPriority = (inv: Invoice) => {
          if (inv.status === 'cancelled' || inv.cancelsInvoiceId) return 0;
          if (inv.paid) return 3;
          if (isOverdue(inv)) return 2;
          return 1;
        };
        valA = getStatusPriority(a);
        valB = getStatusPriority(b);
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [state, searchTerm, filterCustomer, filterStatus, sortConfig]);

  if (!state) return null;

  const exportCSV = () => {
    const toExport = selectedIds.length > 0 
      ? state.invoices.filter(inv => selectedIds.includes(String(inv.id)))
      : filteredInvoices;

    if (toExport.length === 0) return;

    const headers = ['Nummer', 'Datum', 'Debitor-Nr.', 'Kunde', 'Leistungsdatum', 'Netto', 'USt-Satz', 'USt', 'Gesamt', 'Status'];
    const rows = toExport.map(inv => {
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

  // Einbettung des ZUGFeRD-XML ist per Default an, in den Einstellungen abschaltbar
  const eInvoiceOptions = { embedXml: state.eInvoiceEnabled !== false };

  const bulkDownload = async () => {
    const toExport = selectedIds.length > 0 
      ? state.invoices.filter(inv => selectedIds.includes(String(inv.id)))
      : filteredInvoices;

    if (isExporting || toExport.length === 0) return;
    setIsExporting(true);
    for (const inv of toExport) {
      const customer = state.customers.find(c => c.id === inv.customerId);
      if (customer) {
        await downloadInvoicePdf(inv, state.issuer, customer, undefined, eInvoiceOptions);
        await new Promise(r => setTimeout(r, 600));
      }
    }
    setIsExporting(false);
    if (selectedIds.length > 0) setSelectedIds([]); // Clear after export
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredInvoices.length && filteredInvoices.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredInvoices.map(i => String(i.id)));
    }
  };

  const fmtEuro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const editingDraft = editingDraftId
    ? state.invoices.find(i => i.id === editingDraftId && i.status === 'draft') ?? null
    : null;

  const handleCreate = async (invoice: Invoice, options: { includeReport: boolean }) => {
    const customer = state.customers.find(c => c.id === invoice.customerId);
    if (!customer) return;

    // Hier — und nur hier — entsteht die Rechnungsnummer. Nicht beim Anlegen
    // eines Entwurfs: Der verbrennt sonst eine Nummer, auch wenn er nie
    // verschickt wird, und auf zwei Geräten dieselbe.
    let finalized = invoice;
    let allocatedValue: number | null = null;
    if (!invoice.number.trim()) {
      const year = new Date(invoice.createdAt).getFullYear();
      try {
        const floor = invoiceFloor(state.invoices, state.invoicePrefix, year, state.nextInvoiceCounter);
        const allocated = await allocateNumber('invoice', floor, year);
        finalized = { ...invoice, number: formatInvoiceNumber(state.invoicePrefix, allocated.value, year) };
        allocatedValue = allocated.value;
      } catch (e) {
        // Lieber gar keine Rechnung als zwei mit derselben Nummer.
        alert(e instanceof Error ? e.message : 'Rechnungsnummer konnte nicht vergeben werden.');
        return;
      }
    }

    setState(s => {
      if (!s) return null;
      const exists = s.invoices.some(i => i.id === finalized.id);
      const counter = allocatedValue !== null
        ? { nextInvoiceCounter: advanceCounter(s.nextInvoiceCounter, allocatedValue) }
        : {};
      return exists
        ? { ...s, ...counter, invoices: s.invoices.map(i => i.id === finalized.id ? finalized : i) }
        : { ...s, ...counter, invoices: [finalized, ...s.invoices] };
    });

    // Paket-Download (Kombiniert PDF wenn includeReport gewählt wurde)
    await downloadInvoicePdf(finalized, state.issuer, customer, options.includeReport ? state.entries : undefined, eInvoiceOptions);

    setCreateOpen(false);
    setEditingDraftId(null);
  };

  const handleSaveDraft = (draft: Invoice) => {
    setState(s => {
      if (!s) return null;
      const exists = s.invoices.some(i => i.id === draft.id);
      if (exists) {
        return { ...s, invoices: s.invoices.map(i => i.id === draft.id ? draft : i) };
      }
      // Entwürfe reservieren keine Nummer mehr. Früher geschah das hier, damit
      // sie nicht doppelt vergeben wird — auf einem Gerät funktionierte das,
      // auf zweien nicht: Beide zählen ihren eigenen Zähler hoch und landen
      // auf derselben Nummer.
      return { ...s, invoices: [draft, ...s.invoices] };
    });
    setCreateOpen(false);
    setEditingDraftId(null);
  };

  const handleCreateTemplate = (template: InvoiceTemplate) => {
    setState(s => s ? {
      ...s,
      invoiceTemplates: [...s.invoiceTemplates, template],
      nextTemplateId: (s.nextTemplateId ?? 1) + 1,
    } : null);
  };

  const handleCreateRecurring = (recurring: RecurringInvoice) => {
    setState(s => s ? {
      ...s,
      recurringInvoices: [...s.recurringInvoices, recurring],
      nextRecurringId: (s.nextRecurringId ?? 1) + 1,
    } : null);
  };

  const finalizeSelectedDrafts = async () => {
    if (isFinalizing) return;
    const drafts = state.invoices.filter(i => selectedIds.includes(String(i.id)) && i.status === 'draft');
    if (drafts.length === 0) return;
    setIsFinalizing(true);
    // Bewusst nacheinander und nicht als Block: Jede Nummer wird einzeln
    // gezogen, damit bei einem Abbruch in der Mitte keine Lücke entsteht.
    for (const d of drafts) {
      const customer = state.customers.find(c => c.id === d.customerId);
      if (!customer) continue;

      const createdAt = Date.now();
      let number = d.number.trim();
      let allocatedValue: number | null = null;
      if (!number) {
        const year = new Date(createdAt).getFullYear();
        try {
          // Die Untergrenze wird in jedem Durchlauf neu gebildet: Die zuvor in
          // dieser Schleife vergebene Nummer steht dann schon im State.
          const floor = invoiceFloor(state.invoices, state.invoicePrefix, year, state.nextInvoiceCounter);
          const allocated = await allocateNumber('invoice', floor, year);
          number = formatInvoiceNumber(state.invoicePrefix, allocated.value, year);
          allocatedValue = allocated.value;
        } catch (e) {
          // Abbrechen statt weitermachen: Die bereits finalisierten bleiben
          // gültig, der Rest bleibt Entwurf und kann später erneut ran.
          alert(e instanceof Error ? e.message : 'Rechnungsnummer konnte nicht vergeben werden.');
          break;
        }
      }

      const final: Invoice = { ...d, number, status: 'active', createdAt };
      setState(s => s ? {
        ...s,
        ...(allocatedValue !== null
          ? { nextInvoiceCounter: advanceCounter(s.nextInvoiceCounter, allocatedValue) }
          : {}),
        invoices: s.invoices.map(i => i.id === d.id ? final : i),
      } : null);
      await downloadInvoicePdf(final, state.issuer, customer, d.entryIds.length > 0 ? state.entries : undefined, eInvoiceOptions);
      await new Promise(r => setTimeout(r, 500));
    }
    setIsFinalizing(false);
    setSelectedIds([]);
  };

  const togglePaid = (id: string) => {
    setState(s => s ? {
      ...s,
      invoices: s.invoices.map(inv => {
        if (inv.id !== id) return inv;
        if (inv.paid) {
          // Schlüssel wirklich entfernen, nicht auf `undefined` setzen: Beim
          // Übertragen fällt ein `undefined` aus dem JSON heraus, im lokalen
          // Zustand bleibt es stehen. Die beiden Fassungen sähen dann
          // dauerhaft verschieden aus und erzeugten bei jedem Abgleich eine
          // Änderung, die keine ist.
          const { paidAt: _entfernt, ...ohneZahldatum } = inv;
          return { ...ohneZahldatum, paid: false };
        }
        return { ...inv, paid: true, paidAt: Date.now() };
      }),
    } : null);
  };

  const redownload = (id: string) => {
    const inv = state.invoices.find(i => i.id === id);
    const customer = inv && state.customers.find(c => c.id === inv.customerId);
    if (inv && customer) {
      // Beim erneuten Download hängen wir den Bericht mit an, wenn Zeiteinträge verknüpft sind
      void downloadInvoicePdf(inv, state.issuer, customer, inv.entryIds.length > 0 ? state.entries : undefined, eInvoiceOptions);
    }
  };

  const downloadReport = (id: string) => {
    const inv = state.invoices.find(i => i.id === id);
    const customer = inv && state.customers.find(c => c.id === inv.customerId);
    if (inv && customer) downloadServiceReportPdf(inv, state.issuer, customer, state.entries);
  };

  const downloadXml = (id: string) => {
    const inv = state.invoices.find(i => i.id === id);
    const customer = inv && state.customers.find(c => c.id === inv.customerId);
    if (inv && customer) downloadEInvoiceXml(inv, state.issuer, customer);
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

  const cancelInvoice = async (reason: string) => {
    if (!cancellingId || !state) return;
    const original = state.invoices.find(i => i.id === cancellingId);
    if (!original || original.status === 'cancelled') { setCancellingId(null); return; }

    const year = new Date().getFullYear();
    let allocated;
    try {
      const floor = invoiceFloor(state.invoices, state.invoicePrefix, year, state.nextInvoiceCounter);
      allocated = await allocateNumber('invoice', floor, year);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Storno-Nummer konnte nicht vergeben werden.');
      return;
    }
    const newNumber = formatInvoiceNumber(state.invoicePrefix, allocated.value, year, '-S');
    const stornoInv = createCancellationInvoice(original, reason, newNumber);

    setState(s => s ? {
      ...s,
      nextInvoiceCounter: advanceCounter(s.nextInvoiceCounter, allocated.value),
      invoices: [
        stornoInv,
        ...s.invoices.map(i => i.id === original.id
          ? { ...i, status: 'cancelled' as const, cancelledAt: Date.now(), cancellationReason: reason, cancelledByInvoiceId: stornoInv.id }
          : i),
      ],
    } : null);

    // Storno-PDF direkt herunterladen
    const customer = state.customers.find(c => c.id === original.customerId);
    if (customer) void downloadInvoicePdf(stornoInv, state.issuer, customer, undefined, eInvoiceOptions);

    setCancellingId(null);
  };

  const addReminder = (reminder: DunningReminder) => {
    if (!dunningId || !state) return;
    setState(s => s ? {
      ...s,
      invoices: s.invoices.map(i => i.id === dunningId ? { ...i, reminders: [...i.reminders, reminder] } : i),
    } : null);
    setDunningId(null);
  };

  const removeReminder = (invoiceId: string) => {
    setState(s => s ? {
      ...s,
      invoices: s.invoices.map(i => i.id === invoiceId ? { ...i, reminders: i.reminders.slice(0, -1) } : i),
    } : null);
  };

  const deletingInvoice = state.invoices.find(i => i.id === deletingId) || null;

  // Stats (basierend auf gefilterten Daten)
  // Aktive Rechnungen — Stornierte + Storno-Rechnungen + Drafts aus den Finanz-Summen raus
  const activeInvoices = filteredInvoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft' && !i.cancelsInvoiceId);

  // Berechnung der Gesamtsumme inkl. Mahngebühren pro Rechnung
  const getFullTotal = (inv: Invoice) => inv.total + inv.reminders.reduce((s, r) => s + r.fee, 0);

  const paidRevenue  = activeInvoices.filter(i => i.paid).reduce((s, i) => s + getFullTotal(i), 0);
  const openRevenue  = activeInvoices.filter(i => !i.paid).reduce((s, i) => s + getFullTotal(i), 0);
  const totalRevenue = paidRevenue + openRevenue;

  // Zähler für Header-Cards (basieren auf allen Rechnungen, nicht gefiltert)
  const allInvoices = state.invoices;
  const overdueInvoices  = allInvoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft' && !i.cancelsInvoiceId && isOverdue(i));
  // Mahnungen nur für aktive, unbezahlte Rechnungen
  const dunningInvoices  = allInvoices.filter(i =>
    i.reminders.length > 0 && i.status !== 'cancelled' && i.status !== 'draft' && !i.cancelsInvoiceId && !i.paid
  );
  const dunningFees      = dunningInvoices.reduce((s, i) => s + i.reminders.reduce((rs, r) => rs + r.fee, 0), 0);
  const cancelledCount   = allInvoices.filter(i => i.status === 'cancelled').length;
  const cancelledVolume  = allInvoices.filter(i => i.status === 'cancelled').reduce((s, i) => s + i.total, 0);
  const draftInvoices    = allInvoices.filter(i => i.status === 'draft');
  const recurringDraftCount = draftInvoices.filter(i => !!i.recurringId).length;
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

      {/* Sekundär-Stats: Mahnungen + Stornierungen + Entwürfe */}
      <div className="mb-4 grid grid-cols-3 gap-3">
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
            <span className="text-[11px] text-muted">{dunningInvoices.length === 1 ? 'in Mahnung' : 'in Mahnung'}</span>
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
              {cancelledVolume > 0 ? `${cancelledVolume.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}` : ''}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums text-zinc-400">{cancelledCount}</span>
            <span className="text-[11px] text-muted">{cancelledCount === 1 ? 'storniert' : 'storniert'}</span>
          </div>
        </div>

        <div
          onClick={() => setFilterStatus(filterStatus === 'draft' ? 'all' : 'draft')}
          className={`cursor-pointer rounded-xl border p-4 transition-all hover:scale-[1.01] ${
            filterStatus === 'draft' ? 'border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10' : 'border-divider bg-surface'
          }`}
          title="Entwürfe sind nicht in den Umsatz-Statistiken enthalten"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Edit2 size={14} className="text-amber-300" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Entwürfe</span>
            </div>
            <span className="text-[10px] tabular-nums text-muted">
              {recurringDraftCount > 0 ? `${recurringDraftCount}× Recurring` : ''}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums text-amber-300">{draftInvoices.length}</span>
            <span className="text-[11px] text-muted">{draftInvoices.length === 1 ? 'offen' : 'offen'}</span>
          </div>
        </div>
      </div>

      {/* Recurring-Banner — fällige automatische Drafts */}
      {recurringDraftCount > 0 && filterStatus !== 'draft' && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-500/40 bg-blue-500/5 px-4 py-2.5">
          <Repeat size={15} className="flex-shrink-0 text-blue-300" />
          <div className="flex-1 text-[12px] text-blue-100">
            <span className="font-bold">{recurringDraftCount}</span>{' '}
            {recurringDraftCount === 1 ? 'wiederkehrende Rechnung wartet' : 'wiederkehrende Rechnungen warten'} als Entwurf — bitte prüfen und finalisieren.
          </div>
          <button
            onClick={() => setFilterStatus('draft')}
            className="cursor-pointer rounded-md bg-blue-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-100 transition-colors hover:bg-blue-500/40"
          >
            Anzeigen
          </button>
        </div>
      )}

      <div className="mb-2" />

      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* Search & Filters Group */}
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-[2fr_1.1fr_1.3fr] lg:max-w-4xl">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Suche nach Nummer oder Kunde..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-12 w-full !pl-12 pr-4 placeholder:text-muted/60 text-left border-divider focus:border-ink transition-all rounded-lg bg-surface text-sm font-medium"
            />
          </div>
          
          <select
            value={filterCustomer}
            onChange={e => setFilterCustomer(Number(e.target.value))}
            className="h-12 w-full px-4 pr-10 rounded-lg border border-divider bg-surface text-sm font-bold cursor-pointer hover:border-ink transition-colors outline-none text-left"
          >
            <option value={0}>Alle Kunden</option>
            {state.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            value={`${sortConfig.key}-${sortConfig.direction}`}
            onChange={e => {
              const [key, dir] = e.target.value.split('-');
              setSortConfig({ key: key as any, direction: dir as any });
            }}
            className="h-12 w-full px-4 pr-10 rounded-lg border border-divider bg-surface text-sm font-bold cursor-pointer hover:border-ink transition-colors outline-none text-left"
          >
            <option value="createdAt-desc">Datum (Neu zuerst)</option>
            <option value="createdAt-asc">Datum (Alt zuerst)</option>
            <option value="total-desc">Betrag (Hoch zuerst)</option>
            <option value="total-asc">Betrag (Niedrig zuerst)</option>
            <option value="status-desc">Status (Bezahlt zuerst)</option>
            <option value="status-asc">Status (Storno zuerst)</option>
          </select>
        </div>
        
        {/* Actions Group */}
        <div className="flex flex-wrap items-center gap-2 justify-start xl:justify-end">
          <Tooltip content="Export für Steuerberater (CSV)">
            <button
              onClick={exportCSV}
              disabled={filteredInvoices.length === 0}
              className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-surface px-5 text-xs font-bold uppercase tracking-widest transition-all hover:border-ink disabled:opacity-30"
            >
              <FileSpreadsheet size={16} /> CSV
            </button>
          </Tooltip>
          <button
            onClick={bulkDownload}
            disabled={isExporting || (selectedIds.length === 0 && filteredInvoices.length === 0)}
            className={`flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-surface px-5 text-xs font-bold uppercase tracking-widest transition-all hover:border-ink disabled:opacity-30 ${isExporting ? 'animate-pulse' : ''}`}
          >
            <Files size={16} /> {isExporting ? 'Lädt...' : selectedIds.length > 0 ? `Export (${selectedIds.length})` : 'Alle Export'}
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={state.customers.length === 0}
            className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-ink bg-ink px-5 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:bg-paper hover:text-ink active:scale-95 disabled:opacity-30"
          >
            <Plus size={16} /> Rechnung
          </button>
        </div>
      </div>

      {/* Selection Bar */}
      <div className="mb-6 flex items-center gap-4 px-1">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="text-[10px] font-bold uppercase tracking-widest text-muted hover:text-ink transition-colors flex items-center gap-1.5 py-1"
          >
            <Check size={12} className={selectedIds.length === filteredInvoices.length ? 'text-green-500' : ''} />
            {selectedIds.length === filteredInvoices.length ? 'Alle abwählen' : 'Alle auswählen'}
          </button>

          {selectedIds.length > 0 && (
            <>
              <div className="h-3 w-px bg-divider mx-1" />
              <button
                onClick={() => setSelectedIds([])}
                className="text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-500 transition-colors flex items-center gap-1.5 py-1"
              >
                <Ban size={12} /> Auswahl aufheben
              </button>
              {filterStatus === 'draft' && (
                <>
                  <div className="h-3 w-px bg-divider mx-1" />
                  <button
                    onClick={finalizeSelectedDrafts}
                    disabled={isFinalizing}
                    className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Wand2 size={12} /> {isFinalizing ? 'Finalisiere…' : `Entwürfe finalisieren (${selectedIds.length})`}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted/40">
            {selectedIds.length} von {filteredInvoices.length} markiert
          </span>
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
            const overdue = isOverdue(inv);
            const isSelected = selectedIds.includes(String(inv.id));
            const totalFees = inv.reminders.reduce((sum, r) => sum + r.fee, 0);
            const displayTotal = inv.total + totalFees;
            const isDraft = inv.status === 'draft';

            return (
              <div
                key={inv.id}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, invoiceId: inv.id }); }}
                onClick={() => setDrawerInvoiceId(inv.id)}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border p-5 transition-all hover:shadow-2xl hover:shadow-black/20 cursor-pointer ${
                  isSelected ? 'border-ink bg-ink/[0.03]'
                  : isDraft ? 'border-amber-500/30 bg-amber-500/[0.02] hover:border-amber-400/60'
                  : 'border-divider bg-surface hover:border-accent/40'
                }`}
                title="Klick öffnet die Detail-Ansicht · Rechtsklick für Schnellaktionen"
              >
                {/* Accent line */}
                <div className="absolute left-0 top-0 h-full w-1 transition-all group-hover:w-1.5" style={{ background: customer?.color || '#525252' }} />

                {/* Multi-Select-Checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIds(prev => prev.includes(String(inv.id)) ? prev.filter(id => id !== String(inv.id)) : [...prev, String(inv.id)]);
                  }}
                  className={`absolute right-3 top-3 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-all ${
                    isSelected ? 'border-ink bg-ink text-paper' : 'border-divider bg-surface opacity-0 group-hover:opacity-100'
                  }`}
                  title={isSelected ? 'Auswahl entfernen' : 'Auswählen'}
                  aria-label={isSelected ? 'Auswahl entfernen' : 'Auswählen'}
                >
                  {isSelected && <Check size={12} strokeWidth={3} />}
                </button>

                <div className="mb-4 flex items-start justify-between gap-2 pr-7">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-display text-lg font-bold tabular-nums ${inv.status === 'cancelled' ? 'text-muted line-through' : isDraft ? 'text-amber-100' : 'text-ink'}`}>{inv.number || DRAFT_NUMBER_LABEL}</span>
                      {isDraft && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                          <Edit2 size={9} /> Entwurf
                        </span>
                      )}
                      {inv.recurringId && (
                        <span className="flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-300" title="Aus wiederkehrender Rechnung erzeugt">
                          <Repeat size={9} />
                        </span>
                      )}
                      {inv.reminders.length > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                          <AlertTriangle size={10} /> M{inv.reminders.reduce((m, r) => Math.max(m, r.level), 0)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[11px] font-medium text-muted">{customer?.name}</div>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] leading-relaxed text-muted tabular-nums">
                      Erstellt: {fmtDate(inv.createdAt)}<br />
                      Fällig: {fmtDate(inv.dueDate)}
                    </div>
                    {/* Status-Chip — bei aktiven Rechnungen togglebar */}
                    {!isDraft ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePaid(inv.id); }}
                        className={`flex h-6 w-fit items-center gap-1.5 rounded-full px-2.5 transition-all hover:scale-105 active:scale-95 ${
                          inv.paid
                            ? 'bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-paper'
                            : overdue
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-paper'
                              : 'bg-divider text-muted hover:bg-ink hover:text-paper'
                        }`}
                        title="Klick wechselt den Zahlungsstatus"
                      >
                        <Check size={10} strokeWidth={3} />
                        <span className="text-[9px] font-black uppercase tracking-wider">
                          {inv.paid ? 'Bezahlt' : overdue ? 'Überfällig' : 'Offen'}
                        </span>
                      </button>
                    ) : (
                      <span className="flex h-6 w-fit items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 text-amber-200">
                        <Edit2 size={10} />
                        <span className="text-[9px] font-black uppercase tracking-wider">Entwurf</span>
                      </span>
                    )}
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-xl font-bold text-ink">{fmtEuro(displayTotal)}</div>
                    {totalFees > 0 && (
                      <div className="text-[10px] font-bold text-red-400">
                        + {fmtEuro(totalFees)} Gebühr
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-muted">
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
        templates={state.invoiceTemplates}
        editingDraft={editingDraft}
        onSave={handleCreate}
        onSaveDraft={handleSaveDraft}
        onCreateTemplate={handleCreateTemplate}
        onCreateRecurring={handleCreateRecurring}
        onCancel={() => { setCreateOpen(false); setEditingDraftId(null); }}
      />

      <ContextMenu
        position={menu}
        onClose={() => setMenu(null)}
        items={menu ? (() => {
          const inv = state.invoices.find(i => i.id === menu.invoiceId);
          const isCancelled = inv?.status === 'cancelled';
          const isStorno    = !!inv?.cancelsInvoiceId;
          const isDraft     = inv?.status === 'draft';
          const overdue = inv && !isCancelled && !isStorno && !isDraft && isOverdue(inv);
          const hasReminders = (inv?.reminders.length ?? 0) > 0;

          // Drafts: eigenes, schlankes Menü — kein PDF (gibt es noch nicht), keine Stornierung
          if (isDraft) {
            return [
              { label: 'Details öffnen', icon: <Eye size={13} />, onClick: () => setDrawerInvoiceId(menu.invoiceId) },
              { label: 'Bearbeiten', icon: <Edit2 size={13} />, onClick: () => { setEditingDraftId(menu.invoiceId); setCreateOpen(true); } },
              { type: 'separator' },
              { label: 'Entwurf verwerfen', icon: <Trash2 size={13} />, danger: true, onClick: () => setDeletingId(menu.invoiceId) },
            ];
          }

          const items: any[] = [
            { label: 'Details öffnen',     icon: <Eye size={13} />, onClick: () => setDrawerInvoiceId(menu.invoiceId) },
            { type: 'separator' },
            { label: 'Rechnung (PDF)',     icon: <Download size={13} />, onClick: () => redownload(menu.invoiceId) },
            { label: 'Tätigkeitsbericht',  icon: <ClipboardList size={13} />, onClick: () => downloadReport(menu.invoiceId) },
            { label: 'ZUGFeRD-XML',        icon: <FileCode2 size={13} />, onClick: () => downloadXml(menu.invoiceId) },
          ];
          if (hasReminders) {
            items.push({ label: 'Mahnung (PDF)', icon: <Download size={13} />, onClick: () => {
              const customer = state.customers.find(c => c.id === inv?.customerId);
              if (inv && state.issuer && customer) downloadDunningPdf(inv, state.issuer, customer);
            } });
            items.push({ label: 'Mahnung entfernen', icon: <Trash2 size={13} />, danger: true, onClick: () => removeReminder(menu.invoiceId) });
          }
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

      <InvoiceDetailDrawer
        open={drawerInvoiceId !== null && state.invoices.some(i => i.id === drawerInvoiceId)}
        invoice={state.invoices.find(i => i.id === drawerInvoiceId) ?? null}
        onClose={() => setDrawerInvoiceId(null)}
        onTogglePaid={(id) => togglePaid(id)}
        onDownloadPdf={(id) => redownload(id)}
        onDownloadReport={(id) => downloadReport(id)}
        onDownloadXml={(id) => downloadXml(id)}
        onDownloadDunning={(id) => {
          const inv = state.invoices.find(i => i.id === id);
          const customer = inv && state.customers.find(c => c.id === inv.customerId);
          if (inv && customer) downloadDunningPdf(inv, state.issuer, customer);
        }}
        onRemoveReminder={(id) => removeReminder(id)}
        onAddReminder={(id) => { setDrawerInvoiceId(null); setDunningId(id); }}
        onCancelInvoice={(id) => { setDrawerInvoiceId(null); setCancellingId(id); }}
        onDelete={(id) => { setDrawerInvoiceId(null); remove(id); }}
        onEditDraft={(id) => { setDrawerInvoiceId(null); setEditingDraftId(id); setCreateOpen(true); }}
        onNavigateCustomer={(customerId) => {
          setDrawerInvoiceId(null);
          navigateTo?.('customers', { view: 'customers', customerId });
        }}
        onNavigateProject={(projectId) => {
          setDrawerInvoiceId(null);
          navigateTo?.('projects', { view: 'projects', projectId });
        }}
      />
    </>
  );
}
