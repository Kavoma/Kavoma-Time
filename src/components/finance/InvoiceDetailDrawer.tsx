import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, ClipboardList, FileCode2, Ban, Trash2, AlertTriangle,
  Edit2, Repeat, Check, ChevronRight, Building2, FolderKanban, FileWarning,
} from 'lucide-react';
import type { Invoice } from '../../types';
import { useAppState } from '../../state/AppStateContext';
import { renderInvoicePreviewDataUrl } from '../../utils/invoicePdf';

interface Props {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onTogglePaid: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onDownloadReport: (id: string) => void;
  onDownloadXml: (id: string) => void;
  onDownloadDunning: (id: string) => void;
  onRemoveReminder: (id: string) => void;
  onAddReminder: (id: string) => void;
  onCancelInvoice: (id: string) => void;
  onDelete: (id: string) => void;
  onEditDraft: (id: string) => void;
  onNavigateCustomer: (customerId: number) => void;
  onNavigateProject: (projectId: number) => void;
}

type DrawerTab = 'overview' | 'pdf';

function fmtEuro(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function isOverdue(inv: Invoice): boolean {
  if (inv.paid) return false;
  const due = new Date(inv.dueDate);
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return due < now;
}

export function InvoiceDetailDrawer({
  open, invoice, onClose,
  onTogglePaid, onDownloadPdf, onDownloadReport, onDownloadXml,
  onDownloadDunning, onRemoveReminder, onAddReminder, onCancelInvoice, onDelete, onEditDraft,
  onNavigateCustomer, onNavigateProject,
}: Props) {
  const { state } = useAppState();
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // PDF wird erst gerendert, wenn der PDF-Tab zum ersten Mal geöffnet wird
  const [pdfRequested, setPdfRequested] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('overview');
      setConfirmDelete(false);
      setPdfRequested(false);
    }
  }, [open, invoice?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const customer = state && invoice ? state.customers.find((c) => c.id === invoice.customerId) : undefined;
  const project = state && invoice && invoice.projectId != null
    ? state.projects.find((p) => p.id === invoice.projectId)
    : undefined;

  // Live-PDF nur rendern, wenn der PDF-Tab angefordert wurde
  const pdfUrl = useMemo(() => {
    if (!pdfRequested || !invoice || !customer || !state) return null;
    try {
      const entries = invoice.entryIds.length > 0
        ? state.entries.filter((e) => invoice.entryIds.includes(e.id))
        : undefined;
      const raw = renderInvoicePreviewDataUrl(invoice, state.issuer, customer, entries);
      return `${raw}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
    } catch (e) {
      console.error('PDF-Vorschau fehlgeschlagen:', e);
      return null;
    }
  }, [pdfRequested, invoice, customer, state]);

  if (!invoice) return null;

  const isDraft = invoice.status === 'draft';
  const isCancelled = invoice.status === 'cancelled';
  const isStorno = !!invoice.cancelsInvoiceId;
  const overdue = !isDraft && !isCancelled && !isStorno && isOverdue(invoice);
  const hasReminders = invoice.reminders.length > 0;
  const totalFees = invoice.reminders.reduce((s, r) => s + r.fee, 0);
  const displayTotal = invoice.total + totalFees;

  const statusChip = (() => {
    if (isDraft) return { label: 'Entwurf', cls: 'bg-warning-soft text-warning border-warning-line' };
    if (isCancelled) return { label: 'Storniert', cls: 'bg-neutral-soft text-muted border-neutral-line' };
    if (isStorno) return { label: 'Storno-Rechnung', cls: 'bg-neutral-soft text-muted border-neutral-line' };
    if (invoice.paid) return { label: 'Bezahlt', cls: 'bg-success-soft text-success border-success-line' };
    if (overdue) return { label: 'Überfällig', cls: 'bg-danger-soft text-danger border-danger-line' };
    return { label: 'Offen', cls: 'bg-warning-soft text-warning border-warning-line' };
  })();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-x-0 top-10 bottom-0 z-50 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.aside
            className="absolute right-3 top-3 bottom-3 flex w-[640px] max-w-[calc(60vw-24px)] flex-col overflow-hidden rounded-xl border border-divider bg-surface text-ink shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.25 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Rechnung ${invoice.number}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="mt-1 inline-block h-6 w-1 shrink-0 rounded-full"
                  style={{ background: customer?.color ?? '#525252' }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-bold tabular-nums leading-tight">{invoice.number}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusChip.cls}`}>
                      {statusChip.label}
                    </span>
                    {invoice.recurringId && (
                      <span className="rounded-full border border-info-line bg-info-soft px-1.5 py-0.5 text-info" title="Aus wiederkehrender Rechnung">
                        <Repeat size={9} />
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{customer?.name ?? 'Unbekannter Kunde'}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                title="Schließen (Esc)"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-divider hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-divider px-3">
              {([['overview', 'Übersicht'], ['pdf', 'PDF']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id); if (id === 'pdf') setPdfRequested(true); }}
                  className={`relative px-3 py-2.5 text-xs font-bold transition-colors ${ tab === id ? 'text-ink' : 'text-muted hover:text-ink' }`}
                >
                  {label}
                  {tab === id && (
                    <motion.div layoutId="invoice-drawer-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === 'overview' ? (
                <div className="flex flex-col gap-5 p-5">
                  {/* Status-Toggle (nur aktive Rechnungen) */}
                  {!isDraft && !isCancelled && !isStorno && (
                    <button
                      type="button"
                      onClick={() => onTogglePaid(invoice.id)}
                      className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                        invoice.paid
                          ? 'border-success-line bg-success-soft'
                          : 'border-divider bg-paper hover:border-ink/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-full ${invoice.paid ? 'bg-success-soft text-success' : 'bg-neutral-soft text-muted'}`}>
                          <Check size={14} strokeWidth={3} />
                        </div>
                        <div className="text-left">
                          <div className="text-[12px] font-bold text-ink">{invoice.paid ? 'Bezahlt' : 'Als bezahlt markieren'}</div>
                          <div className="text-[10px] text-muted">
                            {invoice.paid && invoice.paidAt ? `am ${fmtDate(invoice.paidAt)}` : 'Klick wechselt den Zahlungsstatus'}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-muted" />
                    </button>
                  )}

                  {/* Beträge */}
                  <Section title="Beträge">
                    <dl className="flex flex-col gap-1 text-[12px]">
                      <Row label="Netto">{fmtEuro(invoice.subtotal)}</Row>
                      <Row label={`USt (${invoice.vatRate} %)`}>{fmtEuro(invoice.vatAmount)}</Row>
                      {totalFees > 0 && <Row label="Mahngebühren" tone="warn">{fmtEuro(totalFees)}</Row>}
                      <div className="mt-1 flex items-center justify-between border-t border-divider pt-1.5">
                        <dt className="text-[11px] font-bold uppercase tracking-widest text-muted">Gesamt</dt>
                        <dd className="text-base font-bold tabular-nums text-ink">{fmtEuro(displayTotal)}</dd>
                      </div>
                    </dl>
                  </Section>

                  {/* Daten */}
                  <Section title="Daten">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                      <Field label="Erstellt">{fmtDate(invoice.createdAt)}</Field>
                      <Field label="Fällig">
                        <span className={overdue ? 'font-bold text-danger' : ''}>{fmtDate(invoice.dueDate)}</span>
                      </Field>
                      <Field label="Leistungszeitraum">
                        {fmtDate(invoice.periodFrom)} – {fmtDate(invoice.periodTo)}
                      </Field>
                      <Field label="Modus">
                        {invoice.mode === 'hourly' ? 'Stundenbasis' : invoice.mode === 'fixed' ? 'Pauschal' : 'Gemischt'}
                      </Field>
                    </dl>
                  </Section>

                  {/* Verknüpfungen */}
                  <Section title="Verknüpft">
                    <div className="flex flex-col gap-1.5">
                      {customer && (
                        <LinkRow icon={Building2} label="Kunde" value={customer.name} onClick={() => onNavigateCustomer(customer.id)} />
                      )}
                      {project && (
                        <LinkRow icon={FolderKanban} label="Projekt" value={project.name} onClick={() => onNavigateProject(project.id)} />
                      )}
                      {!project && invoice.projectId == null && (
                        <div className="rounded-md border border-divider bg-paper/40 px-3 py-2 text-[11px] text-muted">
                          Alle Projekte des Kunden
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Positionen */}
                  <Section title={`Positionen (${invoice.items.length})`}>
                    <ul className="flex flex-col gap-1">
                      {invoice.items.map((it, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-2 rounded-md border border-divider bg-paper/50 px-3 py-2 text-[12px]"
                        >
                          <span className="min-w-0 flex-1 truncate text-ink">
                            {it.description || <span className="italic text-muted">ohne Beschreibung</span>}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted tabular-nums">
                            {it.quantity} {it.unit}
                          </span>
                          <span className={`shrink-0 tabular-nums ${it.total < 0 ? 'text-warning' : 'text-ink'}`}>
                            {fmtEuro(it.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  {/* Mahnhistorie */}
                  {hasReminders && (
                    <Section title="Mahnhistorie">
                      <ul className="flex flex-col gap-1">
                        {invoice.reminders.map((r, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[12px]"
                          >
                            <div className="flex items-center gap-2">
                              <AlertTriangle size={11} className="text-danger" />
                              <span className="font-bold text-danger">Mahnstufe {r.level}</span>
                              <span className="text-[10px] text-muted">{fmtDate(r.sentAt)}</span>
                            </div>
                            <span className="tabular-nums text-muted">{fmtEuro(r.fee)} Gebühr</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => onDownloadDunning(invoice.id)}
                          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-xs font-bold text-ink transition-colors hover:border-ink"
                        >
                          <Download size={11} /> Mahnung-PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveReminder(invoice.id)}
                          className="kv-btn kv-btn-danger"
                        >
                          <Trash2 size={11} /> Letzte Mahnung entfernen
                        </button>
                      </div>
                    </Section>
                  )}

                  {/* Storno-Info */}
                  {(isCancelled || isStorno) && (
                    <div className="rounded-md border border-neutral-line bg-neutral-soft px-3 py-2.5 text-[12px]">
                      <div className="flex items-center gap-1.5 font-bold text-ink">
                        <Ban size={12} />
                        {isStorno ? 'Dies ist eine Storno-Rechnung' : 'Diese Rechnung wurde storniert'}
                      </div>
                      {invoice.cancellationReason && (
                        <div className="mt-1 text-muted">Grund: {invoice.cancellationReason}</div>
                      )}
                      {invoice.cancelledAt && (
                        <div className="text-[10px] text-muted">am {fmtDate(invoice.cancelledAt)}</div>
                      )}
                    </div>
                  )}

                  {/* Aktionen */}
                  <Section title="Aktionen">
                    <div className="grid grid-cols-2 gap-2">
                      {isDraft ? (
                        <ActionButton icon={Edit2} label="Entwurf bearbeiten" onClick={() => onEditDraft(invoice.id)} primary />
                      ) : (
                        <>
                          <ActionButton icon={Download} label="Rechnung-PDF" onClick={() => onDownloadPdf(invoice.id)} />
                          <ActionButton icon={ClipboardList} label="Tätigkeitsbericht" onClick={() => onDownloadReport(invoice.id)} />
                          <ActionButton icon={FileCode2} label="ZUGFeRD-XML" onClick={() => onDownloadXml(invoice.id)} />
                          {overdue && (
                            <ActionButton icon={AlertTriangle} label="Mahnung verbuchen" onClick={() => onAddReminder(invoice.id)} />
                          )}
                          {!isCancelled && !isStorno && (
                            <ActionButton icon={Ban} label="Stornieren" onClick={() => onCancelInvoice(invoice.id)} danger />
                          )}
                        </>
                      )}
                      <ActionButton
                        icon={Trash2}
                        label={isDraft ? 'Entwurf verwerfen' : 'Löschen'}
                        onClick={() => setConfirmDelete(true)}
                        danger
                      />
                    </div>

                    {confirmDelete && (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2">
                        <span className="text-[12px] text-danger">
                          {isDraft ? 'Entwurf verwerfen?' : 'Unwiderruflich löschen? (GoBD: lieber stornieren)'}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            className="kv-btn kv-btn-quiet"
                          >
                            Nein
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirmDelete(false); onDelete(invoice.id); }}
                            className="kv-btn kv-btn-danger"
                          >
                            Ja, {isDraft ? 'verwerfen' : 'löschen'}
                          </button>
                        </div>
                      </div>
                    )}
                  </Section>
                </div>
              ) : (
                /* PDF-Tab */
                <div className="h-full bg-scrim">
                  {pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      title={`Rechnung ${invoice.number}`}
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                      <FileWarning size={26} className="text-warning" />
                      <div className="text-sm font-bold">Vorschau nicht verfügbar</div>
                      <div className="max-w-xs text-[11px] text-muted">
                        Die PDF-Vorschau konnte nicht erzeugt werden. Lade die Rechnung über „Rechnung-PDF" herunter.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────── Sub-Komponenten ────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="kv-label">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${tone === 'warn' ? 'text-warning' : 'text-ink'}`}>{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="text-ink/90">{children}</dd>
    </div>
  );
}

function LinkRow({
  icon: Icon, label, value, onClick,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-2 rounded-md border border-divider bg-paper/50 px-3 py-2 text-left text-[12px] transition-colors hover:border-accent/50 hover:bg-paper"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={12} className="shrink-0 text-muted" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</span>
        <span className="truncate font-bold text-ink">{value}</span>
      </div>
      <ChevronRight size={13} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
    </button>
  );
}

function ActionButton({
  icon: Icon, label, onClick, primary, danger,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const variant = primary ? 'kv-btn-primary' : danger ? 'kv-btn-danger' : 'kv-btn-outline';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kv-btn ${variant}`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
