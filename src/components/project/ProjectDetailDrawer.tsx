import { useEffect, useMemo, useState } from 'react';
import {
  Clock, Euro, TrendingUp, AlertCircle, FileText, Pipette,
  Target, Calendar, Flag, Check, Plus, Trash2, ScrollText,
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project, ProjectStatus, ProjectPriority, Customer, Milestone } from '../../types';
import { useAppState } from '../../state/AppStateContext';
import { DetailDrawer } from '../DetailDrawer';
import { TagInput } from '../TagInput';
import { DatePicker } from '../DatePicker';
import { CurrencyInput } from '../CurrencyInput';
import { NumberInput } from '../NumberInput';
import { CustomSelect } from '../CustomSelect';
import { Tooltip } from '../Tooltip';
import { KpiBox, DrawerSection, DrawerField, DrawerInput } from '../shared/DrawerParts';
import { collectTags, tagColors } from '../../utils/tagColor';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Aktiv',
  'on-hold': 'Pausiert',
  completed: 'Fertig',
  archived: 'Archiviert',
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: 'bg-success-soft text-success border-success-line',
  'on-hold': 'bg-warning-soft text-warning border-warning-line',
  completed: 'bg-info-soft text-info border-info-line',
  archived: 'bg-neutral-soft text-muted border-neutral-line',
};

const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
};

const PRIORITY_COLOR: Record<ProjectPriority, string> = {
  low: 'text-muted',
  normal: 'text-muted',
  high: 'text-danger',
};

