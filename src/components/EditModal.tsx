import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Clock } from 'lucide-react';
import { TimeEntry, Customer, Project } from '../types';
import { CustomSelect } from './CustomSelect';
import { CustomAutocomplete } from './CustomAutocomplete';
import { CustomInput } from './CustomInput';
import { DatePicker } from './DatePicker';
import { NO_PROJECT_ID, NO_PROJECT_OPTION } from '../utils/projects';

interface EditModalProps {
  entry: TimeEntry | null;
  customers: Customer[];
  projects: Project[];
  onSave: (updatedEntry: TimeEntry) => void;
  onCancel: () => void;
  recentDescriptions?: string[];
}

function toISODate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toTimeString(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')} Std.`;
}

export function EditModal({ entry, customers, projects, onSave, onCancel, recentDescriptions = [] }: EditModalProps) {
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState(0);
  const [projectId, setProjectId] = useState(0);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry) {
      setDescription(entry.description);
      setCustomerId(entry.customerId);
      setProjectId(entry.projectId);
      setDate(toISODate(entry.startedAt));
      setStartTime(toTimeString(entry.startedAt));
      setEndTime(entry.endedAt ? toTimeString(entry.endedAt) : toTimeString(Date.now()));
      setError('');
    }
  }, [entry]);

  const durationSeconds = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
    
    const startTotal = sH * 3600 + sM * 60;
    const endTotal = eH * 3600 + eM * 60;
    
    let diff = endTotal - startTotal;
    if (diff < 0) diff += 24 * 3600; // Overnight support
    return diff;
  }, [startTime, endTime]);

  const availableProjects = projects.filter(p => p.customerId === customerId);

  const handleSave = () => {
    if (!entry) return;
    if (durationSeconds <= 0 && entry.endedAt) {
      setError('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }

    const startAt = new Date(`${date}T${startTime}:00`).getTime();
    let endAt: number | null = entry.endedAt ? new Date(`${date}T${endTime}:00`).getTime() : null;
    
    // Support overnight for edited entries too
    if (endAt !== null && endAt <= startAt) {
      endAt += 24 * 3600 * 1000;
    }

    onSave({
      ...entry,
      description: description.trim(),
      customerId,
      projectId,
      startedAt: startAt,
      endedAt: endAt,
      durationSeconds: endAt ? durationSeconds : entry.durationSeconds,
    });
  };

  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 kv-scrim"
            onClick={onCancel}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 mx-4 w-full max-w-md overflow-visible kv-overlay p-0 text-ink"
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
              <h3 className="text-sm font-bold uppercase tracking-wide">Eintrag bearbeiten</h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <DatePicker
                label="Datum"
                value={date}
                onChange={setDate}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 kv-label">Von (Start)</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-11 rounded-md border border-divider bg-paper px-3 text-sm tabular-nums text-ink outline-none focus:border-accent font-bold"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 kv-label">Bis (Ende)</label>
                  <input
                    type="time"
                    value={endTime}
                    disabled={!entry.endedAt}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={`h-11 rounded-md border border-divider bg-paper px-3 text-sm tabular-nums text-ink outline-none focus:border-accent font-bold ${!entry.endedAt ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              {entry.endedAt && (
                <div className="flex items-center gap-2 rounded-md bg-paper/50 px-3 py-2 border border-divider/50">
                  <Clock size={12} className="text-muted" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Neue Dauer:</span>
                  <span className="text-xs font-black tabular-nums text-accent">{formatHMS(durationSeconds)}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <CustomSelect
                  id="editModalCustomer"
                  label="Kunde"
                  value={customerId}
                  options={customers}
                  onChange={(v) => { 
                    setCustomerId(v as number); 
                    setProjectId(projects.find(p => p.customerId === v)?.id || NO_PROJECT_ID); 
                  }}
                />
                <CustomSelect
                  id="editModalProject"
                  label="Projekt"
                  value={projectId}
                  options={[NO_PROJECT_OPTION, ...availableProjects]}
                  onChange={(v) => setProjectId(v as number)}
                />
              </div>

              <CustomAutocomplete
                id="editDescription"
                label="Beschreibung"
                value={description}
                onChange={setDescription}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
                placeholder="Woran hast du gearbeitet?"
                options={recentDescriptions}
              />

              {error && <div className="text-xs font-bold text-danger/90">{error}</div>}
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={onCancel}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold text-muted transition-colors hover:bg-divider hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                className="cursor-pointer rounded-md bg-ink px-4 py-2 text-xs font-bold text-paper transition-colors hover:bg-accent"
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
