import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Plus } from 'lucide-react';
import { Project, Customer } from '../types';
import { CustomSelect } from './CustomSelect';

interface Props {
  open: boolean;
  project: Project | null;
  customers: Customer[];
  onSave: (p: Omit<Project, 'id'> & { id?: number }) => void;
  onCancel: () => void;
}

function parseNumOrUndef(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return !isNaN(n) && n > 0 ? n : undefined;
}

export function ProjectEditModal({ open, project, customers, onSave, onCancel }: Props) {
  const [name, setName]             = useState('');
  const [customerId, setCustomerId] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [rate, setRate]             = useState('');
  const [budgetHours, setBudgetHours] = useState('');
  const [fixedPrice, setFixedPrice] = useState('');

  useEffect(() => {
    if (open) {
      if (project) {
        setName(project.name);
        setCustomerId(project.customerId);
        setDescription(project.description ?? '');
        setRate(project.hourlyRate ? String(project.hourlyRate) : '');
        setBudgetHours(project.budgetHours ? String(project.budgetHours) : '');
        setFixedPrice(project.fixedPrice ? String(project.fixedPrice) : '');
      } else {
        setName('');
        setCustomerId(customers[0]?.id || 0);
        setDescription('');
        setRate('');
        setBudgetHours('');
        setFixedPrice('');
      }
    }
  }, [open, project, customers]);

  const save = () => {
    if (!name.trim() || !customerId) return;
    onSave({
      ...(project ? project : {}),
      name: name.trim(),
      customerId,
      description: description.trim() || undefined,
      hourlyRate: parseNumOrUndef(rate),
      budgetHours: parseNumOrUndef(budgetHours),
      fixedPrice: parseNumOrUndef(fixedPrice),
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-divider px-6 pt-6 pb-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
                {project ? (
                  <Pencil size={16} className="text-accent" />
                ) : (
                  <Plus size={16} className="text-accent" />
                )}
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {project ? 'Projekt bearbeiten' : 'Projekt anlegen'}
              </h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                />
              </div>

              <CustomSelect
                id="projectCustomerSelect"
                label="Kunde"
                value={customerId}
                options={customers}
                onChange={(v) => setCustomerId(v as number)}
              />

              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Auftragsbeschreibung</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Was umfasst das Projekt? Briefing, Scope, Deliverables..."
                  className="resize-none rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Stundensatz €</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="leer = Kunde"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm tabular-nums text-ink placeholder:text-muted outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Budget Std.</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={budgetHours}
                    onChange={(e) => setBudgetHours(e.target.value)}
                    placeholder="optional"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm tabular-nums text-ink placeholder:text-muted outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Pauschal €</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(e.target.value)}
                    placeholder="optional"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm tabular-nums text-ink placeholder:text-muted outline-none focus:border-accent"
                  />
                </div>
              </div>
              <p className="-mt-2 text-[10px] text-muted">
                Stundensatz überschreibt Kundensatz. Budget / Pauschal nur für Profitabilitäts-Analyse.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted transition-colors hover:bg-divider hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={save}
                className="cursor-pointer rounded-md bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent active:scale-95"
              >
                Speichern
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
