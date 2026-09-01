import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, FileCode2, ClipboardList, ChevronDown, Bookmark, Save, X, Repeat, Eye, EyeOff } from 'lucide-react';
import type {
  Customer, Project, TimeEntry, Invoice, Issuer, InvoiceItem,
  InvoiceTemplate, RecurringInvoice,
} from '../types';
import { CustomSelect } from './CustomSelect';
import { DatePicker } from './DatePicker';
import { InvoiceItemsTable } from './InvoiceItemsTable';
import { TimeEntryPicker } from './TimeEntryPicker';
import { InvoicePreviewPane } from './InvoicePreviewPane';
import { RecurringSetupModal } from './RecurringSetupModal';
import { applyTemplate, computeTotals, inferInvoiceMode, templateFromInvoice } from '../utils/templates';
import { collectEInvoiceIssues } from '../utils/eInvoiceXml';
import { newNumericId } from '../sync/ids';
import { DRAFT_NUMBER } from '../sync/numbers';

interface Props {
  open: boolean;
  customers: Customer[];
  projects: Project[];
  entries: TimeEntry[];
  issuer: Issuer;
  templates: InvoiceTemplate[];
  editingDraft?: Invoice | null;        // nicht-null = Draft-Edit-Modus
  onSave: (invoice: Invoice, options: { includeReport: boolean }) => void;
  onSaveDraft: (invoice: Invoice) => void;
  onCreateTemplate: (template: InvoiceTemplate) => void;
  onCreateRecurring: (recurring: RecurringInvoice) => void;
  onCancel: () => void;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoFromTs(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

interface SectionProps {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
function Section({ title, hint, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-divider bg-paper/60">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left"
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink">{title}</div>
          {hint && <div className="text-[10px] text-muted">{hint}</div>}
        </div>
        <motion.div animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.18 }}>
          <ChevronDown size={14} className="text-muted" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-divider px-3 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InvoiceCreateModal({
  open, customers, projects, entries, issuer,
  templates, editingDraft, onSave, onSaveDraft, onCreateTemplate, onCreateRecurring, onCancel,
}: Props) {
  const [customerId, setCustomerId] = useState<number>(0);
  const [projectId, setProjectId] = useState<number>(0);
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [entryIds, setEntryIds] = useState<number[]>([]);
  const [serviceType, setServiceType] = useState('Dienstleistung');
  const [notes, setNotes] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [createdAt, setCreatedAt] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 14));
  const [includeReport, setIncludeReport] = useState(true);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId);
  const availableProjects = useMemo(
    () => projects.filter((p) => p.customerId === customerId),
    [projects, customerId],
  );

  // Wenn der Nutzer manuell tippt, markieren wir als dirty
  const markDirty = useCallback(() => {
    if (!dirty) setDirty(true);
  }, [dirty]);