interface Props {
  open: boolean;
  /** null = neues Projekt anlegen */
  project: Project | null;
  customers: Customer[];
  onSave: (p: Omit<Project, 'id'> & { id?: number }) => void;
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

export function ProjectDetailDrawer({ open, project, customers, onSave, onDelete, onClose, onNavigateInvoice }: Props) {
  const { state } = useAppState();

  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState<number | undefined>(undefined);
  const [budgetHours, setBudgetHours] = useState<number>(0);
  const [budgetAmount, setBudgetAmount] = useState<number | undefined>(undefined);
  const [fixedPrice, setFixedPrice] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [priority, setPriority] = useState<ProjectPriority>('normal');
  const [tags, setTags] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [targetEndDate, setTargetEndDate] = useState('');
  const [colorOverride, setColorOverride] = useState<string | undefined>(undefined);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Initialisierung
  useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setCustomerId(project.customerId);
      setDescription(project.description ?? '');
      setRate(project.hourlyRate);
      setBudgetHours(project.budgetHours ?? 0);
      setBudgetAmount(project.budgetAmount);
      setFixedPrice(project.fixedPrice);
      setStatus(project.status ?? 'active');
      setPriority(project.priority ?? 'normal');
      setTags(project.tags ?? []);
      setStartDate(isoFromTs(project.startDate));
      setTargetEndDate(isoFromTs(project.targetEndDate));
      setColorOverride(project.colorOverride);
      setMilestones(project.milestones ?? []);
    } else {
      setName('');
      setCustomerId(customers[0]?.id ?? 0);
      setDescription('');
      setRate(undefined);
      setBudgetHours(0);
      setBudgetAmount(undefined);
      setFixedPrice(undefined);
      setStatus('active');
      setPriority('normal');
      setTags([]);
      setStartDate('');
      setTargetEndDate('');
      setColorOverride(undefined);
      setMilestones([]);
    }
    setDirty(false);
    setShowColorPicker(false);
  }, [project, open, customers]);

  const markDirty = () => setDirty(true);

  const customer = state?.customers.find((c) => c.id === customerId);
  const effectiveColor = colorOverride ?? customer?.color ?? '#525252';

  // KPIs
  const kpis = useMemo(() => {
    if (!project || !state) {
      return { hoursSec: 0, revenue: 0, avgRate: 0, budgetUsage: 0, entryCount: 0 };
    }
    const entries = state.entries.filter((e) => e.projectId === project.id);
    const hoursSec = entries.reduce((s, e) => s + e.durationSeconds, 0);
    // Umsatz aus Invoices mit projectId (auch null = alle Projekte zählt nicht)
    const invoices = state.invoices.filter((i) => i.projectId === project.id && i.status === 'active');
    const revenue = invoices.reduce((s, i) => s + i.total, 0);
    const avgRate = hoursSec > 0 ? revenue / (hoursSec / 3600) : 0;
    const hoursTotal = hoursSec / 3600;
    const budgetUsage = budgetHours > 0 ? (hoursTotal / budgetHours) * 100 : 0;
    return { hoursSec, revenue, avgRate, budgetUsage, entryCount: entries.length };
  }, [project, state, budgetHours]);

  const recentEntries = useMemo(() => {
    if (!project || !state) return [];
    return state.entries
      .filter((e) => e.projectId === project.id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 5);
  }, [project, state]);

  const projectInvoices = useMemo(() => {
    if (!project || !state) return [];
    return state.invoices
      .filter((i) => i.projectId === project.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);
  }, [project, state]);

  const tagSuggestions = useMemo(() => state ? collectTags(state.projects) : [], [state]);

  const handleSave = (): boolean => {
    if (!name.trim() || !customerId) return false;
    onSave({
      ...(project ?? {}),
      name: name.trim(),
      customerId,
      description: description.trim() || undefined,
      hourlyRate: rate && rate > 0 ? rate : undefined,
      budgetHours: budgetHours > 0 ? budgetHours : undefined,
      budgetAmount: budgetAmount && budgetAmount > 0 ? budgetAmount : undefined,
      fixedPrice: fixedPrice && fixedPrice > 0 ? fixedPrice : undefined,
      status,
      priority,
      tags,
      startDate: tsFromIso(startDate),
      targetEndDate: tsFromIso(targetEndDate),
      colorOverride,
      milestones,
    });
    setDirty(false);
    return true;
  };

  // Meilenstein-Editoren
  const addMilestone = () => {
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now() + Math.random());
    setMilestones((prev) => [
      ...prev,
      { id, title: '', status: 'open', createdAt: Date.now() },
    ]);
    markDirty();
  };
  const updateMilestone = (id: string, patch: Partial<Milestone>) => {
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
    markDirty();
  };
  const removeMilestone = (id: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    markDirty();
  };
  const toggleMilestoneDone = (id: string) => {
    setMilestones((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      const nextStatus = m.status === 'done' ? 'open' : 'done';
      return { ...m, status: nextStatus, doneAt: nextStatus === 'done' ? Date.now() : undefined };
    }));
    markDirty();
  };

  const openMilestones = milestones.filter((m) => m.status === 'open');
  const doneMilestones = milestones.filter((m) => m.status === 'done');

  // ─────────── Read-Mode ───────────
  const readContent = project ? (
    <div className="flex flex-col gap-5 p-5">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiBox icon={Clock} label="Stunden" value={fmtHours(kpis.hoursSec)} />
        <KpiBox icon={Euro} label="Umsatz" value={fmtEuro(kpis.revenue)} />
        <KpiBox icon={TrendingUp} label="Ø Satz" value={kpis.avgRate > 0 ? `${kpis.avgRate.toFixed(0)} €/h` : '—'} />
        <KpiBox
          icon={AlertCircle}
          label="Budget"
          value={budgetHours > 0 ? `${kpis.budgetUsage.toFixed(0)} %` : '—'}
          tone={kpis.budgetUsage >= 100 ? 'warn' : kpis.budgetUsage >= 80 ? 'warn' : 'default'}
        />
      </div>

      {/* Status / Priorität / Tags */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        {priority !== 'normal' && (
          <span className={`inline-flex items-center gap-1 rounded-full border border-divider bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PRIORITY_COLOR[priority]}`}>
            <Flag size={9} /> {PRIORITY_LABEL[priority]}
          </span>
        )}
        {customer && (
          <span className="inline-flex items-center gap-1 rounded-full border border-divider bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            {customer.name}
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

      {/* Budget-Progress */}
      {budgetHours > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted">
            <span>Stunden-Budget</span>
            <span className={kpis.budgetUsage >= 100 ? 'text-warning' : 'text-ink'}>
              {(kpis.hoursSec / 3600).toFixed(1)} / {budgetHours} h
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper">
            <div
              className={`h-full rounded-full transition-all ${kpis.budgetUsage >= 100 ? 'bg-danger-solid' : kpis.budgetUsage >= 80 ? 'bg-warning-solid' : 'bg-accent'}`}
              style={{ width: `${Math.min(100, kpis.budgetUsage)}%` }}
            />
          </div>
        </div>
      )}

      {/* Stammdaten */}
      <DrawerSection title="Eckdaten">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <DrawerField icon={Euro} label="Stundensatz">
            {rate ? `${rate.toLocaleString('de-DE')} €/h` : customer?.hourlyRate ? `(Kunde: ${customer.hourlyRate} €/h)` : '—'}
          </DrawerField>
          {budgetAmount && <DrawerField icon={Euro} label="Budget €">{fmtEuro(budgetAmount)}</DrawerField>}
          {fixedPrice && <DrawerField icon={Euro} label="Pauschalpreis">{fmtEuro(fixedPrice)}</DrawerField>}
          {startDate && <DrawerField icon={Calendar} label="Start">{fmtDate(tsFromIso(startDate)!)}</DrawerField>}
          {targetEndDate && <DrawerField icon={Calendar} label="Ziel-Ende">{fmtDate(tsFromIso(targetEndDate)!)}</DrawerField>}
        </dl>
        {description && (
          <div className="mt-2 whitespace-pre-wrap rounded-md border border-divider bg-paper/40 px-3 py-2 text-[12px] leading-relaxed text-ink/90">
            {description}
          </div>
        )}
      </DrawerSection>

      {/* Meilensteine */}
      {milestones.length > 0 && (
        <DrawerSection
          title={`Meilensteine (${doneMilestones.length}/${milestones.length})`}
          icon={Target}
        >
          <ul className="flex flex-col gap-1">
            {[...openMilestones, ...doneMilestones].map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md border border-divider bg-paper/50 px-3 py-2 text-[12px]"
              >
                <button
                  onClick={() => toggleMilestoneDone(m.id)}
                  className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-all ${
                    m.status === 'done' ? 'border-success-line bg-success-soft text-success' : 'border-divider hover:border-ink'
                  }`}
                  aria-label={m.status === 'done' ? 'Als offen markieren' : 'Als erledigt markieren'}
                >
                  {m.status === 'done' && <Check size={12} />}
                </button>
                <span className={`flex-1 truncate ${m.status === 'done' ? 'line-through text-muted' : 'text-ink'}`}>
                  {m.title || <span className="italic text-muted">Ohne Titel</span>}
                </span>
                {m.targetDate && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted">{fmtDate(m.targetDate)}</span>
                )}
                {m.estimatedHours !== undefined && m.estimatedHours > 0 && (
                  <span className="shrink-0 rounded-full bg-divider px-1.5 py-0 text-[9px] font-bold tabular-nums text-muted">
                    {m.estimatedHours} h
                  </span>
                )}
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {/* Letzte Einträge */}
      {recentEntries.length > 0 && (
        <DrawerSection title="Letzte Einträge" icon={Clock}>
          <ul className="flex flex-col gap-1">
            {recentEntries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-md border border-divider bg-paper/50 px-3 py-2 text-[12px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ink">{e.description || <span className="italic text-muted">ohne Beschreibung</span>}</div>
                  <div className="text-[10px] text-muted">{fmtDate(e.startedAt)}</div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {(e.durationSeconds / 3600).toFixed(2)} h
                </span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {/* Rechnungen */}
      {projectInvoices.length > 0 && (
        <DrawerSection title="Rechnungen mit diesem Projekt" icon={ScrollText}>
          <ul className="flex flex-col gap-1">
            {projectInvoices.map((inv) => (
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
                  <span className="tabular-nums text-ink">{fmtEuro(inv.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}
    </div>
  ) : (
    <div className="p-5 text-center text-sm text-muted">Klicke auf Bearbeiten, um Projekt-Daten zu erfassen.</div>
  );

  // ─────────── Edit-Mode ───────────
  const editContent = (
    <div className="flex flex-col gap-4 p-5">
      <DrawerInput label="Name *" value={name} onChange={(v) => { setName(v); markDirty(); }} placeholder="z. B. Website-Relaunch 2026" />

      <CustomSelect
        id="projectDrawerCustomer"
        label="Kunde *"
        value={customerId}
        options={customers}
        onChange={(v) => { setCustomerId(v as number); markDirty(); }}
      />

      <div className="flex flex-col">
        <label className="mb-2 kv-label">Beschreibung / Briefing</label>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); markDirty(); }}
          rows={3}
          placeholder="Scope, Deliverables, Notizen…"
          className="resize-y rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="mb-2 kv-label">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as ProjectStatus); markDirty(); }}
            className="h-10 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="active">Aktiv</option>
            <option value="on-hold">Pausiert</option>
            <option value="completed">Fertig</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="mb-2 kv-label">Priorität</label>
          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value as ProjectPriority); markDirty(); }}
            className="h-10 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="low">Niedrig</option>
            <option value="normal">Normal</option>
            <option value="high">Hoch</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col">
        <label className="mb-2 kv-label">Tags</label>
        <TagInput
          value={tags}
          onChange={(t) => { setTags(t); markDirty(); }}
          suggestions={tagSuggestions}
          placeholder="z. B. Frontend, Strategisch…"
        />
      </div>

      {/* Stundensatz + Budget-Felder */}
      <div className="grid grid-cols-3 gap-3">
        <CurrencyInput
          label="Stundensatz"
          value={rate}
          onChange={(v) => { setRate(v); markDirty(); }}
          placeholder="Kunde"
          suffix="€/h"
        />
        <div className="flex flex-col">
          <label className="mb-2 kv-label">Budget Std.</label>
          <NumberInput
            min={0}
            value={budgetHours}
            onChange={(v) => { setBudgetHours(v); markDirty(); }}
            className="w-full"
          />
        </div>
        <CurrencyInput
          label="Budget €"
          value={budgetAmount}
          onChange={(v) => { setBudgetAmount(v); markDirty(); }}
          placeholder="optional"
          suffix="€"
        />
      </div>

      <CurrencyInput
        label="Pauschalpreis"
        value={fixedPrice}
        onChange={(v) => { setFixedPrice(v); markDirty(); }}
        placeholder="optional, statt Stunden"
        suffix="€"
      />

      <div className="grid grid-cols-2 gap-3">
        <DatePicker label="Start" value={startDate} onChange={(v) => { setStartDate(v); markDirty(); }} />
        <DatePicker label="Ziel-Ende" value={targetEndDate} onChange={(v) => { setTargetEndDate(v); markDirty(); }} />
      </div>

      {/* Farbe-Override */}
      <div className="flex flex-col">
        <label className="mb-2 flex items-center justify-between kv-label">
          <span>Farbe</span>
          {colorOverride && (
            <button
              type="button"
              onClick={() => { setColorOverride(undefined); setShowColorPicker(false); markDirty(); }}
              className="cursor-pointer text-[9px] font-bold uppercase tracking-widest text-muted hover:text-ink"
            >
              Auf Kunden-Farbe zurücksetzen
            </button>
          )}
        </label>
        <div className="flex items-center gap-3">
          <div
            className="size-9 shrink-0 rounded-md border border-divider"
            style={{ background: effectiveColor }}
          />
          <Tooltip content="Eigene Farbe für dieses Projekt">
            <button
              type="button"
              onClick={() => setShowColorPicker(!showColorPicker)}
              className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[11px] font-bold uppercase tracking-widest transition-all ${
                showColorPicker ? 'border-ink bg-ink text-paper' : 'border-divider bg-paper text-ink hover:border-ink'
              }`}
            >
              <Pipette size={12} />
              {colorOverride ? 'Override aktiv' : 'Override setzen'}
            </button>
          </Tooltip>
          <span className="text-[10px] text-muted">
            {colorOverride ? 'Eigene Farbe' : `Erbt von ${customer?.name ?? 'Kunde'}`}
          </span>
        </div>
        <AnimatePresence>
          {showColorPicker && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 flex flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-paper p-3"
            >
              <div className="custom-color-picker flex justify-center">
                <HexColorPicker
                  color={effectiveColor}
                  onChange={(c) => { setColorOverride(c); markDirty(); }}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="size-7 shrink-0 rounded-md border border-divider" style={{ background: effectiveColor }} />
                <input
                  type="text"
                  value={colorOverride ?? effectiveColor}
                  onChange={(e) => { setColorOverride(e.target.value); markDirty(); }}
                  className="w-full rounded-md border border-divider bg-surface px-3 py-1.5 text-xs font-bold tabular-nums text-ink outline-none focus:border-accent"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Meilensteine-Editor */}
      <DrawerSection title={`Meilensteine (${milestones.length})`} icon={Target}>
        <div className="flex flex-col gap-2">
          {milestones.length === 0 && (
            <div className="rounded-md border border-dashed border-divider bg-paper/40 p-3 text-center text-[11px] text-muted">
              Noch keine Meilensteine — lege welche an, um den Fortschritt sichtbar zu machen.
            </div>
          )}
          {milestones.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-md border border-divider bg-paper/40 p-3"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleMilestoneDone(m.id)}
                  className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-all ${
                    m.status === 'done' ? 'border-success-line bg-success-soft text-success' : 'border-divider hover:border-ink'
                  }`}
                >
                  {m.status === 'done' && <Check size={12} />}
                </button>
                <input
                  type="text"
                  value={m.title}
                  onChange={(e) => updateMilestone(m.id, { title: e.target.value })}
                  placeholder="Meilenstein-Titel"
                  className={`h-8 flex-1 rounded border border-transparent bg-transparent px-2 text-sm outline-none focus:border-divider focus:bg-paper ${
                    m.status === 'done' ? 'text-muted line-through' : 'text-ink'
                  }`}
                />
                <Tooltip content="Meilenstein entfernen">
                  <button
                    type="button"
                    onClick={() => removeMilestone(m.id)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-danger/70 hover:bg-danger-soft hover:text-danger"
                    aria-label="Meilenstein entfernen"
                  >
                    <Trash2 size={12} />
                  </button>
                </Tooltip>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-7">
                <DatePicker
                  label="Soll-Termin"
                  value={isoFromTs(m.targetDate)}
                  onChange={(v) => updateMilestone(m.id, { targetDate: tsFromIso(v) })}
                />
                <div className="flex flex-col">
                  <label className="mb-2 kv-label">Soll-Stunden</label>
                  <NumberInput
                    min={0}
                    value={m.estimatedHours ?? 0}
                    onChange={(v) => updateMilestone(m.id, { estimatedHours: v > 0 ? v : undefined })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addMilestone}
            className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-divider bg-paper/40 text-[11px] font-bold uppercase tracking-widest text-muted transition-all hover:border-ink hover:text-ink"
          >
            <Plus size={12} /> Meilenstein hinzufügen
          </button>
        </div>
      </DrawerSection>

      <p className="text-[10px] text-muted">
        <FileText size={9} className="mr-1 inline" />
        Stundensatz überschreibt den Kundensatz. Budget-Stunden und Budget € sind reine Forecast-Hilfen.
      </p>
    </div>
  );

  return (
    <DetailDrawer
      open={open}
      title={project ? project.name : 'Neues Projekt anlegen'}
      accentColor={project ? effectiveColor : undefined}
      subtitle={
        project
          ? <>{customer?.name ?? 'Ohne Kunde'} · {fmtHours(kpis.hoursSec)} · {kpis.entryCount} {kpis.entryCount === 1 ? 'Eintrag' : 'Einträge'}</>
          : 'Projekt-Daten und Budget erfassen'
      }
      readContent={readContent}
      editContent={editContent}
      onSave={handleSave}
      onDelete={project && onDelete ? () => onDelete(project.id) : undefined}
      onClose={onClose}
      dirty={dirty}
      initialMode={project ? 'read' : 'edit'}
    />
  );
}
