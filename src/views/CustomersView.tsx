import { useEffect, useMemo, useState } from 'react';
import {
  Users, Plus, Search, LayoutGrid, List, FileSignature,
  Trash2, Tag as TagIcon, CheckSquare, Square, X, Pause, Archive, CheckCircle2,
} from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Customer, CustomerStatus } from '../types';
import { CustomerDetailDrawer } from '../components/customer/CustomerDetailDrawer';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { TagInput } from '../components/TagInput';
import { Tooltip } from '../components/Tooltip';
import { Checkbox } from '../components/Checkbox';
import { collectTags, tagColors } from '../utils/tagColor';
import type { NavIntent, ViewKey } from '../App';
import { newNumericId } from '../sync/ids';
import { advanceCounter, allocateNumber, debtorFloor } from '../sync/numbers';

type SortBy = 'name' | 'recent' | 'revenue' | 'hours';
type ViewMode = 'list' | 'cards';

const STATUS_LABEL: Record<CustomerStatus, string> = {
  active: 'Aktiv',
  paused: 'Pausiert',
  archived: 'Archiviert',
};

const STATUS_COLOR: Record<CustomerStatus, string> = {
  active: 'bg-success-soft text-success border-success-line',
  paused: 'bg-warning-soft text-warning border-warning-line',
  archived: 'bg-neutral-soft text-muted border-neutral-line',
};

interface Props {
  navigateTo?: (view: ViewKey, intent?: NavIntent) => void;
  /** Cross-View-Intent: öffnet beim Mounten direkt den Drawer dieses Kunden. */
  intentCustomerId?: number;
  onIntentConsumed?: () => void;
}

