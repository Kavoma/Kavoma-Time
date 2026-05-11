import { useState } from 'react';
import { Trash2, Pencil, Plus, FolderKanban } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Project } from '../types';
import { ContextMenu } from '../components/ContextMenu';
import { ProjectEditModal } from '../components/ProjectEditModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

export function ProjectsView() {
  const { state, setState } = useAppState();
  const [newName, setNewName]               = useState('');
  const [newCustomerId, setNewCustomerId]   = useState<number | null>(null);
  const [menu, setMenu]                     = useState<{ x: number; y: number; projectId: number } | null>(null);
  const [editingId, setEditingId]           = useState<number | null>(null);
  const [deletingId, setDeletingId]         = useState<number | null>(null);

  if (!state) return null;

  const customerId = newCustomerId ?? state.customers[0]?.id ?? null;

  const addProject = () => {
    const name = newName.trim();
    if (!name || customerId === null) return;
    setState(s => s ? { ...s, projects: [...s.projects, { id: Date.now(), name, customerId }] } : null);
    setNewName('');
  };

  const updateProject = (updated: Project) => {
    setState(s => s ? { ...s, projects: s.projects.map(p => p.id === updated.id ? updated : p) } : null);
    setEditingId(null);
  };

  const removeProject = (id: number) => {
    setState(s => s ? { ...s, projects: s.projects.filter(p => p.id !== id) } : null);
    setDeletingId(null);
  };

  const editingProject = state.projects.find(p => p.id === editingId) || null;
  const deletingProject = state.projects.find(p => p.id === deletingId) || null;

  return (
    <>
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight leading-none">Projekte</h2>
          <p className="mt-1.5 text-xs text-muted">{state.projects.length} {state.projects.length === 1 ? 'Projekt' : 'Projekte'} angelegt</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
          <FolderKanban size={18} className="text-muted" />
        </div>
      </div>

      {state.customers.length === 0 ? (
        <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
          <FolderKanban size={28} className="mx-auto mb-3 text-muted" />
          <p className="text-sm text-muted">Erst einen Kunden anlegen.</p>
          <p className="mt-1 text-xs text-muted/60">Projekte werden einem Kunden zugeordnet.</p>
        </div>
      ) : (
        <>
          {/* Neues Projekt anlegen */}
          <div className="mb-8 rounded-lg border border-divider bg-surface">
            <div className="border-b border-divider px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Neues Projekt anlegen</span>
            </div>
            <div className="flex gap-2 p-4">
              <select
                value={customerId ?? ''}
                onChange={e => setNewCustomerId(Number(e.target.value))}
                className="min-w-44 rounded-md border border-divider bg-paper px-3 py-2 text-sm font-bold leading-normal text-ink outline-none transition-colors focus:border-accent"
              >
                {state.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addProject(); }}
                placeholder="Projektname eingeben..."
                className="flex-1 rounded-md border border-divider bg-paper px-3 py-2 text-sm leading-normal text-ink placeholder:text-muted outline-none transition-colors focus:border-accent"
              />
              <button
                onClick={addProject}
                className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-5 py-2 text-xs font-bold leading-normal uppercase tracking-widest text-paper transition-all hover:border-accent hover:bg-accent active:scale-95"
              >
                <Plus size={14} /> Hinzufügen
              </button>
            </div>
          </div>

          {/* Projektliste */}
          <div className="mb-4 flex items-baseline justify-between border-b border-divider pb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Alle Projekte</h3>
          </div>
          <ul className="flex flex-col gap-1.5">
            {state.projects.map(p => {
              const customer = state.customers.find(c => c.id === p.customerId);
              return (
                <li
                  key={p.id}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, projectId: p.id }); }}
                  className="group flex items-center gap-3 rounded-md border-l-[3px] bg-surface px-4 py-3 transition-colors hover:bg-divider cursor-context-menu"
                  style={{ borderLeftColor: customer?.color || '#525252' }}
                >
                  <span className="size-3.5 shrink-0 rounded-full" style={{ background: customer?.color || '#525252' }} />
                  <span className="flex-1 truncate text-sm font-bold text-ink">{p.name}</span>
                  <span className="shrink-0 rounded-full bg-divider px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    {customer?.name ?? '—'}
                  </span>
                </li>
              );
            })}
            {state.projects.length === 0 && (
              <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
                <FolderKanban size={28} className="mx-auto mb-3 text-muted" />
                <p className="text-sm text-muted">Noch keine Projekte angelegt.</p>
                <p className="mt-1 text-xs text-muted/60">Verwende das Formular oben, um dein erstes Projekt hinzuzufügen.</p>
              </div>
            )}
          </ul>

          <ContextMenu
            position={menu}
            onClose={() => setMenu(null)}
            items={menu ? [
              { label: 'Bearbeiten', icon: <Pencil size={13} />, onClick: () => setEditingId(menu.projectId) },
              { label: 'Löschen',    icon: <Trash2 size={13} />, danger: true, onClick: () => setDeletingId(menu.projectId) },
            ] : []}
          />

          <ProjectEditModal
            project={editingProject}
            customers={state.customers}
            onSave={updateProject}
            onCancel={() => setEditingId(null)}
          />

          <ConfirmDeleteModal
            open={deletingProject !== null}
            title="Projekt löschen?"
            description={deletingProject ? `"${deletingProject.name}" wird unwiderruflich gelöscht.` : ''}
            onConfirm={() => deletingId !== null && removeProject(deletingId)}
            onCancel={() => setDeletingId(null)}
          />
        </>
      )}
    </>
  );
}
