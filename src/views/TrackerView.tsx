import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, Copy, Plus, ChevronRight, Search, X, ListChecks } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';
import { CustomAutocomplete } from '../components/CustomAutocomplete';
import { Checkbox } from '../components/Checkbox';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { DeleteModal } from '../components/DeleteModal';
import { EditModal } from '../components/EditModal';
import { NewEntryModal } from '../components/NewEntryModal';
import { useAppState } from '../state/AppStateContext';
import { TimeEntry } from '../types';
import { pauseTimer, startTimer, stopTimer } from '../utils/timerActions';
import { getLiveDurationSeconds } from '../utils/trackerTimer';
import { collectDescriptionSuggestions } from '../utils/descriptionSuggestions';
import { UndoToast } from '../components/UndoToast';
import { SwipeRow } from '../components/SwipeRow';
import { newNumericId } from '../sync/ids';
import { NO_PROJECT_ID, NO_PROJECT_LABEL, projectLabel } from '../utils/projects';

/** Wie lange sich eine Löschung zurückholen lässt. */
const UNDO_WINDOW_MS = 8000;

export function TrackerView() {
  const { state, setState } = useAppState();
  const customers = state?.customers ?? [];
  const projects = state?.projects ?? [];

  const [, setLiveDurationTick] = useState(0);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, entryId: number } | null>(null);
  const [deleteModalEntryId, setDeleteModalEntryId] = useState<number | null>(null);
  const [editModalEntryId, setEditModalEntryId] = useState<number | null>(null);
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [entryView, setEntryView] = useState<'date' | 'project'>('date');
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  /**
   * Wischen zum Löschen gibt es nur unter macOS. Unter Windows liefert auch das
   * Kipprad einer Maus horizontales deltaX — dort wäre der Fehlgriff zu leicht.
   */
  const swipeToDelete = window.api?.platform === 'darwin';

  /** Gerade gelöschte Einträge, solange sie sich zurückholen lassen. */
  const [deletedEntries, setDeletedEntries] = useState<TimeEntry[] | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  const rememberDeleted = (entries: TimeEntry[]) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDeletedEntries(entries);
    undoTimerRef.current = window.setTimeout(() => setDeletedEntries(null), UNDO_WINDOW_MS);
  };

  const undoDelete = () => {
    if (!deletedEntries) return;
    const restored = deletedEntries;
    // Die Liste sortiert sich selbst nach Startzeit — voranstellen genügt.
    setState(s => s ? { ...s, entries: [...restored, ...s.entries] } : null);
    setDeletedEntries(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  // Auswahlmodus für Mehrfach-Löschung
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // === Helpers ===
  const formatHMS = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const liveDuration = state
    ? getLiveDurationSeconds({
      isRunning: state.isRunning,
      startedAt: state.startedAt,
      elapsedBefore: state.elapsedBefore,
    })
    : 0;

  // === Actions ===
  const handleStart = () => {
    setState(s => s ? startTimer(s) : null);
  };

  const handlePause = () => {
    setState(s => s ? pauseTimer(s) : null);
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }
    return () => {
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!state) return;
    const validCustomer = state.customers.find(c => c.id === state.currentCustomerId);
    const targetCustomerId = validCustomer?.id ?? state.customers[0]?.id ?? 0;

    const validProject = state.projects.find(p => p.id === state.currentProjectId && p.customerId === targetCustomerId);
    const targetProjectId = validProject?.id ?? state.projects.find(p => p.customerId === targetCustomerId)?.id ?? 0;

    if (targetCustomerId !== state.currentCustomerId || targetProjectId !== state.currentProjectId) {
      setState(s => s ? { ...s, currentCustomerId: targetCustomerId, currentProjectId: targetProjectId } : null);
    }
  }, [state?.customers, state?.projects, state?.currentCustomerId, state?.currentProjectId]);

  useEffect(() => {
    if (!state?.isRunning) return;

    const interval = window.setInterval(() => {
      setLiveDurationTick(tick => tick + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [state?.isRunning, state?.startedAt]);

  useEffect(() => {
    if (state?.isRunning) {
      document.title = `▶ ${formatHMS(liveDuration)} - Kavoma Time`;
    } else {
      document.title = 'Kavoma Time';
    }
  }, [state?.isRunning, liveDuration]);

  if (!state) {
    return <div className="text-center text-sm text-muted mt-12">Lade Daten...</div>;
  }

  const handleStop = () => {
    setState(s => s ? stopTimer(s) : null);
  };

  const handleContextMenu = (e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entryId
    });
  };

  const handleDeleteEntry = (id: number) => {
    const removed = (state?.entries ?? []).filter(e => e.id === id);
    if (removed.length > 0) rememberDeleted(removed);
    setState(s => s ? { ...s, entries: s.entries.filter(e => e.id !== id) } : null);
    setDeleteModalEntryId(null);
  };

  /**
   * „Nochmal dasselbe": gleicher Kunde, gleiches Projekt, gleiche Dauer.
   *
   * Der Klon endet jetzt und beginnt entsprechend früher — anders als ein
   * Klon, der jetzt beginnt, erzeugt das keinen Eintrag, der in die Zukunft
   * reicht und die Tagessumme verfälscht.
   */
  const handleDuplicateEntry = (id: number) => {
    setState(s => {
      if (!s) return null;
      const source = s.entries.find(e => e.id === id);
      if (!source) return s;
      const now = Date.now();
      const copy: TimeEntry = {
        ...source,
        id: newNumericId(now),
        startedAt: now - source.durationSeconds * 1000,
        endedAt: now,
      };
      return { ...s, entries: [copy, ...s.entries] };
    });
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setGroupSelected = (groupEntries: TimeEntry[], checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const e of groupEntries) {
        if (checked) next.add(e.id);
        else next.delete(e.id);
      }
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    const removed = (state?.entries ?? []).filter(e => selectedIds.has(e.id));
    if (removed.length > 0) rememberDeleted(removed);
    setState(s => s ? { ...s, entries: s.entries.filter(e => !selectedIds.has(e.id)) } : null);
    setBulkDeleteOpen(false);
    exitSelectMode();
  };

  const handleAddManualEntry = (entry: TimeEntry) => {
    setState(s => s ? { ...s, entries: [entry, ...s.entries] } : null);
    setNewEntryOpen(false);
  };

  const handleEditEntry = (updatedEntry: TimeEntry) => {
    setState(s => {
      if (!s) return null;
      return {
        ...s,
        entries: s.entries.map(e => e.id === updatedEntry.id ? updatedEntry : e)
      };
    });
    setEditModalEntryId(null);
  };

  const availableProjects = projects.filter(p => p.customerId === state.currentCustomerId);
  const allDescriptions = collectDescriptionSuggestions(state.entries);

  return (
    <>
      <header className="mb-3 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          {state.isRunning && state.startedAt ? `Läuft seit ${new Date(state.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Bereit'}
        </div>
      </header>

      <div className={`mb-12 text-center font-display text-[88px] font-bold leading-[0.85] tabular-nums tracking-tight transition-colors duration-500 ${state.isRunning ? 'text-ink' : 'text-muted'}`}>
        {formatHMS(liveDuration)}
      </div>

      {(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todaySec = state.entries
          .filter(e => e.startedAt >= todayStart.getTime())
          .reduce((s, e) => s + e.durationSeconds, 0) + liveDuration;
        const h = Math.floor(todaySec / 3600);
        const m = Math.floor((todaySec % 3600) / 60);
        return (
          <div className="mb-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Heute: <span className="text-ink">{h}:{String(m).padStart(2, '0')} Std.</span>
          </div>
        );
      })()}

      <form className="mb-4 grid grid-cols-2 gap-x-3 gap-y-5" onSubmit={e => e.preventDefault()}>
        <CustomSelect
          id="customerSelect"
          label="Kunde"
          value={state.currentCustomerId}
          options={customers}
          onChange={(v) => setState(s => s ? ({ ...s, currentCustomerId: v as number, currentProjectId: projects.find(p => p.customerId === v)?.id || 0 }) : null)}
        />
        <CustomSelect
          id="projectSelect"
          label="Projekt"
          value={state.currentProjectId}
          options={availableProjects}
          onChange={(v) => setState(s => s ? ({ ...s, currentProjectId: v as number }) : null)}
        />

        <div className="col-span-2">
          <CustomAutocomplete
            id="descriptionInput"
            label="Beschreibung"
            options={allDescriptions}
            placeholder="Woran arbeitest du?"
            value={state.currentDescription}
            onChange={v => setState(s => s ? ({ ...s, currentDescription: v }) : null)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleStart();
            }}
          />
        </div>
      </form>

      <div className="mb-12 flex gap-2">
        <button
          type="button"
          onClick={state.isRunning ? handlePause : handleStart}
          className={`flex-1 cursor-pointer rounded-md border px-4 py-3 text-sm font-bold uppercase tracking-widest transition-all active:scale-95 ${state.isRunning
            ? 'border-amber-500 bg-amber-500 text-paper hover:bg-paper hover:text-amber-500'
            : 'border-ink bg-ink text-paper hover:bg-paper hover:text-ink'
            }`}
        >
          {state.isRunning ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          onClick={handleStop}
          className="cursor-pointer rounded-md border border-ink bg-paper px-6 py-3 text-sm font-bold uppercase tracking-widest text-ink transition-all hover:bg-ink hover:text-paper active:scale-95"
        >
          Stop
        </button>
      </div>

      {(() => {
        const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const formatHM = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

        const sorted = [...state.entries].sort((a, b) => b.startedAt - a.startedAt)
          .filter(e => {
            if (!searchTerm.trim()) return true;
            const q = searchTerm.toLowerCase();
            const cName = customers.find(c => c.id === e.customerId)?.name?.toLowerCase() ?? '';
            const pName = projectLabel(projects, e.projectId).toLowerCase();
            return e.description.toLowerCase().includes(q) || cName.includes(q) || pName.includes(q);
          });

        const dateGroups: { key: string; label: string; entries: TimeEntry[]; total: number }[] = [];
        {
          const map = new Map<string, TimeEntry[]>();
          for (const e of sorted) {
            const k = ymd(new Date(e.startedAt));
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(e);
          }
          const today = ymd(new Date());
          const yesterday = ymd(new Date(Date.now() - 86400000));
          for (const [k, ents] of map) {
            let label: string;
            if (k === today) label = 'Heute';
            else if (k === yesterday) label = 'Gestern';
            else label = new Date(k).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            dateGroups.push({ key: k, label, entries: ents, total: ents.reduce((s, e) => s + e.durationSeconds, 0) });
          }
        }

        const projectGroups: { projectId: number; project: any; customer: any; entries: TimeEntry[]; total: number }[] = [];
        {
          const map = new Map<number, TimeEntry[]>();
          for (const e of sorted) {
            if (!map.has(e.projectId)) map.set(e.projectId, []);
            map.get(e.projectId)!.push(e);
          }
          for (const [pid, ents] of map) {
            const project = projects.find(p => p.id === pid);
            // Ohne Projekt gibt es keinen Kunden über den Umweg des Projekts.
            // Tragen alle Einträge der Gruppe denselben Kunden, ist er trotzdem
            // eindeutig — nur bei gemischten Kunden bleibt die Zeile leer.
            const customerId = project
              ? project.customerId
              : (ents.every(e => e.customerId === ents[0].customerId) ? ents[0].customerId : undefined);
            const customer = customers.find(c => c.id === customerId);
            projectGroups.push({ projectId: pid, project, customer, entries: ents, total: ents.reduce((s, e) => s + e.durationSeconds, 0) });
          }
          projectGroups.sort((a, b) => b.total - a.total);
        }

        const renderEntry = (entry: TimeEntry) => {
          const customer = customers.find(c => c.id === entry.customerId);
          const d = new Date(entry.startedAt);
          const selected = selectedIds.has(entry.id);
          return (
            <SwipeRow
              key={entry.id}
              enabled={swipeToDelete && !selectMode}
              onSwipeDelete={() => handleDeleteEntry(entry.id)}
              accentColor={customer?.color || '#525252'}
              selected={selected}
              onContextMenu={selectMode ? undefined : (e) => handleContextMenu(e, entry.id)}
              onDoubleClick={selectMode ? undefined : () => setEditModalEntryId(entry.id)}
              onClick={selectMode ? () => toggleSelected(entry.id) : undefined}
            >
              {selectMode && (
                <span onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected} onChange={() => toggleSelected(entry.id)} />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-xs font-bold text-ink">{entry.description || '(ohne Beschreibung)'}</div>
                <div className="truncate text-[11px] text-muted">{customer?.name} · {projectLabel(projects, entry.projectId)}</div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <div className="text-[11px] text-muted tabular-nums">
                  {d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'läuft'}
                </div>
                <div className="text-xs font-black tabular-nums">{formatHM(entry.durationSeconds)}</div>
              </div>
            </SwipeRow>
          );
        };

        const toggleProject = (id: number) => {
          setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        };

        return (
          <section>
            <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold uppercase tracking-wide leading-none">Einträge</h2>
                <div className="flex gap-0.5 rounded-md border border-divider bg-surface p-0.5">
                  {(['date', 'project'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setEntryView(v)}
                      className={`cursor-pointer rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${entryView === v ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                        }`}
                    >
                      {v === 'date' ? 'Datum' : 'Projekt'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {state.entries.length > 0 && (
                  <button
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest transition-colors ${selectMode
                      ? 'border-ink bg-ink text-paper hover:bg-paper hover:text-ink'
                      : 'border-divider text-muted hover:border-ink hover:text-ink'
                      }`}
                  >
                    {selectMode ? <X size={12} /> : <ListChecks size={12} />}
                    {selectMode ? 'Fertig' : 'Auswählen'}
                  </button>
                )}
                <button
                  onClick={() => setNewEntryOpen(true)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-divider px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  <Plus size={12} /> Nachtragen
                </button>
              </div>
            </div>

            {state.entries.length > 5 && (
              <div className="mb-4 relative group">
                <Search size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-ink transition-colors" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Einträge durchsuchen…"
                  className="w-full !pl-11 !pr-9 !py-1.5 text-[11px] font-bold tracking-wider bg-surface/40 border-divider hover:border-muted focus:border-ink focus:bg-surface transition-all rounded-md outline-none placeholder:text-muted/50"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {state.entries.length === 0 ? (
              <div className="rounded-md border border-divider bg-paper p-8 text-center text-sm text-muted">
                Noch keine Einträge.
              </div>
            ) : entryView === 'date' ? (
              <div className="flex flex-col gap-6">
                {dateGroups.map(g => (
                  <div key={g.key}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {selectMode && (
                          <Checkbox
                            checked={g.entries.every(e => selectedIds.has(e.id))}
                            onChange={(checked) => setGroupSelected(g.entries, checked)}
                          />
                        )}
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{g.label}</h3>
                      </div>
                      <span className="text-[11px] tabular-nums text-muted">{formatHM(g.total)} Std.</span>
                    </div>
                    <ul className="flex list-none flex-col gap-2">
                      {g.entries.map(renderEntry)}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="flex list-none flex-col gap-2">
                {projectGroups.map(g => {
                  const expanded = expandedProjects.has(g.projectId);
                  return (
                    <li key={g.projectId} className="overflow-hidden rounded-md border-l-[3px] bg-surface" style={{ borderLeftColor: g.customer?.color || '#525252' }}>
                      <button
                        onClick={() => toggleProject(g.projectId)}
                        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-divider"
                      >
                        {selectMode && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={g.entries.every(e => selectedIds.has(e.id))}
                              onChange={(checked) => setGroupSelected(g.entries, checked)}
                            />
                          </span>
                        )}
                        <ChevronRight size={14} className={`shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="truncate text-xs font-bold text-ink">
                            {g.projectId === NO_PROJECT_ID ? NO_PROJECT_LABEL : (g.project?.name ?? 'Unbekannt')}
                          </div>
                          <div className="truncate text-[11px] text-muted">
                            {g.customer?.name ?? '—'} · {g.entries.length} {g.entries.length === 1 ? 'Eintrag' : 'Einträge'}
                          </div>
                        </div>
                        <div className="text-xs font-black tabular-nums">{formatHM(g.total)}</div>
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.ul
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            className="flex list-none flex-col gap-1.5 overflow-hidden border-t border-divider p-2"
                          >
                            {g.entries.map(renderEntry)}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            )}

            <AnimatePresence>
              {selectMode && (
                <motion.div
                  className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-divider bg-surface px-4 py-2.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted tabular-nums">
                      {selectedIds.size} ausgewählt
                    </span>
                    <span className="h-4 w-px bg-divider" />
                    <button
                      onClick={() => setGroupSelected(sorted, sorted.length > 0 && !sorted.every(e => selectedIds.has(e.id)))}
                      className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-muted transition-colors hover:text-ink"
                    >
                      {sorted.length > 0 && sorted.every(e => selectedIds.has(e.id)) ? 'Keine' : 'Alle'}
                    </button>
                    <span className="h-4 w-px bg-divider" />
                    <button
                      onClick={() => setBulkDeleteOpen(true)}
                      disabled={selectedIds.size === 0}
                      className="flex cursor-pointer items-center gap-1.5 rounded-md bg-red-500/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-red-400 transition-all hover:bg-red-500 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-500/15 disabled:hover:text-red-400"
                    >
                      <Trash2 size={12} />
                      Löschen{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })()}

      <AnimatePresence mode="wait">
        {contextMenu && (
          <motion.div
            key={`ctx-${contextMenu.entryId}-${contextMenu.x}-${contextMenu.y}`}
            className="fixed z-50 rounded-lg border border-divider bg-surface p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]"
            style={{ top: Math.min(contextMenu.y, window.innerHeight - 100), left: Math.min(contextMenu.x, window.innerWidth - 160) }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          >
            <button
              onClick={() => { setEditModalEntryId(contextMenu.entryId); setContextMenu(null); }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-ink transition-colors hover:bg-divider"
            >
              <Pencil size={13} className="text-muted" />
              Bearbeiten
            </button>
            <button
              onClick={() => { handleDuplicateEntry(contextMenu.entryId); setContextMenu(null); }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-ink transition-colors hover:bg-divider"
            >
              <Copy size={13} className="text-muted" />
              Duplizieren
            </button>
            <button
              onClick={() => { setDeleteModalEntryId(contextMenu.entryId); setContextMenu(null); }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-divider"
            >
              <Trash2 size={13} />
              Löschen
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <UndoToast
        message={deletedEntries === null
          ? null
          : deletedEntries.length === 1 ? 'Eintrag gelöscht.' : `${deletedEntries.length} Einträge gelöscht.`}
        onUndo={undoDelete}
      />

      <DeleteModal
        entry={state.entries.find(e => e.id === deleteModalEntryId) || null}
        onConfirm={() => deleteModalEntryId && handleDeleteEntry(deleteModalEntryId)}
        onCancel={() => setDeleteModalEntryId(null)}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        title={selectedIds.size === 1 ? 'Eintrag löschen?' : `${selectedIds.size} Einträge löschen?`}
        description={selectedIds.size === 1
          ? 'Der ausgewählte Eintrag wird unwiderruflich gelöscht.'
          : `Die ${selectedIds.size} ausgewählten Einträge werden unwiderruflich gelöscht.`}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <EditModal
        entry={state.entries.find(e => e.id === editModalEntryId) || null}
        customers={state.customers}
        projects={state.projects}
        onSave={handleEditEntry}
        onCancel={() => setEditModalEntryId(null)}
        recentDescriptions={allDescriptions}
      />

      <NewEntryModal
        open={newEntryOpen}
        customers={state.customers}
        projects={state.projects}
        onSave={handleAddManualEntry}
        onCancel={() => setNewEntryOpen(false)}
        recentDescriptions={allDescriptions}
      />
    </>
  );
}
