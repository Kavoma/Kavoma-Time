import { useState } from 'react';
import { Trash2, Pencil, Plus, Users, ShieldCheck } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Customer } from '../types';
import { ContextMenu } from '../components/ContextMenu';
import { CustomerEditModal } from '../components/CustomerEditModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';


export function CustomersView() {
  const { state, setState } = useAppState();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [menu, setMenu]           = useState<{ x: number; y: number; customerId: number } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (!state) return null;

  const handleSave = (data: Omit<Customer, 'id'> & { id?: number }) => {
    if (data.id) {
      // Update
      setState(s => s ? { ...s, customers: s.customers.map(c => c.id === data.id ? data as Customer : c) } : null);
      setEditingId(null);
    } else {
      // Create
      const newDebtorNumber = data.debtorNumber || String(state.nextDebtorNumber);
      const newCustomer: Customer = {
        ...data,
        id: Date.now(),
        debtorNumber: newDebtorNumber,
      };
      setState(s => s ? { 
        ...s, 
        customers: [...s.customers, newCustomer],
        nextDebtorNumber: data.debtorNumber ? s.nextDebtorNumber : s.nextDebtorNumber + 1 
      } : null);
      setIsCreateOpen(false);
    }
  };

  const removeCustomer = (id: number) => {
    setState(s => s ? {
      ...s,
      customers: s.customers.filter(c => c.id !== id),
      projects:  s.projects.filter(p => p.customerId !== id),
    } : null);
    setDeletingId(null);
  };

  const editingCustomer = state.customers.find(c => c.id === editingId) || null;
  const deletingCustomer = state.customers.find(c => c.id === deletingId) || null;

  return (
    <>
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight leading-none">Kunden</h2>
          <p className="mt-1.5 text-xs text-muted">{state.customers.length} {state.customers.length === 1 ? 'Kunde' : 'Kunden'} angelegt</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-bold leading-normal uppercase tracking-widest text-paper transition-all hover:border-accent hover:bg-accent active:scale-95"
          >
            <Plus size={14} /> Neu
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
            <Users size={18} className="text-muted" />
          </div>
        </div>
      </div>

      {/* Kundenliste */}
      <div className="mb-4 flex items-baseline justify-between border-b border-divider pb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Alle Kunden</h3>
      </div>
      <ul className="flex flex-col gap-1.5">
        {state.customers.map(c => (
          <li
            key={c.id}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, customerId: c.id }); }}
            className="group flex items-center gap-3 rounded-md border-l-[3px] bg-surface px-4 py-3 transition-colors hover:bg-divider cursor-context-menu"
            style={{ borderLeftColor: c.color }}
          >
            <span className="size-3.5 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="flex-1 truncate text-sm font-bold text-ink">{c.name}</span>
            {c.eInvoiceAccepted && (
              <span title="E-Rechnung Einverständnis liegt vor" className="shrink-0 flex items-center">
                <ShieldCheck size={14} className="text-green-500/80" />
              </span>
            )}
            {c.hourlyRate ? (
              <span className="shrink-0 rounded-full bg-divider px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent tabular-nums">
                {c.hourlyRate.toLocaleString('de-DE')} €/h
              </span>
            ) : null}
            <span className="text-[11px] text-muted tabular-nums">
              {state.projects.filter(p => p.customerId === c.id).length} Projekte
            </span>
          </li>
        ))}
        {state.customers.length === 0 && (
          <div className="rounded-md border border-dashed border-divider bg-paper p-10 text-center">
            <Users size={28} className="mx-auto mb-3 text-muted" />
            <p className="text-sm text-muted">Noch keine Kunden angelegt.</p>
            <p className="mt-1 text-xs text-muted/60">Klicke oben auf "Neu", um deinen ersten Kunden hinzuzufügen.</p>
          </div>
        )}
      </ul>

      <ContextMenu
        position={menu}
        onClose={() => setMenu(null)}
        items={menu ? [
          { label: 'Bearbeiten', icon: <Pencil size={13} />, onClick: () => setEditingId(menu.customerId) },
          { label: 'Löschen',    icon: <Trash2 size={13} />, danger: true, onClick: () => setDeletingId(menu.customerId) },
        ] : []}
      />

      <CustomerEditModal
        open={isCreateOpen || editingId !== null}
        customer={editingCustomer}
        onSave={handleSave}
        onCancel={() => { setEditingId(null); setIsCreateOpen(false); }}
      />

      <ConfirmDeleteModal
        open={deletingCustomer !== null}
        title="Kunde löschen?"
        description={deletingCustomer ? `"${deletingCustomer.name}" und alle zugehörigen Projekte werden unwiderruflich gelöscht.` : ''}
        onConfirm={() => deletingId !== null && removeCustomer(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </>
  );
}
