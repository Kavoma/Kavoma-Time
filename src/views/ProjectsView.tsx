import { useEffect, useMemo, useState } from 'react';
import {
  Plus, FolderKanban, Search, LayoutGrid, List, Layers, Flag,
  Trash2, Tag as TagIcon, CheckSquare, Square, X, Pause, Archive, CheckCircle2, Target,
} from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Project, ProjectStatus } from '../types';
import { ProjectDetailDrawer } from '../components/project/ProjectDetailDrawer';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { TagInput } from '../components/TagInput';
import { collectTags, tagColors } from '../utils/tagColor';
import { Tooltip } from '../components/Tooltip';
import { Checkbox } from '../components/Checkbox';
import type { NavIntent, ViewKey } from '../App';
import { newNumericId } from '../sync/ids';

type SortBy = 'name' | 'recent' | 'status' | 'budget' | 'priority';
type ViewMode = 'list' | 'cards' | 'grouped';

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

const PRIORITY_RANK: Record<NonNullable<Project['priority']>, number> = {
  high: 0, normal: 1, low: 2,
};

interface Props {
  navigateTo?: (view: ViewKey, intent?: NavIntent) => void;
  /** Cross-View-Intent: öffnet beim Mounten direkt den Drawer dieses Projekts. */
  intentProjectId?: number;
  onIntentConsumed?: () => void;
}

