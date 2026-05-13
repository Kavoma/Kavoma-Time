import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, Plus, ChevronRight, Search, X } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';
import { CustomAutocomplete } from '../components/CustomAutocomplete';
import { DeleteModal } from '../components/DeleteModal';
import { EditModal } from '../components/EditModal';
import { NewEntryModal } from '../components/NewEntryModal';
import { useAppState } from '../state/AppStateContext';
import { TimeEntry } from '../types';

export function TrackerView() {
  const { state, setState } = useAppState();
  const customers = state?.customers ?? [];
  const projects  = state?.projects  ?? [];

  const [liveDuration, setLiveDuration] = useState(0);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, entryId: number } | null>(null);
  const [deleteModalEntryId, setDeleteModalEntryId] = useState<number | null>(null);
  const [editModalEntryId, setEditModalEntryId] = useState<number | null>(null);
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [entryView, setEntryView] = useState<'date' | 'project'>('date');
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // === Helpers ===
  const formatHMS = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // === Actions ===
  const handleStart = () => {
    if (state?.isRunning) return;
    const now = Date.now();
    setState(s => s ? {
      ...s,
      isRunning: true,
      startedAt: now,
      sessionStartedAt: s.sessionStartedAt || now
    } : null);
  };

  const handlePause = () => {
    if (!state?.isRunning || !state.startedAt) return;
    const now = Date.now();
    const liveSeconds = Math.floor((now - state.startedAt) / 1000);
    setState(s => s ? {
      ...s,
      isRunning: false,
      startedAt: null,
      elapsedBefore: s.elapsedBefore + liveSeconds
    } : null);
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
    let interval: number;
    if (state?.isRunning) {
      interval = window.setInterval(() => {
        const now = Date.now();
        const liveSeconds = state?.startedAt ? Math.floor((now - state.startedAt) / 1000) : 0;
        setLiveDuration((state?.elapsedBefore || 0) + liveSeconds);
      }, 1000);
    } else {
      setLiveDuration(state?.elapsedBefore || 0);
    }
    return () => clearInterval(interval);
  }, [state?.isRunning, state?.startedAt, state?.elapsedBefore]);

  useEffect(() => {
    if (state?.isRunning) {
      document.title = `▶ ${formatHMS(liveDuration)} - Kavoma Time`;
    } else {
      document.title = 'Kavoma Time';
    }
  }, [state?.isRunning, liveDuration]);

  useEffect(() => {
    if (!window.api?.onHotkeyToggle) return;
    return window.api.onHotkeyToggle(() => {
      if (state?.isRunning) handlePause();
      else handleStart();
    });
  }, [state?.isRunning, state?.startedAt, state?.elapsedBefore, state?.sessionStartedAt]);

  if (!state) {
    return <div className="text-center text-sm text-muted mt-12">Lade Daten...</div>;
  }

  const handleStop = () => {
    if (!state.isRunning && state.elapsedBefore === 0) return;
    
    let totalSeconds = state.elapsedBefore;
    const now = Date.now();
    
    if (state.isRunning && state.startedAt) {
      totalSeconds += Math.floor((now - state.startedAt) / 1000);
    }

    if (totalSeconds > 0 && state.sessionStartedAt) {
      const newEntry: TimeEntry = {
        id: now,
        customerId: state.currentCustomerId,
        projectId: state.currentProjectId,
        description: state.currentDescription,
        startedAt: state.sessionStartedAt,
        endedAt: now,
        durationSeconds: totalSeconds
      };
      
      setState(s => {
        if (!s) return null;
        return {
          ...s,
          isRunning: false,
          startedAt: null,
          sessionStartedAt: null,
          elapsedBefore: 0,
          currentDescription: '',
          entries: [newEntry, ...s.entries]
        };
      });
    } else {
      setState(s => {
        if (!s) return null;
        return {
          ...s,
          isRunning: false,
          startedAt: null,
          sessionStartedAt: null,
          elapsedBefore: 0,
          currentDescription: '',
        };
      });
    }
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
    setState(s => {
      if (!s) return null;
      return { ...s, entries: s.entries.filter(e => e.id !== id) };
    });
    setDeleteModalEntryId(null);
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
  const allDescriptions = [...new Set(state.entries.map(e => e.description).filter(Boolean))];

  return (
    <>
      <header className="mb-3 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          {state.isRunning && state.startedAt ? `Läuft seit ${new Date(state.startedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'Bereit'}
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
          onChange={(v) => setState(s => s ? ({...s, currentCustomerId: v as number, currentProjectId: projects.find(p=>p.customerId===v)?.id || 0}) : null)} 
        />
        <CustomSelect 
          id="projectSelect" 
          label="Projekt" 
          value={state.currentProjectId} 
          options={availableProjects} 
          onChange={(v) => setState(s => s ? ({...s, currentProjectId: v as number}) : null)} 
        />

        <div className="col-span-2">
          <CustomAutocomplete
            id="descriptionInput"
            label="Beschreibung"
            options={allDescriptions}
            placeholder="Woran arbeitest du?"
            value={state.currentDescription}
            onChange={v => setState(s => s ? ({...s, currentDescription: v}) : null)}
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
          className={`flex-1 cursor-pointer rounded-md border px-4 py-3 text-sm font-bold uppercase tracking-widest transition-all active:scale-95 ${
            state.isRunning 
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
        const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const formatHM = (s: number) => `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;

        const sorted = [...state.entries].sort((a, b) => b.startedAt - a.startedAt)
          .filter(e => {
            if (!searchTerm.trim()) return true;
            const q = searchTerm.toLowerCase();
            const cName = customers.find(c => c.id === e.customerId)?.name?.toLowerCase() ?? '';
            const pName = projects.find(p => p.id === e.projectId)?.name?.toLowerCase() ?? '';
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
            const customer = customers.find(c => c.id === project?.customerId);
            projectGroups.push({ projectId: pid, project, customer, entries: ents, total: ents.reduce((s, e) => s + e.durationSeconds, 0) });
          }
          projectGroups.sort((a, b) => b.total - a.total);
        }

        const renderEntry = (entry: TimeEntry) => {
          const customer = customers.find(c => c.id === entry.customerId);
          const project = projects.find(p => p.id === entry.projectId);
          const d = new Date(entry.startedAt);
          return (
            <li
              key={entry.id}
              onContextMenu={(e) => handleContextMenu(e, entry.id)}
              onDoubleClick={() => setEditModalEntryId(entry.id)}
              className="group flex items-center gap-3 rounded-md border-l-[3px] bg-surface px-3 py-2.5 transition-colors hover:bg-divider cursor-pointer"
              style={{ borderLeftColor: customer?.color || '#525252' }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-xs font-bold text-ink">{entry.description || '(ohne Beschreibung)'}</div>
                <div className="truncate text-[11px] text-muted">{customer?.name} · {project?.name}</div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <div className="text-[11px] text-muted tabular-nums">
                  {d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · {d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} — {entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'läuft'}
                </div>
                <div className="text-xs font-black tabular-nums">{formatHM(entry.durationSeconds)}</div>
              </div>
            </li>
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
                      className={`cursor-pointer rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                        entryView === v ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {v === 'date' ? 'Datum' : 'Projekt'}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setNewEntryOpen(true)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-divider px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-muted transition-colors hover:border-ink hover:text-ink"
              >
                <Plus size={12} /> Nachtragen
              </button>
            </div>

            {state.entries.length > 10 && (
              <div className="mb-4 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Einträge durchsuchen…"
                  className="w-full pl-9 pr-8 placeholder:text-muted"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
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
                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{g.label}</h3>
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
                        <ChevronRight size={14} className={`shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="truncate text-xs font-bold text-ink">{g.project?.name ?? 'Unbekannt'}</div>
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
              onClick={() => { setDeleteModalEntryId(contextMenu.entryId); setContextMenu(null); }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-divider"
            >
              <Trash2 size={13} />
              Löschen
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <DeleteModal 
        entry={state.entries.find(e => e.id === deleteModalEntryId) || null}
        onConfirm={() => deleteModalEntryId && handleDeleteEntry(deleteModalEntryId)}
        onCancel={() => setDeleteModalEntryId(null)}
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