export function CustomersView({ navigateTo, intentCustomerId, onIntentConsumed }: Props = {}) {
  const { state, setState } = useAppState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Cross-View-Intent: kommt eine Kunden-ID rein, Drawer direkt öffnen
  useEffect(() => {
    if (typeof intentCustomerId === 'number') {
      setEditingId(intentCustomerId);
      setCreating(false);
      setDrawerOpen(true);
      onIntentConsumed?.();
    }
  }, [intentCustomerId, onIntentConsumed]);

  // Listen-State
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [activeStatuses, setActiveStatuses] = useState<Set<CustomerStatus>>(new Set(['active']));
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Multi-Select / Bulk
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);
  const [bulkTagDraft, setBulkTagDraft] = useState<string[]>([]);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  // Aggregat-Stats pro Kunde
  const customerStats = useMemo(() => {
    const map = new Map<number, { hours: number; revenue: number; lastActivity: number; projectCount: number }>();
    if (!state) return map;
    for (const c of state.customers) {
      map.set(c.id, { hours: 0, revenue: 0, lastActivity: 0, projectCount: 0 });
    }
    for (const e of state.entries) {
      const s = map.get(e.customerId);
      if (s) {
        s.hours += e.durationSeconds / 3600;
        s.lastActivity = Math.max(s.lastActivity, e.startedAt);
      }
    }
    for (const inv of state.invoices) {
      if (inv.status === 'active') {
        const s = map.get(inv.customerId);
        if (s) s.revenue += inv.total;
      }
    }
    for (const p of state.projects) {
      const s = map.get(p.customerId);
      if (s) s.projectCount++;
    }
    return map;
  }, [state]);

  const contractCountByCustomer = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of state?.contracts ?? []) {
      map.set(c.customerId, (map.get(c.customerId) ?? 0) + 1);
    }
    return map;
  }, [state?.contracts]);

  const tagSuggestions = useMemo(() => state ? collectTags(state.customers) : [], [state]);

  const filtered = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    let list = state.customers.filter((c) => {
      const status = c.status ?? 'active';
      if (!activeStatuses.has(status)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.tags?.some((t) => t.toLowerCase().includes(q))
      );
    });

    list = [...list].sort((a, b) => {
      const sa = customerStats.get(a.id);
      const sb = customerStats.get(b.id);
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'de');
      if (sortBy === 'recent') return (sb?.lastActivity ?? 0) - (sa?.lastActivity ?? 0);
      if (sortBy === 'revenue') return (sb?.revenue ?? 0) - (sa?.revenue ?? 0);
      if (sortBy === 'hours') return (sb?.hours ?? 0) - (sa?.hours ?? 0);
      return 0;
    });

    return list;
  }, [state, search, sortBy, activeStatuses, customerStats]);

  if (!state) return null;

  const totalCount = state.customers.length;
  const visibleCount = filtered.length;
  const editingCustomer = editingId !== null ? state.customers.find((c) => c.id === editingId) : null;
  const allVisibleSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const someSelected = selected.size > 0;

  const handleSave = async (data: Omit<Customer, 'id'> & { id?: number }) => {
    if (data.id) {
      setState((s) => s ? { ...s, customers: s.customers.map((c) => c.id === data.id ? (data as Customer) : c) } : null);
      return;
    }

    const id = newNumericId();

    // Debitorennummern haben dasselbe Problem wie Rechnungsnummern: Zwei
    // Geräte, die je einen Kunden anlegen, vergeben sonst dieselbe — und der
    // DATEV-Export braucht sie eindeutig. Hat der Nutzer selbst eine
    // eingetragen, bleibt die stehen.
    let debtorNumber = data.debtorNumber ?? '';
    let allocatedValue: number | null = null;
    if (!debtorNumber) {
      try {
        // Ohne Jahr: Eine Debitorennummer gehört dauerhaft zu einem Kunden.
        const floor = debtorFloor(state.customers, state.nextDebtorNumber);
        const allocated = await allocateNumber('debtor', floor);
        debtorNumber = String(allocated.value);
        allocatedValue = allocated.value;
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Debitorennummer konnte nicht vergeben werden.');
        return;
      }
    }

    const newCustomer: Customer = {
      ...(data as Omit<Customer, 'id'>),
      id,
      debtorNumber,
      createdAt: Date.now(),
      acquisitionDate: data.acquisitionDate ?? Date.now(),
    };
    setState((s) => s ? {
      ...s,
      customers: [...s.customers, newCustomer],
      ...(allocatedValue !== null
        ? { nextDebtorNumber: advanceCounter(s.nextDebtorNumber, allocatedValue) }
        : {}),
    } : null);
    setEditingId(id);
    setCreating(false);
  };

  const handleDelete = (id: number) => {
    setState((s) => s ? {
      ...s,
      customers: s.customers.filter((c) => c.id !== id),
      projects: s.projects.filter((p) => p.customerId !== id),
    } : null);
    setDeletingId(null);
    closeDrawer();
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setCreating(false);
  };

  const openDrawer = (id: number) => {
    setEditingId(id);
    setCreating(false);
    setDrawerOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setCreating(true);
    setDrawerOpen(true);
  };

  // Bulk-Aktionen
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
    setShowBulkTagInput(false);
    setBulkTagDraft([]);
    setShowBulkStatus(false);
    setBulkConfirmDelete(false);
  };

  const applyBulkTags = () => {
    if (bulkTagDraft.length === 0) return;
    setState((s) => s ? {
      ...s,
      customers: s.customers.map((c) => {
        if (!selected.has(c.id)) return c;
        const merged = new Set([...(c.tags ?? []), ...bulkTagDraft]);
        return { ...c, tags: [...merged] };
      }),
    } : null);
    setShowBulkTagInput(false);
    setBulkTagDraft([]);
  };

  const applyBulkStatus = (status: CustomerStatus) => {
    setState((s) => s ? {
      ...s,
      customers: s.customers.map((c) => selected.has(c.id) ? { ...c, status } : c),
    } : null);
    setShowBulkStatus(false);
    clearSelection();
  };

  const applyBulkDelete = () => {
    const ids = new Set(selected);
    setState((s) => s ? {
      ...s,
      customers: s.customers.filter((c) => !ids.has(c.id)),
      projects: s.projects.filter((p) => !ids.has(p.customerId)),
    } : null);
    clearSelection();
  };

  const jumpToContracts = (customerId: number) => {
    navigateTo?.('finance', {
      view: 'finance',
      finance: { tab: 'contracts', customerFilter: customerId },
    });
  };

  return (
    <>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight leading-none">Kunden</h2>
          <p className="mt-1.5 text-xs text-muted">
            {visibleCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? 'Kunde' : 'Kunden'}`
              : `${visibleCount} von ${totalCount} ${totalCount === 1 ? 'Kunde' : 'Kunden'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openNew}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:border-accent hover:bg-accent active:scale-95"
          >
            <Plus size={14} /> Neu
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
            <Users size={18} className="text-muted" />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, E-Mail, Stadt, Branche, Tag…"
            className="h-9 w-full rounded-md border border-divider bg-paper !pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="h-9 cursor-pointer rounded-md border border-divider bg-paper px-3 text-[11px] font-bold uppercase tracking-widest text-ink outline-none hover:border-ink"
        >
          <option value="name">Name A–Z</option>
          <option value="recent">Letzte Aktivität</option>
          <option value="revenue">Höchster Umsatz</option>
          <option value="hours">Meiste Stunden</option>
        </select>

        <div className="flex items-center gap-1 rounded-md border border-divider bg-paper p-0.5">
          {(['active', 'paused', 'archived'] as CustomerStatus[]).map((s) => {
            const isOn = activeStatuses.has(s);
            return (
              <button
                key={s}
                onClick={() => {
                  setActiveStatuses((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) {
                      if (next.size > 1) next.delete(s);
                    } else next.add(s);
                    return next;
                  });
                }}
                className={`cursor-pointer rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  isOn ? STATUS_COLOR[s] : 'text-muted hover:text-ink'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-divider bg-paper p-0.5">
          <Tooltip content="Listen-Ansicht">
            <button
              onClick={() => setViewMode('list')}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${viewMode === 'list' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
              aria-label="Listen-Ansicht"
            >
              <List size={13} />
            </button>
          </Tooltip>
          <Tooltip content="Karten-Ansicht">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${viewMode === 'cards' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
              aria-label="Karten-Ansicht"
            >
              <LayoutGrid size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      {totalCount === 0 ? (
        <EmptyState onCreate={openNew} />
      ) : visibleCount === 0 ? (
        <FilterEmptyState onReset={() => { setSearch(''); setActiveStatuses(new Set(['active'])); }} />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between border-b border-divider pb-2">
            <button
              onClick={selectAllVisible}
              className="flex cursor-pointer items-center gap-2 kv-label hover:text-ink"
            >
              {allVisibleSelected ? <CheckSquare size={12} /> : <Square size={12} />}
              {allVisibleSelected ? 'Auswahl aufheben' : 'Alle auswählen'}
            </button>
            {someSelected && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                {selected.size} ausgewählt
              </span>
            )}
          </div>

          {viewMode === 'list' ? (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  stats={customerStats.get(c.id)}
                  contractCount={contractCountByCustomer.get(c.id) ?? 0}
                  selected={selected.has(c.id)}
                  onToggleSelect={() => toggleSelect(c.id)}
                  onOpen={() => openDrawer(c.id)}
                  onJumpContracts={() => jumpToContracts(c.id)}
                />
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => (
                <CustomerCard
                  key={c.id}
                  customer={c}
                  stats={customerStats.get(c.id)}
                  projectCount={state.projects.filter((p) => p.customerId === c.id).length}
                  selected={selected.has(c.id)}
                  onToggleSelect={() => toggleSelect(c.id)}
                  onOpen={() => openDrawer(c.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {someSelected && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 kv-overlay px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-ink">
              {selected.size} ausgewählt
            </span>
            <div className="mx-1 h-5 w-px bg-divider" />

            <button
              onClick={() => { setShowBulkTagInput(!showBulkTagInput); setShowBulkStatus(false); }}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink"
            >
              <TagIcon size={11} /> Tag
            </button>
            <button
              onClick={() => { setShowBulkStatus(!showBulkStatus); setShowBulkTagInput(false); }}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink"
            >
              <CheckCircle2 size={11} /> Status
            </button>
            <button
              onClick={() => setBulkConfirmDelete(true)}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-danger-line bg-danger-soft px-2.5 text-[10px] font-bold uppercase tracking-widest text-danger transition-all hover:border-danger-line hover:bg-danger-soft"
            >
              <Trash2 size={11} /> Löschen
            </button>

            <div className="mx-1 h-5 w-px bg-divider" />
            <Tooltip content="Auswahl aufheben">
              <button
                onClick={clearSelection}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink"
                aria-label="Auswahl aufheben"
              >
                <X size={13} />
              </button>
            </Tooltip>
          </div>

          {showBulkTagInput && (
            <div className="mt-2 flex items-center gap-2 border-t border-divider pt-2">
              <div className="flex-1">
                <TagInput
                  value={bulkTagDraft}
                  onChange={setBulkTagDraft}
                  suggestions={tagSuggestions}
                  placeholder="Tag eingeben + Enter…"
                />
              </div>
              <button
                onClick={applyBulkTags}
                disabled={bulkTagDraft.length === 0}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-ink bg-ink px-3 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anwenden
              </button>
            </div>
          )}

          {showBulkStatus && (
            <div className="mt-2 flex items-center gap-1 border-t border-divider pt-2">
              <button
                onClick={() => applyBulkStatus('active')}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-success-line bg-success-soft px-2.5 text-[10px] font-bold uppercase tracking-widest text-success transition-all hover:bg-success-soft"
              >
                <CheckCircle2 size={11} /> Aktiv
              </button>
              <button
                onClick={() => applyBulkStatus('paused')}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-warning-line bg-warning-soft px-2.5 text-[10px] font-bold uppercase tracking-widest text-warning transition-all hover:bg-warning-soft"
              >
                <Pause size={11} /> Pausiert
              </button>
              <button
                onClick={() => applyBulkStatus('archived')}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-line bg-neutral-soft px-2.5 text-[10px] font-bold uppercase tracking-widest text-muted transition-all hover:bg-neutral-soft"
              >
                <Archive size={11} /> Archiviert
              </button>
            </div>
          )}
        </div>
      )}

      <CustomerDetailDrawer
        open={drawerOpen}
        customer={creating ? null : (editingCustomer ?? null)}
        onSave={handleSave}
        onDelete={(id) => setDeletingId(id)}
        onClose={closeDrawer}
        onNavigateInvoice={(invoiceId) => {
          closeDrawer();
          navigateTo?.('finance', { view: 'finance', finance: { tab: 'invoices', invoiceId } });
        }}
      />

      <ConfirmDeleteModal
        open={deletingId !== null}
        title="Kunde löschen?"
        description={deletingId !== null ? `"${state.customers.find((c) => c.id === deletingId)?.name}" und alle zugehörigen Projekte werden unwiderruflich gelöscht.` : ''}
        onConfirm={() => deletingId !== null && handleDelete(deletingId)}
        onCancel={() => setDeletingId(null)}
      />

      <ConfirmDeleteModal
        open={bulkConfirmDelete}
        title={`${selected.size} ${selected.size === 1 ? 'Kunde' : 'Kunden'} löschen?`}
        description="Alle ausgewählten Kunden und ihre zugehörigen Projekte werden unwiderruflich gelöscht."
        onConfirm={applyBulkDelete}
        onCancel={() => setBulkConfirmDelete(false)}
      />
    </>
  );
}

// ──────────────────── Sub-Komponenten ────────────────────

function CustomerRow({
  customer, stats, contractCount, selected, onToggleSelect, onOpen, onJumpContracts,
}: {
  customer: Customer;
  stats?: { hours: number; revenue: number; lastActivity: number; projectCount: number };
  contractCount: number;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onJumpContracts: () => void;
}) {
  const status = customer.status ?? 'active';
  return (
    <li
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      tabIndex={0}
      role="button"
      aria-label={`Kunde öffnen: ${customer.name}`}
      className={`group flex items-center gap-3 rounded-md border-l-[3px] bg-surface px-3 py-2.5 transition-colors cursor-pointer ${
        selected ? 'bg-divider/60 ring-1 ring-accent/30' : 'hover:bg-divider'
      }`}
      style={{ borderLeftColor: customer.color }}
    >
      <Tooltip content={selected ? 'Auswahl entfernen' : 'Auswählen'}>
        <div onClick={(e) => e.stopPropagation()} className="flex shrink-0">
          <Checkbox checked={selected} onChange={onToggleSelect} />
        </div>
      </Tooltip>
      <span className="size-3 shrink-0 rounded-full" style={{ background: customer.color }} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-bold text-ink">{customer.name}</span>
        {status !== 'active' && (
          <span className={`shrink-0 rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider ${STATUS_COLOR[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        )}
        {customer.tags && customer.tags.length > 0 && (
          <div className="flex shrink-0 gap-1">
            {customer.tags.slice(0, 3).map((t) => {
              const c = tagColors(t);
              return (
                <span
                  key={t}
                  className="rounded-full px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                >
                  {t}
                </span>
              );
            })}
            {customer.tags.length > 3 && (
              <span className="text-[9px] text-muted">+{customer.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
      {contractCount > 0 && (
        <Tooltip content="Zu Verträgen springen">
          <button
            type="button"
            aria-label={`${contractCount} ${contractCount === 1 ? 'Vertrag' : 'Verträge'} — zu den Verträgen springen`}
            onClick={(e) => { e.stopPropagation(); onJumpContracts(); }}
            className="shrink-0 flex cursor-pointer items-center gap-1 rounded-full border border-divider bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <FileSignature size={11} />
            <span className="tabular-nums">{contractCount}</span>
          </button>
        </Tooltip>
      )}
      {customer.hourlyRate ? (
        <span className="shrink-0 rounded-full bg-divider px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent tabular-nums">
          {customer.hourlyRate.toLocaleString('de-DE')} €/h
        </span>
      ) : null}
      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {stats ? `${stats.hours.toFixed(1)} h` : '0 h'}
      </span>
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {stats?.projectCount ?? 0}P
      </span>
    </li>
  );
}

function CustomerCard({
  customer, stats, projectCount, selected, onToggleSelect, onOpen,
}: {
  customer: Customer;
  stats?: { hours: number; revenue: number; lastActivity: number; projectCount: number };
  projectCount: number;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const status = customer.status ?? 'active';
  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      tabIndex={0}
      role="button"
      className={`group relative cursor-pointer rounded-lg border bg-surface p-4 transition-all hover:border-ink/40 ${
        selected ? 'border-accent/60 ring-2 ring-accent/30' : 'border-divider'
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: customer.color }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-3 top-3 z-10"
      >
        <Tooltip content={selected ? 'Auswahl entfernen' : 'Auswählen'}>
          <Checkbox checked={selected} onChange={onToggleSelect} />
        </Tooltip>
      </div>

      <div className="mb-3 flex items-start gap-2 pr-7">
        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: customer.color }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{customer.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
            {customer.industry && <span>{customer.industry}</span>}
            {customer.city && <span>· {customer.city}</span>}
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <span className={`rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-t border-divider pt-2">
        <Stat label="Stunden" value={stats ? `${stats.hours.toFixed(0)} h` : '0 h'} />
        <Stat label="Umsatz" value={stats ? stats.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '0 €'} />
        <Stat label="Projekte" value={String(projectCount)} />
      </div>

      {customer.tags && customer.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {customer.tags.map((t) => {
            const c = tagColors(t);
            return (
              <span
                key={t}
                className="rounded-full px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
              >
                {t}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <span className="text-[12px] font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
      <Users size={28} className="mx-auto mb-3 text-muted" />
      <p className="text-sm text-muted">Noch keine Kunden angelegt.</p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent hover:border-accent active:scale-95"
      >
        <Plus size={14} /> Ersten Kunden anlegen
      </button>
    </div>
  );
}

function FilterEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
      <Search size={28} className="mx-auto mb-3 text-muted" />
      <p className="text-sm text-muted">Keine Kunden passen zu den Filtern.</p>
      <button
        onClick={onReset}
        className="mt-3 cursor-pointer text-[11px] font-bold uppercase tracking-widest text-accent hover:underline"
      >
        Filter zurücksetzen
      </button>
    </div>
  );
}