export function ProjectsView({ navigateTo, intentProjectId, onIntentConsumed }: Props = {}) {
  const { state, setState } = useAppState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Cross-View-Intent: kommt eine Projekt-ID rein, Drawer direkt öffnen
  useEffect(() => {
    if (typeof intentProjectId === 'number') {
      setEditingId(intentProjectId);
      setCreating(false);
      setDrawerOpen(true);
      onIntentConsumed?.();
    }
  }, [intentProjectId, onIntentConsumed]);

  // Listen-State
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [activeStatuses, setActiveStatuses] = useState<Set<ProjectStatus>>(
    new Set(['active', 'on-hold'])
  );
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [overBudgetOnly, setOverBudgetOnly] = useState(false);

  // Bulk
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [bulkTagDraft, setBulkTagDraft] = useState<string[]>([]);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  // Aggregat-Stats pro Projekt
  const projectStats = useMemo(() => {
    const map = new Map<number, { hours: number; lastActivity: number; budgetUsage: number }>();
    if (!state) return map;
    for (const p of state.projects) {
      map.set(p.id, { hours: 0, lastActivity: 0, budgetUsage: 0 });
    }
    for (const e of state.entries) {
      const s = map.get(e.projectId);
      if (s) {
        s.hours += e.durationSeconds / 3600;
        s.lastActivity = Math.max(s.lastActivity, e.startedAt);
      }
    }
    for (const [pid, s] of map) {
      const p = state.projects.find((pp) => pp.id === pid);
      if (p?.budgetHours && p.budgetHours > 0) {
        s.budgetUsage = (s.hours / p.budgetHours) * 100;
      }
    }
    return map;
  }, [state]);

  const tagSuggestions = useMemo(() => state ? collectTags(state.projects) : [], [state]);

  const filtered = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    let list = state.projects.filter((p) => {
      const status = p.status ?? 'active';
      if (!activeStatuses.has(status)) return false;
      if (overBudgetOnly && (projectStats.get(p.id)?.budgetUsage ?? 0) < 100) return false;
      if (!q) return true;
      const customer = state.customers.find((c) => c.id === p.customerId);
      return (
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        customer?.name.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q))
      );
    });

    list = [...list].sort((a, b) => {
      const sa = projectStats.get(a.id);
      const sb = projectStats.get(b.id);
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'de');
      if (sortBy === 'recent') return (sb?.lastActivity ?? 0) - (sa?.lastActivity ?? 0);
      if (sortBy === 'status') return (a.status ?? 'active').localeCompare(b.status ?? 'active');
      if (sortBy === 'budget') return (sb?.budgetUsage ?? 0) - (sa?.budgetUsage ?? 0);
      if (sortBy === 'priority') {
        return PRIORITY_RANK[a.priority ?? 'normal'] - PRIORITY_RANK[b.priority ?? 'normal'];
      }
      return 0;
    });

    return list;
  }, [state, search, sortBy, activeStatuses, overBudgetOnly, projectStats]);

  // Gruppiert nach Kunde (für view='grouped')
  const groupedByCustomer = useMemo(() => {
    if (!state) return [];
    const groups = new Map<number, Project[]>();
    for (const p of filtered) {
      if (!groups.has(p.customerId)) groups.set(p.customerId, []);
      groups.get(p.customerId)!.push(p);
    }
    return [...groups.entries()]
      .map(([customerId, projects]) => ({
        customer: state.customers.find((c) => c.id === customerId),
        projects,
      }))
      .filter((g) => g.customer)
      .sort((a, b) => (a.customer?.name ?? '').localeCompare(b.customer?.name ?? '', 'de'));
  }, [filtered, state]);

  if (!state) return null;

  const totalCount = state.projects.length;
  const visibleCount = filtered.length;
  const editingProject = editingId !== null ? state.projects.find((p) => p.id === editingId) : null;
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someSelected = selected.size > 0;

  const handleSave = (data: Omit<Project, 'id'> & { id?: number }) => {
    if (data.id) {
      setState((s) => s ? { ...s, projects: s.projects.map((p) => p.id === data.id ? (data as Project) : p) } : null);
    } else {
      const id = newNumericId();
      const newProject: Project = {
        ...(data as Omit<Project, 'id'>),
        id,
        createdAt: Date.now(),
      };
      setState((s) => s ? { ...s, projects: [...s.projects, newProject] } : null);
      setEditingId(id);
      setCreating(false);
    }
  };

  const handleDelete = (id: number) => {
    setState((s) => s ? { ...s, projects: s.projects.filter((p) => p.id !== id) } : null);
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
    if (state.customers.length === 0) return;
    setEditingId(null);
    setCreating(true);
    setDrawerOpen(true);
  };

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
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
    setShowBulkTag(false);
    setBulkTagDraft([]);
    setShowBulkStatus(false);
    setBulkConfirmDelete(false);
  };

  const applyBulkTags = () => {
    if (bulkTagDraft.length === 0) return;
    setState((s) => s ? {
      ...s,
      projects: s.projects.map((p) => {
        if (!selected.has(p.id)) return p;
        const merged = new Set([...(p.tags ?? []), ...bulkTagDraft]);
        return { ...p, tags: [...merged] };
      }),
    } : null);
    setShowBulkTag(false);
    setBulkTagDraft([]);
  };

  const applyBulkStatus = (status: ProjectStatus) => {
    setState((s) => s ? {
      ...s,
      projects: s.projects.map((p) => selected.has(p.id) ? { ...p, status } : p),
    } : null);
    setShowBulkStatus(false);
    clearSelection();
  };

  const applyBulkDelete = () => {
    const ids = new Set(selected);
    setState((s) => s ? { ...s, projects: s.projects.filter((p) => !ids.has(p.id)) } : null);
    clearSelection();
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight leading-none">Projekte</h2>
          <p className="mt-1.5 text-xs text-muted">
            {visibleCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? 'Projekt' : 'Projekte'}`
              : `${visibleCount} von ${totalCount} ${totalCount === 1 ? 'Projekt' : 'Projekte'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tooltip content={state.customers.length === 0 ? 'Erst einen Kunden anlegen' : undefined}>
            <button
              onClick={openNew}
              disabled={state.customers.length === 0}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:border-accent hover:bg-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} /> Neu
            </button>
          </Tooltip>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
            <FolderKanban size={18} className="text-muted" />
          </div>
        </div>
      </div>

      {state.customers.length === 0 ? (
        <NoCustomersState />
      ) : totalCount === 0 ? (
        <EmptyState onCreate={openNew} />
      ) : (
        <>
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, Beschreibung, Kunde, Tag…"
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
              <option value="status">Status</option>
              <option value="budget">Budget-Auslastung</option>
              <option value="priority">Priorität</option>
            </select>

            <div className="flex items-center gap-1 rounded-md border border-divider bg-paper p-0.5">
              {(['active', 'on-hold', 'completed', 'archived'] as ProjectStatus[]).map((s) => {
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

            <Tooltip content="Nur Projekte über 100% Stunden-Budget zeigen">
              <button
                onClick={() => setOverBudgetOnly((v) => !v)}
                className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  overBudgetOnly
                    ? 'border-warning-line bg-warning-soft text-warning'
                    : 'border-divider bg-paper text-muted hover:border-ink hover:text-ink'
                }`}
              >
                <Target size={11} /> Über Budget
              </button>
            </Tooltip>

            <div className="flex items-center gap-0.5 rounded-md border border-divider bg-paper p-0.5">
              <Tooltip content="Liste">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${viewMode === 'list' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
                  aria-label="Listen-Ansicht"
                >
                  <List size={13} />
                </button>
              </Tooltip>
              <Tooltip content="Karten">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${viewMode === 'cards' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
                  aria-label="Karten-Ansicht"
                >
                  <LayoutGrid size={13} />
                </button>
              </Tooltip>
              <Tooltip content="Gruppiert nach Kunde">
                <button
                  onClick={() => setViewMode('grouped')}
                  className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${viewMode === 'grouped' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
                  aria-label="Gruppiert nach Kunde"
                >
                  <Layers size={13} />
                </button>
              </Tooltip>
            </div>
          </div>

          {visibleCount === 0 ? (
            <FilterEmptyState onReset={() => {
              setSearch(''); setActiveStatuses(new Set(['active', 'on-hold'])); setOverBudgetOnly(false);
            }} />
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

              {viewMode === 'list' && (
                <ul className="flex flex-col gap-1.5">
                  {filtered.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      customer={state.customers.find((c) => c.id === p.customerId)}
                      stats={projectStats.get(p.id)}
                      selected={selected.has(p.id)}
                      onToggleSelect={() => toggleSelect(p.id)}
                      onOpen={() => openDrawer(p.id)}
                    />
                  ))}
                </ul>
              )}

              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      customer={state.customers.find((c) => c.id === p.customerId)}
                      stats={projectStats.get(p.id)}
                      selected={selected.has(p.id)}
                      onToggleSelect={() => toggleSelect(p.id)}
                      onOpen={() => openDrawer(p.id)}
                    />
                  ))}
                </div>
              )}

              {viewMode === 'grouped' && (
                <div className="flex flex-col gap-5">
                  {groupedByCustomer.map(({ customer, projects }) => customer && (
                    <div key={customer.id}>
                      <div className="mb-2 flex items-center gap-2 border-b border-divider pb-1.5">
                        <span className="size-3 rounded-full" style={{ background: customer.color }} />
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink">{customer.name}</h3>
                        <span className="text-[10px] text-muted">· {projects.length}</span>
                      </div>
                      <ul className="flex flex-col gap-1.5">
                        {projects.map((p) => (
                          <ProjectRow
                            key={p.id}
                            project={p}
                            customer={customer}
                            stats={projectStats.get(p.id)}
                            selected={selected.has(p.id)}
                            onToggleSelect={() => toggleSelect(p.id)}
                            onOpen={() => openDrawer(p.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Bulk-Bar */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 kv-overlay px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-ink">
              {selected.size} ausgewählt
            </span>
            <div className="mx-1 h-5 w-px bg-divider" />
            <button
              onClick={() => { setShowBulkTag(!showBulkTag); setShowBulkStatus(false); }}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink"
            >
              <TagIcon size={11} /> Tag
            </button>
            <button
              onClick={() => { setShowBulkStatus(!showBulkStatus); setShowBulkTag(false); }}
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

          {showBulkTag && (
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
              {(['active', 'on-hold', 'completed', 'archived'] as ProjectStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => applyBulkStatus(s)}
                  className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold uppercase tracking-widest transition-all ${STATUS_COLOR[s]}`}
                >
                  {s === 'active' && <CheckCircle2 size={11} />}
                  {s === 'on-hold' && <Pause size={11} />}
                  {s === 'completed' && <CheckCircle2 size={11} />}
                  {s === 'archived' && <Archive size={11} />}
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ProjectDetailDrawer
        open={drawerOpen}
        project={creating ? null : (editingProject ?? null)}
        customers={state.customers}
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
        title="Projekt löschen?"
        description={deletingId !== null ? `"${state.projects.find((p) => p.id === deletingId)?.name}" wird unwiderruflich gelöscht.` : ''}
        onConfirm={() => deletingId !== null && handleDelete(deletingId)}
        onCancel={() => setDeletingId(null)}
      />

      <ConfirmDeleteModal
        open={bulkConfirmDelete}
        title={`${selected.size} ${selected.size === 1 ? 'Projekt' : 'Projekte'} löschen?`}
        description="Alle ausgewählten Projekte werden unwiderruflich gelöscht. Zeit-Einträge bleiben erhalten, verlieren aber die Projekt-Zuordnung."
        onConfirm={applyBulkDelete}
        onCancel={() => setBulkConfirmDelete(false)}
      />
    </>
  );
}

// ──────────────────── Sub-Komponenten ────────────────────

function ProjectRow({
  project, customer, stats, selected, onToggleSelect, onOpen,
}: {
  project: Project;
  customer?: { name: string; color: string };
  stats?: { hours: number; lastActivity: number; budgetUsage: number };
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const status = project.status ?? 'active';
  const priority = project.priority ?? 'normal';
  const accentColor = project.colorOverride ?? customer?.color ?? '#525252';
  const overBudget = stats?.budgetUsage && stats.budgetUsage >= 100;
  return (
    <li
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      tabIndex={0}
      role="button"
      aria-label={`Projekt öffnen: ${project.name}`}
      className={`group flex items-center gap-3 rounded-md border-l-[3px] bg-surface px-3 py-2.5 transition-colors cursor-pointer ${
        selected ? 'bg-divider/60 ring-1 ring-accent/30' : 'hover:bg-divider'
      }`}
      style={{ borderLeftColor: accentColor }}
    >
      <Tooltip content={selected ? 'Auswahl entfernen' : 'Auswählen'}>
        <div onClick={(e) => e.stopPropagation()} className="flex shrink-0">
          <Checkbox checked={selected} onChange={onToggleSelect} />
        </div>
      </Tooltip>
      <span className="size-3 shrink-0 rounded-full" style={{ background: accentColor }} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-bold text-ink">{project.name}</span>
        {priority === 'high' && (
          <Flag size={11} className="shrink-0 text-danger" />
        )}
        {status !== 'active' && (
          <span className={`shrink-0 rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider ${STATUS_COLOR[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        )}
        {project.tags && project.tags.length > 0 && (
          <div className="flex shrink-0 gap-1">
            {project.tags.slice(0, 2).map((t) => {
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
            {project.tags.length > 2 && (
              <span className="text-[9px] text-muted">+{project.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
      <span className="shrink-0 rounded-full bg-divider px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
        {customer?.name ?? '—'}
      </span>
      {project.budgetHours && project.budgetHours > 0 && (
        <Tooltip content={overBudget ? `Budget überschritten: ${(stats?.budgetUsage ?? 0).toFixed(0)}%` : `Budgetauslastung: ${(stats?.budgetUsage ?? 0).toFixed(0)}%`}>
          <span className={`w-16 shrink-0 text-right text-[11px] tabular-nums ${overBudget ? 'text-warning font-bold' : 'text-muted'}`}>
            {(stats?.budgetUsage ?? 0).toFixed(0)}%
          </span>
        </Tooltip>
      )}
      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {stats ? `${stats.hours.toFixed(1)} h` : '0 h'}
      </span>
    </li>
  );
}

function ProjectCard({
  project, customer, stats, selected, onToggleSelect, onOpen,
}: {
  project: Project;
  customer?: { name: string; color: string };
  stats?: { hours: number; lastActivity: number; budgetUsage: number };
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const status = project.status ?? 'active';
  const priority = project.priority ?? 'normal';
  const accentColor = project.colorOverride ?? customer?.color ?? '#525252';
  const overBudget = stats?.budgetUsage && stats.budgetUsage >= 100;
  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      tabIndex={0}
      role="button"
      className={`group relative cursor-pointer rounded-lg border bg-surface p-4 transition-all hover:border-ink/40 ${
        selected ? 'border-accent/60 ring-2 ring-accent/30' : 'border-divider'
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-3 top-3 z-10"
      >
        <Tooltip content={selected ? 'Auswahl entfernen' : 'Auswählen'}>
          <Checkbox checked={selected} onChange={onToggleSelect} />
        </Tooltip>
      </div>

      <div className="mb-3 pr-7">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: accentColor }} />
          <div className="truncate text-sm font-bold text-ink">{project.name}</div>
          {priority === 'high' && <Flag size={11} className="shrink-0 text-danger" />}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-muted">{customer?.name ?? 'Ohne Kunde'}</div>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <span className={`rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {project.budgetHours && project.budgetHours > 0 && (
        <Tooltip content={overBudget ? `Budget überschritten: ${(stats?.budgetUsage ?? 0).toFixed(0)}%` : `Budgetauslastung: ${(stats?.budgetUsage ?? 0).toFixed(0)}%`}>
          <div className="mb-2">
            <div className="mb-0.5 flex justify-between text-[9px] font-bold uppercase tracking-widest text-muted">
              <span>Budget</span>
              <span className={overBudget ? 'text-warning font-bold' : ''}>
                {(stats?.hours ?? 0).toFixed(1)} / {project.budgetHours} h
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-paper">
              <div
                className={`h-full rounded-full ${overBudget ? 'bg-danger-solid animate-pulse' : (stats?.budgetUsage ?? 0) >= 80 ? 'bg-warning-solid' : 'bg-accent'}`}
                style={{ width: `${Math.min(100, stats?.budgetUsage ?? 0)}%` }}
              />
            </div>
          </div>
        </Tooltip>
      )}

      <div className="grid grid-cols-2 gap-1.5 border-t border-divider pt-2">
        <Stat label="Stunden" value={stats ? `${stats.hours.toFixed(0)} h` : '0 h'} />
        <Stat
          label="Meilensteine"
          value={
            project.milestones && project.milestones.length > 0
              ? `${project.milestones.filter((m) => m.status === 'done').length}/${project.milestones.length}`
              : '—'
          }
        />
      </div>

      {project.tags && project.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {project.tags.map((t) => {
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

function NoCustomersState() {
  return (
    <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
      <FolderKanban size={28} className="mx-auto mb-3 text-muted" />
      <p className="text-sm text-muted">Erst einen Kunden anlegen.</p>
      <p className="mt-1 text-xs text-muted/60">Projekte werden einem Kunden zugeordnet.</p>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
      <FolderKanban size={28} className="mx-auto mb-3 text-muted" />
      <p className="text-sm text-muted">Noch keine Projekte angelegt.</p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent hover:border-accent active:scale-95"
      >
        <Plus size={14} /> Erstes Projekt anlegen
      </button>
    </div>
  );
}

function FilterEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
      <Search size={28} className="mx-auto mb-3 text-muted" />
      <p className="text-sm text-muted">Keine Projekte passen zu den Filtern.</p>
      <button
        onClick={onReset}
        className="mt-3 cursor-pointer text-[11px] font-bold uppercase tracking-widest text-accent hover:underline"
      >
        Filter zurücksetzen
      </button>
    </div>
  );
}
