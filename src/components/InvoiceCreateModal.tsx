import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldCheck, ClipboardList } from 'lucide-react';
import { Customer, Project, TimeEntry, Invoice, Issuer, InvoiceItem } from '../types';
import { CustomSelect } from './CustomSelect';
import { DatePicker } from './DatePicker';

interface Props {
  open: boolean;
  customers: Customer[];
  projects: Project[];
  entries: TimeEntry[];
  issuer: Issuer;
  nextCounter: number;
  onSave: (invoice: Invoice, options: { includeReport: boolean; includeConsent: boolean }) => void;
  onCancel: () => void;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

export function InvoiceCreateModal({ open, customers, projects, entries, issuer, nextCounter, invoicePrefix, onSave, onCancel }: Props & { invoicePrefix: string }) {
  const [customerId, setCustomerId] = useState<number>(0);
  const [projectId, setProjectId]   = useState<number>(0);   // 0 = alle
  const [from, setFrom]             = useState(startOfMonthISO());
  const [to, setTo]                 = useState(todayISO());
  const [mode, setMode]             = useState<'hourly' | 'fixed'>('hourly');
  const [fixedAmount, setFixedAmount] = useState('');
  const [fixedDescription, setFixedDescription] = useState('');
  const [serviceType, setServiceType] = useState('Dienstleistung');
  const [notes, setNotes]           = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [createdAt, setCreatedAt]   = useState(todayISO());
  const [dueDate, setDueDate]       = useState(addDaysISO(todayISO(), 14));
  const [includeReport, setIncludeReport] = useState(true);
  const [includeConsent, setIncludeConsent] = useState(false);
  const [error, setError]           = useState('');

  // Initial values bei Öffnen
  useEffect(() => {
    if (!open) return;
    setCustomerId(customers[0]?.id ?? 0);
    setProjectId(0);
    setFrom(startOfMonthISO());
    setTo(todayISO());
    setMode('hourly');
    setFixedAmount('');
    setFixedDescription('');
    setServiceType('Dienstleistung');
    setNotes('');
    setIncludeReport(true);
    setIncludeConsent(false);
    const prefix = (invoicePrefix || 'YYYY-').replace('YYYY', String(new Date().getFullYear()));
    setInvoiceNumber(`${prefix}${String(nextCounter).padStart(3, '0')}`);
    setCreatedAt(todayISO());
    setDueDate(addDaysISO(todayISO(), 14));
    setError('');
  }, [open]);

  const customer = customers.find(c => c.id === customerId);
  const availableProjects = useMemo(
    () => projects.filter(p => p.customerId === customerId),
    [projects, customerId]
  );

  // Passende Entries für die Auswahl
  const fromTs = new Date(from + 'T00:00:00').getTime();
  const toTs   = new Date(to   + 'T23:59:59').getTime();
  const matchedEntries = useMemo(() => {
    return entries.filter(e =>
      e.customerId === customerId &&
      (projectId === 0 || e.projectId === projectId) &&
      e.startedAt >= fromTs && e.startedAt <= toTs
    );
  }, [entries, customerId, projectId, fromTs, toTs]);

  const totalHours = matchedEntries.reduce((s, e) => s + e.durationSeconds, 0) / 3600;
  // Stundensatz-Auflösung pro Eintrag: Projekt-Rate hat Vorrang vor Kunden-Rate
  const rateFor = (e: TimeEntry): number => {
    const p = projects.find(pp => pp.id === e.projectId);
    if (p?.hourlyRate) return p.hourlyRate;
    return customer?.hourlyRate ?? 0;
  };
  const hourlyAmount = matchedEntries.reduce((s, e) => s + (e.durationSeconds / 3600) * rateFor(e), 0);
  // Für die Vorschau "Stundensatz" — nur sinnvoll wenn einheitlich
  const rate = customer?.hourlyRate ?? 0;

  const save = () => {
    if (!customer) { setError('Kunde wählen'); return; }
    const hasCustAddr = customer.street || customer.address;
    const hasIssuAddr = issuer.street && issuer.city;
    if (!hasCustAddr) { setError('Kunde hat keine Adresse — Rechnung wäre nicht vollständig.'); return; }
    if (!issuer.name || !hasIssuAddr) { setError('Absenderdaten in Einstellungen (Name, Straße, Stadt) fehlen.'); return; }

    let items: InvoiceItem[];

    if (mode === 'hourly') {
      if (matchedEntries.length === 0) { setError('Keine Zeiteinträge im Zeitraum.'); return; }

      // Gruppiere nach Projekt — jedes Projekt kann eigenen Stundensatz haben
      const byProject = new Map<number, TimeEntry[]>();
      matchedEntries.forEach(e => {
        if (!byProject.has(e.projectId)) byProject.set(e.projectId, []);
        byProject.get(e.projectId)!.push(e);
      });
      items = Array.from(byProject.entries()).map(([pid, ents]) => {
        const p = projects.find(pp => pp.id === pid);
        const projectRate = p?.hourlyRate ?? customer.hourlyRate ?? 0;
        const hours = ents.reduce((s, e) => s + e.durationSeconds, 0) / 3600;
        return {
          description: `${serviceType}${p ? ` (${p.name})` : ''} — Zeitraum ${new Date(from).toLocaleDateString('de-DE')} – ${new Date(to).toLocaleDateString('de-DE')}`,
          quantity: Number(hours.toFixed(2)),
          unit: 'h',
          unitPrice: projectRate,
          total: Number((hours * projectRate).toFixed(2)),
        };
      });
      if (items.some(it => it.unitPrice <= 0)) {
        setError('Mindestens ein Projekt/Kunde hat keinen Stundensatz hinterlegt.');
        return;
      }
    } else {
      const amount = parseFloat(fixedAmount.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) { setError('Pauschalpreis ungültig.'); return; }
      if (!fixedDescription.trim()) { setError('Beschreibung für Pauschalpreis fehlt.'); return; }
      items = [{
        description: fixedDescription.trim(),
        quantity: 1,
        unit: 'Pauschal',
        unitPrice: amount,
        total: amount,
      }];
    }

    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const vatRate  = issuer.smallBusiness ? 0 : issuer.vatRate;
    const vatAmount = subtotal * (vatRate / 100);
    const total    = subtotal + vatAmount;

    const invoice: Invoice = {
      id: String(Date.now()),
      number: invoiceNumber.trim(),
      customerId,
      projectId: projectId === 0 ? null : projectId,
      mode,
      periodFrom: fromTs,
      periodTo:   toTs,
      createdAt:  new Date(createdAt + 'T12:00:00').getTime(),
      dueDate:    new Date(dueDate   + 'T12:00:00').getTime(),
      items,
      entryIds: mode === 'hourly' ? matchedEntries.map(e => e.id) : [],
      subtotal: Number(subtotal.toFixed(2)),
      vatRate,
      vatAmount: Number(vatAmount.toFixed(2)),
      total: Number(total.toFixed(2)),
      notes: notes.trim(),
      paid: false,
      status: 'active',
      reminders: [],
    };

    onSave(invoice, { includeReport, includeConsent: includeConsent && !customer?.eInvoiceAccepted });
  };

  const fmtEuro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

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
            className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-divider px-6 pt-6 pb-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
                <FileText size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wide">Neue Rechnung</h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              {/* Kunde + Projekt */}
              <div className="grid grid-cols-2 gap-3">
                <CustomSelect
                  id="invCustomer"
                  label="Kunde"
                  value={customerId}
                  options={customers}
                  onChange={(v) => { setCustomerId(v as number); setProjectId(0); }}
                />
                <CustomSelect
                  id="invProject"
                  label="Projekt"
                  value={projectId}
                  options={[{ id: 0, name: 'Alle Projekte' }, ...availableProjects]}
                  onChange={(v) => setProjectId(v as number)}
                />
              </div>

              {/* Zeitraum */}
              <div className="grid grid-cols-2 gap-3">
                <DatePicker
                  label="Leistung von"
                  value={from}
                  onChange={setFrom}
                />
                <DatePicker
                  label="Leistung bis"
                  value={to}
                  onChange={setTo}
                />
              </div>

              {/* Mode */}
              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Abrechnung</label>
                <div className="flex gap-0.5 rounded-md border border-divider bg-paper p-0.5">
                  {(['hourly', 'fixed'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 cursor-pointer rounded px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                        mode === m ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {m === 'hourly' ? 'Nach Stunden' : 'Pauschalpreis'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inhalt je Modus */}
              {mode === 'hourly' ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col">
                    <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Art der Leistung (z.B. Webentwicklung)</label>
                    <input
                      type="text"
                      value={serviceType}
                      onChange={e => setServiceType(e.target.value)}
                      placeholder="Dienstleistung"
                      className="h-11 rounded-md border border-divider bg-paper px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                  </div>
                  <div className="rounded-md border border-divider bg-paper p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Vorschau</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <div className="text-sm text-muted">
                        {matchedEntries.length} {matchedEntries.length === 1 ? 'Eintrag' : 'Einträge'} · {totalHours.toFixed(2)} Std.
                      </div>
                      <div className="text-lg font-bold tabular-nums text-ink">{fmtEuro(hourlyAmount)}</div>
                    </div>
                    {rate <= 0 && (
                      <div className="mt-2 text-[11px] text-amber-400">⚠ Kunde hat keinen Stundensatz hinterlegt.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex flex-col">
                    <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Leistungsbeschreibung</label>
                    <input
                      type="text"
                      value={fixedDescription}
                      onChange={e => setFixedDescription(e.target.value)}
                      placeholder="z.B. Webseiten-Entwicklung Pauschal"
                      className="h-11 rounded-md border border-divider bg-paper px-3 text-sm font-bold text-ink placeholder:text-muted outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Pauschalpreis (€)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fixedAmount}
                      onChange={e => setFixedAmount(e.target.value)}
                      placeholder="400"
                      className="h-11 rounded-md border border-divider bg-paper px-3 text-sm font-bold tabular-nums text-ink outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}

              {/* Rechnungsmeta */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Rechnungs-Nr.</label>
                  <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                    className="h-11 rounded-md border border-divider bg-paper px-3 text-sm tabular-nums text-ink outline-none focus:border-accent font-bold" />
                </div>
                <DatePicker
                  label="Datum"
                  value={createdAt}
                  onChange={setCreatedAt}
                />
                <DatePicker
                  label="Fällig bis"
                  value={dueDate}
                  onChange={setDueDate}
                />
              </div>

              {/* Notizen */}
              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Notizen / Zusatztext</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="optional"
                  className="resize-none rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
                />
              </div>

              {/* Dokumenten-Optionen */}
              <div className="mt-6">
                <label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Dokumenten-Paket</label>
                <div className="grid grid-cols-1 gap-2">
                  <div 
                    onClick={() => setIncludeReport(!includeReport)}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                      includeReport ? 'border-blue-500/30 bg-blue-500/5' : 'border-divider bg-surface/50 hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        includeReport ? 'bg-blue-500/20 text-blue-500' : 'bg-muted/10 text-muted'
                      }`}>
                        <ClipboardList size={14} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-ink">Tätigkeitsbericht</div>
                        <div className="text-[10px] text-muted">Leistungsnachweis miterzeugen</div>
                      </div>
                    </div>
                    {/* Switch */}
                    <div className={`relative h-4.5 w-8 rounded-full transition-colors duration-200 ${includeReport ? 'bg-blue-500' : 'bg-muted/30'}`}>
                      <motion.div 
                        animate={{ x: includeReport ? 16 : 2 }}
                        initial={false}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-0.75 h-3 w-3 rounded-full bg-white shadow-sm"
                      />
                    </div>
                  </div>

                  {!customer?.eInvoiceAccepted && (
                    <div 
                      onClick={() => setIncludeConsent(!includeConsent)}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                        includeConsent ? 'border-purple-500/30 bg-purple-500/5' : 'border-divider bg-surface/50 hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                          includeConsent ? 'bg-purple-500/20 text-purple-500' : 'bg-muted/10 text-muted'
                        }`}>
                          <ShieldCheck size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-ink">E-Rechnung Einverständnis</div>
                          <div className="text-[10px] text-muted">PDF-Versand Erlaubnis</div>
                        </div>
                      </div>
                      {/* Switch */}
                      <div className={`relative h-4.5 w-8 rounded-full transition-colors duration-200 ${includeConsent ? 'bg-purple-500' : 'bg-muted/30'}`}>
                        <motion.div 
                          animate={{ x: includeConsent ? 16 : 2 }}
                          initial={false}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className="absolute top-0.75 h-3 w-3 rounded-full bg-white shadow-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {error && <div className="text-xs text-red-400">{error}</div>}
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button onClick={onCancel}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted transition-colors hover:bg-divider hover:text-ink">
                Abbrechen
              </button>
              <button onClick={save}
                className="cursor-pointer rounded-md bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:bg-accent active:scale-95">
                Erstellen & PDF
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