  // Initial-Belegung
  useEffect(() => {
    if (!open) return;
    setError('');
    setDirty(false);
    setConfirmClose(false);
    setShowSaveTemplate(false);
    setTemplateName('');
    setPendingTemplateId(null);

    if (editingDraft) {
      setCustomerId(editingDraft.customerId);
      setProjectId(editingDraft.projectId ?? 0);
      setFrom(isoFromTs(editingDraft.periodFrom));
      setTo(isoFromTs(editingDraft.periodTo));
      setItems(editingDraft.items.map((it) => ({ ...it })));
      setEntryIds([...editingDraft.entryIds]);
      setServiceType('Dienstleistung');
      setNotes(editingDraft.notes);
      setInvoiceNumber(editingDraft.number);
      setCreatedAt(isoFromTs(editingDraft.createdAt));
      setDueDate(isoFromTs(editingDraft.dueDate));
      setIncludeReport(editingDraft.entryIds.length > 0);
    } else {
      setCustomerId(customers[0]?.id ?? 0);
      setProjectId(0);
      setFrom(startOfMonthISO());
      setTo(todayISO());
      setItems([]);
      setEntryIds([]);
      setServiceType('Dienstleistung');
      setNotes('');
      // Bewusst leer: Die Nummer wird erst beim Finalisieren vergeben, damit
      // nicht jeder Entwurf eine verbrennt und zwei Geräte nicht dieselbe
      // ziehen. Wer eine eigene Nummer will, trägt sie hier ein.
      setInvoiceNumber(DRAFT_NUMBER);
      setCreatedAt(todayISO());
      setDueDate(addDaysISO(todayISO(), 14));
      setIncludeReport(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingDraft]);

  // Wenn der Nutzer den Kunden wechselt, Projekt zurücksetzen
  const changeCustomer = (id: number) => {
    setCustomerId(id);
    setProjectId(0);
    markDirty();
  };

  // VAT-Satz aus Issuer
  const vatRate = issuer.smallBusiness ? 0 : issuer.vatRate;
  const totals = useMemo(() => computeTotals(items, vatRate), [items, vatRate]);

  // Fehlende Pflichtangaben für die E-Rechnung (Absender + gewählter Kunde)
  const eInvoiceIssues = useMemo(
    () => collectEInvoiceIssues(issuer, customer),
    [issuer, customer],
  );

  // Aktuelles Invoice-Objekt für die Preview + zum Speichern
  const buildInvoice = (status: 'active' | 'draft', explicitId?: string): Invoice => ({
    id: explicitId ?? editingDraft?.id ?? String(newNumericId()),
    number: invoiceNumber.trim(),
    customerId,
    projectId: projectId === 0 ? null : projectId,
    mode: inferInvoiceMode(items),
    periodFrom: new Date(from + 'T00:00:00').getTime(),
    periodTo: new Date(to + 'T23:59:59').getTime(),
    createdAt: new Date(createdAt + 'T12:00:00').getTime(),
    dueDate: new Date(dueDate + 'T12:00:00').getTime(),
    items,
    entryIds,
    subtotal: totals.subtotal,
    vatRate,
    vatAmount: totals.vatAmount,
    total: totals.total,
    notes: notes.trim(),
    paid: false,
    status,
    reminders: editingDraft?.reminders ?? [],
    recurringId: editingDraft?.recurringId,
  });

  const previewInvoice = useMemo(() => {
    if (!customer || items.length === 0) return null;
    return buildInvoice('draft');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, items, invoiceNumber, vatRate, totals, from, to, createdAt, dueDate, notes, customerId, projectId]);

  // Validierung
  const validate = (): string | null => {
    if (!customer) return 'Kunde wählen';
    const hasCustAddr = customer.street || customer.address;
    if (!hasCustAddr) return 'Kunde hat keine Adresse — Rechnung wäre nicht vollständig.';
    if (!issuer.name || !issuer.street || !issuer.city)
      return 'Absenderdaten in Einstellungen (Name, Straße, Stadt) fehlen.';
    if (items.length === 0) return 'Mindestens eine Position erforderlich.';
    if (items.some((it) => !it.description.trim())) return 'Mindestens eine Position hat keine Beschreibung.';
    if (items.some((it) => it.kind === 'time' && it.unitPrice <= 0))
      return 'Mindestens ein Zeit-Eintrag hat keinen Stundensatz hinterlegt.';
    return null;
  };

  const handleFinalize = () => {
    const err = validate();
    if (err) { setError(err); return; }
    const finalInvoice = buildInvoice('active');
    onSave(finalInvoice, {
      includeReport: includeReport && entryIds.length > 0,
    });
  };

  const handleSaveDraft = () => {
    if (!customer) { setError('Kunde wählen'); return; }
    if (items.length === 0) { setError('Auch Entwürfe brauchen mindestens eine Position.'); return; }
    onSaveDraft(buildInvoice('draft'));
  };

  const handleApplyTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const draft = applyTemplate(tpl);
    if (draft.customerId) setCustomerId(draft.customerId);
    if (draft.projectId) setProjectId(draft.projectId);
    setItems(draft.items);
    setServiceType(draft.serviceType);
    setNotes(draft.notes);
    setDueDate(addDaysISO(todayISO(), draft.dueDays));
    setPendingTemplateId(id);
    markDirty();
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    const tpl = templateFromInvoice({
      id: String(newNumericId()),
      name: templateName,
      serviceType,
      notes,
      dueDays: 14,
      items,
      customerId: customerId || undefined,
      projectId: projectId || undefined,
      createdAt: Date.now(),
    });
    onCreateTemplate(tpl);
    setTemplateName('');
    setShowSaveTemplate(false);
    setPendingTemplateId(tpl.id);
  };

  const handleRecurringConfirm = (cadence: RecurringInvoice['cadence'], dayOfPeriod: number) => {
    if (!pendingTemplateId || !customer) return;
    const now = Date.now();
    const recurring: RecurringInvoice = {
      id: String(now),
      templateId: pendingTemplateId,
      customerId: customer.id,
      cadence,
      dayOfPeriod,
      nextDueAt: now,
      active: true,
    };
    onCreateRecurring(recurring);
    setRecurringOpen(false);
  };

  // Keyboard-Shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (pickerOpen || recurringOpen || confirmClose) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleFinalize();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveDraft();
      } else if (e.key === 'Escape') {
        if (dirty) setConfirmClose(true);
        else onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty, items, customerId, pickerOpen, recurringOpen, confirmClose]);

  const headerTitle = editingDraft ? 'Entwurf bearbeiten' : 'Neue Rechnung';

  const customerHasAddrIssue = customer && !customer.street && !customer.address;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-sm"
            onClick={() => (dirty ? setConfirmClose(true) : onCancel())}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className={`relative z-10 flex max-h-[94vh] w-full ${showPreview ? 'max-w-[1500px]' : 'max-w-3xl'} flex-col overflow-hidden kv-overlay text-ink`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-divider bg-paper/30 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/5">
                  <FileText size={15} className="text-accent" />
                </div>
                <div>
                  <div className="text-sm font-bold uppercase tracking-wide">{headerTitle}</div>
                  <div className="text-[10px] text-muted">
                    {editingDraft
                      ? `Entwurf · zuletzt geändert ${new Date(editingDraft.createdAt).toLocaleDateString('de-DE')}`
                      : 'Beim Speichern als Entwurf bleibt diese Rechnung außerhalb der Umsatz-Statistik.'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {templates.length > 0 && !editingDraft && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && handleApplyTemplate(e.target.value)}
                    className="h-8 cursor-pointer rounded-md border border-divider bg-paper px-2 text-[10px] font-bold uppercase tracking-widest text-ink outline-none hover:border-ink"
                  >
                    <option value="">Vorlage anwenden…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2 text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:border-ink hover:text-ink"
                  title={showPreview ? 'Vorschau ausblenden' : 'Vorschau einblenden'}
                >
                  {showPreview ? <EyeOff size={11} /> : <Eye size={11} />}
                  Vorschau
                </button>
                <button
                  onClick={() => (dirty ? setConfirmClose(true) : onCancel())}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink"
                  aria-label="Schließen"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* Form */}
              <div className={`flex flex-col gap-3 overflow-y-auto p-5 ${showPreview ? 'w-1/2 border-r border-divider' : 'w-full'}`}>
                {/* Kunde + Projekt */}
                <Section title="Kunde & Zeitraum">
                  <div className="grid grid-cols-2 gap-3">
                    <CustomSelect
                      id="invCustomer"
                      label="Kunde"
                      value={customerId}
                      options={customers}
                      onChange={(v) => changeCustomer(v as number)}
                    />
                    <CustomSelect
                      id="invProject"
                      label="Projekt"
                      value={projectId}
                      options={[{ id: 0, name: 'Alle Projekte' }, ...availableProjects]}
                      onChange={(v) => { setProjectId(v as number); markDirty(); }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <DatePicker label="Leistung von" value={from} onChange={(v) => { setFrom(v); markDirty(); }} />
                    <DatePicker label="Leistung bis" value={to} onChange={(v) => { setTo(v); markDirty(); }} />
                  </div>
                  {customerHasAddrIssue && (
                    <div className="mt-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-[11px] text-warning">
                      Kunde hat keine Adresse hinterlegt — Rechnung kann so nicht finalisiert werden.
                    </div>
                  )}
                </Section>

                {/* Positionen */}
                <Section title="Positionen">
                  <div className="mb-3 flex flex-col">
                    <label className="mb-1 kv-label">
                      Art der Leistung (Voreintrag für neue Zeit-Items)
                    </label>
                    <input
                      type="text"
                      value={serviceType}
                      onChange={(e) => { setServiceType(e.target.value); markDirty(); }}
                      placeholder="z. B. Webentwicklung"
                      className="h-10 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
                    />
                  </div>
                  <InvoiceItemsTable
                    items={items}
                    onChange={(next) => { setItems(next); markDirty(); }}
                    onPickTimeEntries={() => setPickerOpen(true)}
                  />
                </Section>

                {/* Metadaten */}
                <Section title="Rechnungs-Meta" defaultOpen={false} hint="Nummer, Datum, Fälligkeit">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col">
                      <label className="mb-1 kv-label">Rechnungs-Nr.</label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        placeholder="wird beim Finalisieren vergeben"
                        onChange={(e) => { setInvoiceNumber(e.target.value); markDirty(); }}
                        className="h-10 rounded-md border border-divider bg-paper px-3 text-sm tabular-nums text-ink outline-none placeholder:text-muted placeholder:text-[11px] placeholder:font-normal focus:border-accent font-bold"
                      />
                    </div>
                    <DatePicker label="Datum" value={createdAt} onChange={(v) => { setCreatedAt(v); markDirty(); }} />
                    <DatePicker label="Fällig bis" value={dueDate} onChange={(v) => { setDueDate(v); markDirty(); }} />
                  </div>
                </Section>

                {/* Notizen + Paket */}
                <Section title="Notizen & Dokumenten-Paket" defaultOpen={false}>
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={notes}
                      onChange={(e) => { setNotes(e.target.value); markDirty(); }}
                      rows={2}
                      placeholder="Optionaler Zusatztext für die PDF"
                      className="resize-none rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
                    />

                    <div
                      onClick={() => { setIncludeReport(!includeReport); markDirty(); }}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                        includeReport ? 'border-accent/40 bg-paper' : 'border-divider bg-surface/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-full ${includeReport ? 'bg-ink/10 text-ink' : 'bg-neutral-soft text-muted'}`}>
                          <ClipboardList size={13} />
                        </div>
                        <div>
                          <div className="text-[12px] font-bold text-ink">Tätigkeitsbericht</div>
                          <div className="text-[10px] text-muted">Leistungsnachweis miterzeugen</div>
                        </div>
                      </div>
                      <motion.div
                        animate={{
                          backgroundColor: includeReport ? 'var(--color-ink)' : 'var(--color-paper)',
                          borderColor: includeReport ? 'var(--color-ink)' : 'var(--color-divider)',
                        }}
                        transition={{ duration: 0.15 }}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 border-divider"
                      >
                        {includeReport && (
                          <svg
                            className="h-3 w-3 text-paper"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <motion.path
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              d="M2.5 6L5 8.5L9.5 3.5"
                            />
                          </svg>
                        )}
                      </motion.div>
                    </div>

                    {/* ZUGFeRD-Status — kein Schalter, die Einbettung wird global in den
                        Einstellungen gesteuert; hier zählt nur, ob sie greifen kann. */}
                    <div className={`flex items-start gap-3 rounded-lg border p-3 ${
                      eInvoiceIssues.length > 0 ? 'border-warning-line bg-warning-soft' : 'border-divider bg-surface/50'
                    }`}>
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        eInvoiceIssues.length > 0 ? 'bg-warning-soft text-warning' : 'bg-ink/10 text-ink'
                      }`}>
                        <FileCode2 size={13} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12px] font-bold text-ink">E-Rechnung (ZUGFeRD)</div>
                        {eInvoiceIssues.length > 0 ? (
                          <div className="text-[10px] text-muted">
                            Stammdaten unvollständig — es wird nur ein reines PDF erzeugt:{' '}
                            {eInvoiceIssues.join(', ')}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted">
                            XML nach EN 16931 wird ins PDF eingebettet
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Section>

                {/* Templates / Recurring */}
                <Section title="Vorlagen & Wiederkehrend" defaultOpen={false} hint="Aus dem aktuellen Stand eine Vorlage erstellen">
                  <div className="flex flex-col gap-3">
                    {!showSaveTemplate ? (
                      <button
                        type="button"
                        onClick={() => setShowSaveTemplate(true)}
                        className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink"
                      >
                        <Bookmark size={12} /> Als Vorlage speichern
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder={'Name der Vorlage (z. B. „Monats-Retainer")'}
                          autoFocus
                          className="h-10 flex-1 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={handleSaveTemplate}
                          disabled={!templateName.trim() || items.length === 0}
                          className="cursor-pointer rounded-md bg-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowSaveTemplate(false); setTemplateName(''); }}
                          className="cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted hover:bg-divider hover:text-ink"
                        >
                          Abbrechen
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setRecurringOpen(true)}
                      disabled={!pendingTemplateId}
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                      title={pendingTemplateId ? 'Wiederkehrende Rechnung an die aktuelle Vorlage anhängen' : 'Erst Vorlage speichern, dann Wiederkehrend anhängen'}
                    >
                      <Repeat size={12} /> Wiederkehrend einrichten
                      {!pendingTemplateId && <span className="text-[9px] text-muted">(zuerst Vorlage speichern)</span>}
                    </button>
                  </div>
                </Section>

                {error && (
                  <div className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div>
                )}
              </div>

              {/* Preview */}
              {showPreview && (
                <div className="flex w-1/2 flex-col bg-paper/20 p-3">
                  <InvoicePreviewPane
                    invoice={previewInvoice}
                    issuer={issuer}
                    customer={customer ?? null}
                    entries={includeReport && entryIds.length > 0 ? entries.filter((e) => entryIds.includes(e.id)) : undefined}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-divider bg-paper/30 px-5 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">
                <span className="font-bold">{totals.subtotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
                {vatRate > 0 && <span> · zzgl. {vatRate}% USt.: {totals.vatAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>}
                <span> · Gesamt: </span>
                <span className="font-bold text-ink">{totals.total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => (dirty ? setConfirmClose(true) : onCancel())}
                  className="cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted hover:bg-divider hover:text-ink"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveDraft}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink"
                  title="Strg+S — als Entwurf speichern"
                >
                  <Save size={12} /> Entwurf
                </button>
                <button
                  onClick={handleFinalize}
                  className="cursor-pointer rounded-md bg-ink px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent active:scale-95"
                  title="Strg+Enter — finalisieren und PDF erzeugen"
                >
                  {editingDraft ? 'Finalisieren & PDF' : 'Erstellen & PDF'}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Sub-Modals */}
          <TimeEntryPicker
            open={pickerOpen}
            entries={entries}
            customers={customers}
            projects={projects}
            customerId={customerId}
            projectId={projectId}
            serviceType={serviceType}
            periodFrom={from}
            periodTo={to}
            excludeEntryIds={entryIds}
            onConfirm={(newItems, newEntryIds) => {
              // Der Picker bekommt `excludeEntryIds` und blendet bereits
              // enthaltene Einträge aus — Überschneidungen dürfte es hier nicht
              // geben. Das frühere Sicherheitsnetz filterte allerdings nur die
              // IDs und ließ die Positionen unangetastet. Käme ein Eintrag doch
              // zweimal durch, stünde er einmal in `entryIds`, aber zweimal auf
              // der Rechnung: Der Kunde zahlt dieselbe Stunde doppelt.
              //
              // Teilweise filtern geht nicht: `newItems` sind pro Projekt
              // zusammengefasst, `newEntryIds` liegen einzeln vor — die Listen
              // sind unterschiedlich lang und nicht paarweise zuzuordnen.
              // Deshalb alles oder nichts. Eine Überschneidung ist ein Fehler
              // im Programm, kein Bedienfehler; sie wird sichtbar gemacht,
              // statt eine halb übernommene Auswahl zu erzeugen.
              const existing = new Set(entryIds);
              const doppelt = newEntryIds.filter((id) => existing.has(id));

              if (newEntryIds.length === 0) {
                setPickerOpen(false);
                return;
              }
              if (doppelt.length > 0) {
                console.error('Picker lieferte bereits enthaltene Einträge:', doppelt);
                alert(
                  'Diese Zeiteinträge stehen bereits auf der Rechnung und wurden nicht '
                  + 'noch einmal hinzugefügt. Bitte prüfe die Positionen.',
                );
                setPickerOpen(false);
                return;
              }
              setItems((prev) => [...prev, ...newItems]);
              setEntryIds((prev) => [...prev, ...newEntryIds]);
              setPickerOpen(false);
              markDirty();
            }}
            onCancel={() => setPickerOpen(false)}
          />

          <RecurringSetupModal
            open={recurringOpen}
            onConfirm={handleRecurringConfirm}
            onCancel={() => setRecurringOpen(false)}
          />

          {/* Confirm Discard */}
          <AnimatePresence>
            {confirmClose && (
              <motion.div
                className="fixed inset-0 z-[70] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="absolute inset-0 bg-scrim" onClick={() => setConfirmClose(false)} />
                <motion.div
                  className="relative z-10 w-full max-w-sm kv-overlay p-5 text-ink"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                >
                  <div className="text-sm font-bold">Eingaben verwerfen?</div>
                  <div className="mt-2 text-[12px] text-muted">
                    Du hast Änderungen vorgenommen. Beim Schließen ohne „Entwurf speichern" gehen sie verloren.
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted hover:bg-divider hover:text-ink"
                    >
                      Weiter bearbeiten
                    </button>
                    <button
                      onClick={() => { setConfirmClose(false); onCancel(); }}
                      className="cursor-pointer rounded-md bg-danger-soft px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-danger transition-all hover:bg-danger-solid hover:text-ink"
                    >
                      Verwerfen
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
