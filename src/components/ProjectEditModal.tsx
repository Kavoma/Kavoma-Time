import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { Project, Customer } from '../types';
import { CustomSelect } from './CustomSelect';

interface Props {
  project: Project | null;
  customers: Customer[];
  onSave: (p: Project) => void;
  onCancel: () => void;
}

export function ProjectEditModal({ project, customers, onSave, onCancel }: Props) {
  const [name, setName]             = useState('');
  const [customerId, setCustomerId] = useState<number>(0);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setCustomerId(project.customerId);
    }
  }, [project]);

  const save = () => {
    if (!project || !name.trim() || !customerId) return;
    onSave({ ...project, name: name.trim(), customerId });
  };

  return (
    <AnimatePresence>
      {project && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 mx-4 w-full max-w-md rounded-lg border border-divider bg-surface p-0 text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-divider px-6 pt-6 pb-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
                <Pencil size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wide">Projekt bearbeiten</h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
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
