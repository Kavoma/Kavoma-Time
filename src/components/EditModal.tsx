import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { TimeEntry, Customer, Project } from '../types';
import { CustomSelect } from './CustomSelect';

interface EditModalProps {
  entry: TimeEntry | null;
  customers: Customer[];
  projects: Project[];
  onSave: (updatedEntry: TimeEntry) => void;
  onCancel: () => void;
}

export function EditModal({ entry, customers, projects, onSave, onCancel }: EditModalProps) {
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState(1);
  const [projectId, setProjectId] = useState(1);

  useEffect(() => {
    if (entry) {
      setDescription(entry.description);
      setCustomerId(entry.customerId);
      setProjectId(entry.projectId);
    }
  }, [entry]);

  const availableProjects = projects.filter(p => p.customerId === customerId);

  const handleSave = () => {
    if (!entry) return;
    onSave({
      ...entry,
      description,
      customerId,
      projectId
    });
  };

  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Dialog */}
          <motion.div
            className="relative z-10 mx-4 w-full max-w-md overflow-visible rounded-lg border border-divider bg-surface p-0 text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-divider px-6 pt-6 pb-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
                <Pencil size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wide">Eintrag bearbeiten</h3>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.15em] text-muted tabular-nums">
                {new Date(entry.startedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} — {entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'läuft'}
                <span className="ml-2 text-accent">
                  ({Math.floor(entry.durationSeconds / 3600)}:{String(Math.floor((entry.durationSeconds % 3600) / 60)).padStart(2, '0')}h)
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <CustomSelect
                  id="editModalCustomer"
                  label="Kunde"
                  value={customerId}
                  options={customers}
                  onChange={(v) => { setCustomerId(v as number); setProjectId(projects.find(p => p.customerId === v)?.id || 0); }}
                />
                <CustomSelect
                  id="editModalProject"
                  label="Projekt"
                  value={projectId}
                  options={availableProjects}
                  onChange={(v) => setProjectId(v as number)}
                />
              </div>

              <div className="flex flex-col">
                <label htmlFor="editModalDescription" className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Beschreibung
                </label>
                <input
                  id="editModalDescription"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  autoFocus
                  className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition-colors focus:border-accent"
                  placeholder="Woran hast du gearbeitet?"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted transition-colors hover:bg-divider hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
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
