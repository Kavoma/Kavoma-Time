import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Customer, Project, TimeEntry } from '../types';
import { CustomSelect } from './CustomSelect';

interface Props {
  open: boolean;
  customers: Customer[];
  projects: Project[];
  defaultCustomerId?: number;
  defaultProjectId?: number;
  onSave: (entry: TimeEntry) => void;
  onCancel: () => void;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDurationToSeconds(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!s) return null;
  if (s.includes(':')) {
    const [h, m] = s.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 3600 + m * 60;
  }
  const num = parseFloat(s);
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num * 3600);
}

export function NewEntryModal({ open, customers, projects, defaultCustomerId, defaultProjectId, onSave, onCancel }: Props) {
  const [date, setDate]               = useState(todayISO());
  const [duration, setDuration]       = useState('1:00');
  const [customerId, setCustomerId]   = useState<number>(0);
  const [projectId, setProjectId]     = useState<number>(0);
  const [description, setDescription] = useState('');
  const [error, setError]             = useState('');

  useEffect(() => {
    if (open) {
      setDate(todayISO());
      setDuration('1:00');
      setCustomerId(defaultCustomerId ?? customers[0]?.id ?? 0);
      const firstProject = projects.find(p => p.customerId === (defaultCustomerId ?? customers[0]?.id));
      setProjectId(defaultProjectId ?? firstProject?.id ?? 0);
      setDescription('');
      setError('');
    }
  }, [open]);

  const availableProjects = projects.filter(p => p.customerId === customerId);

  const handleSave = () => {
    const seconds = parseDurationToSeconds(duration);
    if (!seconds) { setError('Ungültige Dauer (z.B. "2:00" oder "1,5")'); return; }
    if (!customerId || !projectId) { setError('Kunde und Projekt wählen'); return; }

    // Endzeit: heute = jetzt, sonst Datum + 12:00
    const isToday = date === todayISO();
    const endDate = new Date(date + 'T12:00:00');
    if (isToday) endDate.setTime(Date.now());

    const endedAt   = endDate.getTime();
    const startedAt = endedAt - seconds * 1000;

    onSave({
      id: Date.now(),
      customerId,
      projectId,
      description: description.trim(),
      startedAt,
      endedAt,
      durationSeconds: seconds,
    });
  };

  return (
    <AnimatePresence>
      {open && (
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
            className="relative z-10 mx-4 w-full max-w-md rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-divider px-6 pt-6 pb-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
                <Plus size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wide">Eintrag nachtragen</h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Datum</label>
                  <input
                    type="date"
                    value={date}
                    max={todayISO()}
                    onChange={(e) => setDate(e.target.value)}
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm tabular-nums text-ink outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Dauer (h:m)</label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="2:00"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm tabular-nums text-ink outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CustomSelect
                  id="newEntryCustomer"
                  label="Kunde"
                  value={customerId}
                  options={customers}
                  onChange={(v) => {
                    const id = v as number;
                    setCustomerId(id);
                    const first = projects.find(p => p.customerId === id);
                    setProjectId(first?.id ?? 0);
                  }}
                />
                <CustomSelect
                  id="newEntryProject"
                  label="Projekt"
                  value={projectId}
                  options={availableProjects}
                  onChange={(v) => setProjectId(v as number)}
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Beschreibung</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  placeholder="Woran hast du gearbeitet?"
                  className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
                />
              </div>

              {error && <div className="text-xs text-red-400">{error}</div>}
            </div>

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
                Hinzufügen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
