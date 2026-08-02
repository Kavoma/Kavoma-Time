import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pipette, Briefcase, Mail, MapPin, FileText,
  TrendingUp, Clock, Euro, AlertCircle, FolderKanban, ScrollText, Tag as TagIcon,
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import type { Customer, CustomerStatus } from '../../types';
import { useAppState } from '../../state/AppStateContext';
import { DetailDrawer } from '../DetailDrawer';
import { TagInput } from '../TagInput';
import { DatePicker } from '../DatePicker';
import { CurrencyInput } from '../CurrencyInput';
import { Tooltip } from '../Tooltip';
import { KpiBox, DrawerSection, DrawerField, DrawerInput } from '../shared/DrawerParts';
import { collectTags, tagColors } from '../../utils/tagColor';

const PALETTE = [
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
  '#ef4444', '#f59e0b', '#22c55e', '#06b6d4',
  '#14b8a6', '#64748b',
];

const STATUS_LABEL: Record<CustomerStatus, string> = {
  active: 'Aktiv',
  paused: 'Pausiert',
  archived: 'Archiviert',
};

const STATUS_STYLE: Record<CustomerStatus, string> = {
  active: 'bg-green-500/15 text-green-300 border-green-500/30',
  paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  archived: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

interface Props {
  open: boolean;
  /** null = neuen Kunden anlegen */
  customer: Customer | null;
  onSave: (c: Omit<Customer, 'id'> & { id?: number }) => void;
  onDelete?: (id: number) => void;
  onClose: () => void;
  /** Wird aufgerufen, wenn der User in der Rechnungsliste auf eine Rechnung klickt. */
  onNavigateInvoice?: (invoiceId: string) => void;
}

function isoFromTs(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function tsFromIso(iso: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso + 'T12:00:00').getTime();
  return Number.isFinite(t) ? t : undefined;
}
function fmtEuro(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function fmtHours(seconds: number) {
  return (seconds / 3600).toFixed(1) + ' h';
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function CustomerDetailDrawer({ open, customer, onSave, onDelete, onClose, onNavigateInvoice }: Props) {
  const { state } = useAppState();

  const [name, setName] = useState('');
  const [debtorNumber, setDebtorNumber] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [rate, setRate] = useState<number | undefined>(undefined);
  const [street, setStreet] = useState('');
  const [address2, setAddress2] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('DE');
  const [vatId, setVatId] = useState('');
  const [status, setStatus] = useState<CustomerStatus>('active');
  const [tags, setTags] = useState<string[]>([]);
  const [industry, setIndustry] = useState('');
  const [notes, setNotes] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [firstContactDate, setFirstContactDate] = useState('');
  const [referredBy, setReferredBy] = useState<number | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Initialisierung beim Öffnen
  useEffect(() => {
    if (!open) return;
    if (customer) {
      setName(customer.name);
      setDebtorNumber(customer.debtorNumber ?? '');
      setColor(customer.color);
      setRate(customer.hourlyRate);
      setStreet(customer.street ?? '');
      setAddress2(customer.address2 ?? '');
      setZip(customer.zip ?? '');
      setCity(customer.city ?? '');
      setEmail(customer.email ?? '');
      setCountry(customer.country ?? 'DE');
      setVatId(customer.vatId ?? '');
      setStatus(customer.status ?? 'active');
      setTags(customer.tags ?? []);
      setIndustry(customer.industry ?? '');
      setNotes(customer.notes ?? '');
      setAcquisitionDate(isoFromTs(customer.acquisitionDate));
      setFirstContactDate(isoFromTs(customer.firstContactDate));
      setReferredBy(customer.referredBy);
    } else {
      setName('');
      setDebtorNumber(state ? String(state.nextDebtorNumber) : '');
      setColor(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      setRate(undefined);
      setStreet('');
      setAddress2('');
      setZip('');
      setCity('');
      setEmail('');
      setCountry('DE');
      setVatId('');
      setStatus('active');
      setTags([]);
      setIndustry('');
      setNotes('');
      setAcquisitionDate('');
      setFirstContactDate('');
      setReferredBy(undefined);
    }
    setDirty(false);
    setShowPicker(false);
  }, [customer, open, state]);

  const markDirty = () => setDirty(true);

  // KPIs aus AppState ableiten
  const kpis = useMemo(() => {
    if (!customer || !state) {
      return { hoursSec: 0, revenue: 0, avgRate: 0, openClaims: 0, projectCount: 0 };
    }
    const projects = state.projects.filter((p) => p.customerId === customer.id);
    const entries = state.entries.filter((e) => e.customerId === customer.id);
    const hoursSec = entries.reduce((s, e) => s + e.durationSeconds, 0);
    const invoices = state.invoices.filter((i) => i.customerId === customer.id && i.status === 'active');
    const revenue = invoices.reduce((s, i) => s + i.total, 0);
    const openClaims = invoices.filter((i) => !i.paid).reduce((s, i) => s + i.total, 0);
    const avgRate = hoursSec > 0 ? revenue / (hoursSec / 3600) : 0;
    return { hoursSec, revenue, avgRate, openClaims, projectCount: projects.length };
  }, [customer, state]);

  const customerProjects = useMemo(() => {
    if (!customer || !state) return [];
    return state.projects.filter((p) => p.customerId === customer.id);
  }, [customer, state]);

  const customerInvoices = useMemo(() => {
    if (!customer || !state) return [];
    return state.invoices
      .filter((i) => i.customerId === customer.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);
  }, [customer, state]);

  const customerContracts = useMemo(() => {
    if (!customer || !state) return [];
    return state.contracts.filter((c) => c.customerId === customer.id);
  }, [customer, state]);

  const tagSuggestions = useMemo(() => {
    if (!state) return [];
    return collectTags(state.customers);
  }, [state]);

  const handleSave = (): boolean => {
    if (!name.trim()) return false;
    onSave({
      ...(customer || {}),
      name: name.trim(),
      color,
      hourlyRate: rate && rate > 0 ? rate : undefined,
      street: street.trim() || undefined,
      address2: address2.trim() || undefined,
      zip: zip.trim() || undefined,
      city: city.trim() || undefined,
      email: email.trim() || undefined,
      debtorNumber: debtorNumber.trim() || undefined,
      country: country.trim().toUpperCase() || undefined,
      vatId: vatId.trim().toUpperCase().replace(/\s+/g, '') || undefined,
      status,
      tags,
      industry: industry.trim() || undefined,
      notes: notes.trim() || undefined,
      acquisitionDate: tsFromIso(acquisitionDate),
      firstContactDate: tsFromIso(firstContactDate),
      referredBy,
    });
    setDirty(false);
    return true;
  };

  const readContent = customer ? (
    <div className="flex flex-col gap-5 p-5">
      {/* KPI-Streifen */}
      <div className="grid grid-cols-4 gap-3">
        <KpiBox icon={Clock} label="Stunden" value={fmtHours(kpis.hoursSec)} />
        <KpiBox icon={Euro} label="Umsatz" value={fmtEuro(kpis.revenue)} />
        <KpiBox icon={TrendingUp} label="Ø Satz" value={kpis.avgRate > 0 ? `${kpis.avgRate.toFixed(0)} €/h` : '—'} />
        <KpiBox icon={AlertCircle} label="Offen" value={fmtEuro(kpis.openClaims)} tone={kpis.openClaims > 0 ? 'warn' : 'default'} />
      </div>

      {/* Status + Tags */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        {industry && (
          <span className="inline-flex items-center gap-1 rounded-full border border-divider bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            <Briefcase size={9} /> {industry}
          </span>
        )}
        {tags.length > 0 && (
          <div className="ml-1 flex flex-wrap gap-1">
            {tags.map((t) => {
              const c = tagColors(t);
              return (
                <span
                  key={t}
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                >
                  {t}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Stammdaten kompakt */}
      <DrawerSection title="Stammdaten">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <DrawerField icon={MapPin} label="Adresse">
            {[street, address2, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}
          </DrawerField>
          <DrawerField icon={Mail} label="E-Mail">{email || '—'}</DrawerField>
          <DrawerField icon={FileText} label="Debitor-Nr.">{debtorNumber || '—'}</DrawerField>
          <DrawerField icon={Euro} label="Stundensatz">{rate ? `${rate.toLocaleString('de-DE')} €/h` : '—'}</DrawerField>
          {acquisitionDate && <DrawerField icon={Clock} label="Kunde seit">{fmtDate(tsFromIso(acquisitionDate)!)}</DrawerField>}
          {firstContactDate && <DrawerField icon={Clock} label="Erstkontakt">{fmtDate(tsFromIso(firstContactDate)!)}</DrawerField>}
        </dl>
      </DrawerSection>

      {/* Projekte */}
      {customerProjects.length > 0 && (
        <DrawerSection title={`Projekte (${customerProjects.length})`} icon={FolderKanban}>
          <ul className="flex flex-col gap-1">
            {customerProjects.map((p) => {
              const pEntries = state?.entries.filter((e) => e.projectId === p.id) ?? [];
              const pSec = pEntries.reduce((s, e) => s + e.durationSeconds, 0);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-divider bg-paper/50 px-3 py-2 text-[12px]"
                >
                  <span className="truncate font-bold text-ink">{p.name}</span>
                  <span className="shrink-0 text-[11px] text-muted tabular-nums">{fmtHours(pSec)}</span>
                </li>
              );
            })}
          </ul>
        </DrawerSection>
      )}

      {/* Letzte Rechnungen */}
      {customerInvoices.length > 0 && (
        <DrawerSection title="Letzte Rechnungen" icon={ScrollText}>
          <ul className="flex flex-col gap-1">
            {customerInvoices.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => onNavigateInvoice?.(inv.id)}
                  disabled={!onNavigateInvoice}
                  className="group flex w-full items-center justify-between rounded-md border border-divider bg-paper/50 px-3 py-2 text-left text-[12px] transition-all enabled:cursor-pointer enabled:hover:border-accent/50 enabled:hover:bg-paper"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold tabular-nums">{inv.number}</span>
                    <span className="text-[10px] text-muted">{fmtDate(inv.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-ink">{fmtEuro(inv.total)}</span>
                    <InvoiceChip invoice={inv} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {/* Verträge */}
      {customerContracts.length > 0 && (
        <DrawerSection title={`Verträge (${customerContracts.length})`} icon={FileText}>
          <ul className="flex flex-col gap-1">
            {customerContracts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-divider bg-paper/50 px-3 py-2 text-[12px]"
              >
                <span className="truncate font-bold text-ink">{c.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{fmtDate(c.signedAt)}</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {/* Notizen */}
      {notes && (
        <DrawerSection title="Notizen" icon={TagIcon}>
          <div className="whitespace-pre-wrap rounded-md border border-divider bg-paper/40 px-3 py-2 text-[12px] leading-relaxed text-ink/90">
            {notes}
          </div>
        </DrawerSection>
      )}
    </div>
  ) : (
    <div className="p-5 text-center text-sm text-muted">Noch keine Daten — klicke auf Bearbeiten, um Stammdaten einzugeben.</div>
  );

  const editContent = (
    <div className="flex flex-col gap-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        <DrawerInput label="Name *" value={name} onChange={(v) => { setName(v); markDirty(); }} placeholder="Kundenname" />
        <DrawerInput label="Debitor-Nr." value={debtorNumber} onChange={(v) => { setDebtorNumber(v); markDirty(); }} placeholder="10001" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as CustomerStatus); markDirty(); }}
            className="h-10 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="active">Aktiv</option>
            <option value="paused">Pausiert</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>
        <DrawerInput label="Branche" value={industry} onChange={(v) => { setIndustry(v); markDirty(); }} placeholder="z. B. SaaS, Beratung" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DrawerInput label="Straße & Nr." value={street} onChange={(v) => { setStreet(v); markDirty(); }} placeholder="Musterstr. 1" />
        <DrawerInput label="Adresszusatz" value={address2} onChange={(v) => { setAddress2(v); markDirty(); }} placeholder="c/o, 2. OG" />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DrawerInput label="PLZ" value={zip} onChange={(v) => { setZip(v); markDirty(); }} placeholder="12345" tabular />
        <div className="col-span-2">
          <DrawerInput label="Stadt" value={city} onChange={(v) => { setCity(v); markDirty(); }} placeholder="Musterstadt" />
        </div>
        <DrawerInput label="Land" value={country} onChange={(v) => { setCountry(v.toUpperCase().slice(0, 2)); markDirty(); }} placeholder="DE" tabular />
      </div>

      {/* USt-IdNr. — Pflichtangabe für E-Rechnungen an EU-Kunden (Reverse-Charge) */}
      <DrawerInput label="USt-IdNr. (optional)" value={vatId} onChange={(v) => { setVatId(v); markDirty(); }} placeholder="DE123456789" tabular />

      <div className="grid grid-cols-2 gap-3">
        <DrawerInput label="E-Mail" value={email} onChange={(v) => { setEmail(v); markDirty(); }} placeholder="rechnung@firma.de" type="email" />
        <CurrencyInput
          label="Standard-Stundensatz"
          value={rate}
          onChange={(v) => { setRate(v); markDirty(); }}
          placeholder="0,00"
          suffix="€/h"
        />
      </div>

      <div className="flex flex-col">
        <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Tags</label>
        <TagInput
          value={tags}
          onChange={(t) => { setTags(t); markDirty(); }}
          suggestions={tagSuggestions}
          placeholder="z. B. Retainer, Strategisch…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DatePicker label="Kunde seit" value={acquisitionDate} onChange={(v) => { setAcquisitionDate(v); markDirty(); }} />
        <DatePicker label="Erstkontakt" value={firstContactDate} onChange={(v) => { setFirstContactDate(v); markDirty(); }} />
      </div>

      {state && state.customers.length > 1 && (
        <div className="flex flex-col">
          <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Empfohlen von</label>
          <select
            value={referredBy ?? ''}
            onChange={(e) => { setReferredBy(e.target.value ? Number(e.target.value) : undefined); markDirty(); }}
            className="h-10 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">— niemand —</option>
            {state.customers.filter((c) => c.id !== customer?.id).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col">
        <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Notizen</label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); markDirty(); }}
          rows={3}
          placeholder="Freitext, Markdown wird vorerst als Plain-Text angezeigt"
          className="resize-y rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </div>

      {/* Farbe */}
      <div className="flex flex-col">
        <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Farbe</label>
        <div className="flex flex-wrap gap-2.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); setShowPicker(false); markDirty(); }}
              style={{ background: c }}
              className={`size-7 cursor-pointer rounded-full transition-all active:scale-90 ${color.toLowerCase() === c.toLowerCase() ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100 hover:scale-105'}`}
            />
          ))}
          <Tooltip content="Eigene Farbe wählen">
            <button
              type="button"
              onClick={() => setShowPicker(!showPicker)}
              style={{ background: !PALETTE.some((c) => c.toLowerCase() === color.toLowerCase()) ? color : undefined }}
              className={`flex size-7 cursor-pointer items-center justify-center rounded-full border border-divider transition-all active:scale-90 ${
                !PALETTE.some((c) => c.toLowerCase() === color.toLowerCase())
                  ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface border-transparent'
                  : showPicker ? 'bg-ink text-paper border-ink' : 'bg-paper text-muted hover:border-ink hover:text-ink'
              }`}
            >
              <Pipette size={12} className={!PALETTE.some((c) => c.toLowerCase() === color.toLowerCase()) ? 'hidden' : ''} />
            </button>
          </Tooltip>
        </div>
        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 flex flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-paper p-3"
            >
              <div className="custom-color-picker flex justify-center">
                <HexColorPicker color={color} onChange={(c) => { setColor(c); markDirty(); }} />
              </div>
              <div className="flex items-center gap-2">
                <div className="size-7 shrink-0 rounded-md border border-divider" style={{ background: color }} />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => { setColor(e.target.value); markDirty(); }}
                  className="w-full rounded-md border border-divider bg-surface px-3 py-1.5 text-xs font-bold tabular-nums text-ink outline-none focus:border-accent"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <DetailDrawer
      open={open}
      title={customer ? customer.name : 'Neuen Kunden anlegen'}
      accentColor={customer?.color}
      subtitle={customer ? `${kpis.projectCount} ${kpis.projectCount === 1 ? 'Projekt' : 'Projekte'} · ${fmtHours(kpis.hoursSec)} insgesamt` : 'Stammdaten und Status erfassen'}
      readContent={readContent}
      editContent={editContent}
      onSave={handleSave}
      onDelete={customer && onDelete ? () => onDelete(customer.id) : undefined}
      onClose={onClose}
      dirty={dirty}
      initialMode={customer ? 'read' : 'edit'}
    />
  );
}

// ──────────────────── Sub-Komponenten ────────────────────

function InvoiceChip({ invoice }: { invoice: { paid: boolean; dueDate: number; status: string } }) {
  if (invoice.status === 'cancelled') return <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">Storno</span>;
  if (invoice.status === 'draft') return <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-300">Entwurf</span>;
  if (invoice.paid) return <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-300">Bezahlt</span>;
  if (invoice.dueDate < Date.now()) return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-300">Überfällig</span>;
  return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Offen</span>;
}
