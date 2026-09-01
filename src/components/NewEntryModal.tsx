import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Clock } from 'lucide-react';
import { Customer, Project, TimeEntry } from '../types';
import { CustomSelect } from './CustomSelect';
import { CustomAutocomplete } from './CustomAutocomplete';
import { CustomInput } from './CustomInput';
import { DatePicker } from './DatePicker';
import { newNumericId } from '../sync/ids';
import { NO_PROJECT_ID, NO_PROJECT_OPTION } from '../utils/projects';

interface Props {
  open: boolean;
  customers: Customer[];
  projects: Project[];
  defaultCustomerId?: number;
  defaultProjectId?: number;
  onSave: (entry: TimeEntry) => void;
  onCancel: () => void;
  recentDescriptions?: string[];
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')} Std.`;
}

export function NewEntryModal({ open, customers, projects, defaultCustomerId, defaultProjectId, onSave, onCancel, recentDescriptions = [] }: Props) {
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [customerId, setCustomerId] = useState<number>(0);
  const [projectId, setProjectId] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDate(todayISO());
      // Set reasonable defaults
      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const startH = String(Math.max(0, now.getHours() - 1)).padStart(2, '0');
      
      setStartTime(`${startH}:00`);
      setEndTime(`${currentH}:00`);
      
      setCustomerId(defaultCustomerId ?? customers[0]?.id ?? 0);
      const firstProject = projects.find(p => p.customerId === (defaultCustomerId ?? customers[0]?.id));
      setProjectId(defaultProjectId ?? firstProject?.id ?? 0);
      setDescription('');
      setError('');
    }
  }, [open, defaultCustomerId, defaultProjectId, customers, projects]);

  const durationSeconds = useMemo(() => {
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
    
    const startTotal = sH * 3600 + sM * 60;
    const endTotal = eH * 3600 + eM * 60;
    
    let diff = endTotal - startTotal;
    if (diff < 0) diff += 24 * 3600; // Over midnight support
    return diff;
  }, [startTime, endTime]);

  const availableProjects = projects.filter(p => p.customerId === customerId);

  const handleSave = () => {
    if (durationSeconds <= 0) {
      setError('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }
    // Nur der Kunde ist Pflicht. Ein Projekt lässt sich später nachtragen —
    // den Eintrag deswegen abzulehnen, verlöre die Zeit, um die es geht.
    if (!customerId) {
      setError('Kunde wählen');
      return;
    }

    const startAt = new Date(`${date}T${startTime}:00`).getTime();
    let endAt = new Date(`${date}T${endTime}:00`).getTime();
    
    // If end is before start, assume it's the next day
    if (endAt <= startAt) {
      endAt += 24 * 3600 * 1000;
    }

    onSave({
      id: newNumericId(),
      customerId,
      projectId,
      description: description.trim(),
      startedAt: startAt,
      endedAt: endAt,
      durationSeconds: durationSeconds,
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
              <DatePicker
                label="Datum"
                value={date}
                onChange={setDate}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Von (Start)</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-11 rounded-md border border-divider bg-paper px-3 text-sm tabular-nums text-ink outline-none focus:border-accent font-bold"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Bis (Ende)</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-11 rounded-md border border-divider bg-paper px-3 text-sm tabular-nums text-ink outline-none focus:border-accent font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-md bg-paper/50 px-3 py-2 border border-divider/50">
                <Clock size={12} className="text-muted" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Dauer:</span>
                <span className="text-xs font-black tabular-nums text-accent">{formatHMS(durationSeconds)}</span>
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
                    setProjectId(first?.id ?? NO_PROJECT_ID);
                  }}
                />
                <CustomSelect
                  id="newEntryProject"
                  label="Projekt"
                  value={projectId}
                  options={[NO_PROJECT_OPTION, ...availableProjects]}
                  onChange={(v) => setProjectId(v as number)}
                />
              </div>

              <CustomAutocomplete
                id="manualDescription"
                label="Beschreibung"
                value={description}
                onChange={setDescription}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder="Woran hast du gearbeitet?"
                options={recentDescriptions}
              />

              {error && <div className="text-xs font-bold text-red-400/90">{error}</div>}
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
