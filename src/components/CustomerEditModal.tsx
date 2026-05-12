import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, ShieldCheck, Download, Pipette } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { Customer } from '../types';
import { downloadContractPdf } from '../utils/invoicePdf';
import { useAppState } from '../state/AppStateContext';

const PALETTE = [
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
  '#64748b'  // Slate
];

interface Props {
  open: boolean;
  customer: Customer | null; // null means create new
  onSave: (c: Omit<Customer, 'id'> & { id?: number }) => void;
  onCancel: () => void;
}

export function CustomerEditModal({ open, customer, onSave, onCancel }: Props) {
  const { state } = useAppState();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [rate, setRate] = useState<string>('');
  const [street, setStreet]     = useState('');
  const [address2, setAddress2] = useState('');
  const [zip, setZip]           = useState('');
  const [city, setCity]         = useState('');
  const [email, setEmail]       = useState('');
  const [debtorNumber, setDebtorNumber] = useState('');
  const [eInvoiceAccepted, setEInvoiceAccepted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setColor(customer.color);
      setRate(customer.hourlyRate ? String(customer.hourlyRate) : '');
      setStreet(customer.street ?? '');
      setAddress2(customer.address2 ?? '');
      setZip(customer.zip ?? '');
      setCity(customer.city ?? '');
      setEmail(customer.email ?? '');
      setDebtorNumber(customer.debtorNumber ?? '');
      setEInvoiceAccepted(customer.eInvoiceAccepted ?? false);
    } else {
      setName('');
      setColor(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      setRate('');
      setStreet('');
      setAddress2('');
      setZip('');
      setCity('');
      setEmail('');
      setDebtorNumber(state ? String(state.nextDebtorNumber) : '');
      setEInvoiceAccepted(false);
    }
  }, [customer, open]);

  const save = () => {
    if (!name.trim()) return;
    const parsedRate = parseFloat(rate.replace(',', '.'));
    onSave({
      ...(customer || {}),
      name: name.trim(),
      color,
      hourlyRate: !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : undefined,
      street: street.trim() || undefined,
      address2: address2.trim() || undefined,
      zip: zip.trim() || undefined,
      city: city.trim() || undefined,
      email: email.trim() || undefined,
      debtorNumber: debtorNumber.trim() || undefined,
      eInvoiceAccepted,
    });
  };

  const downloadTemplate = () => {
    if (!state || !customer) return;
    downloadContractPdf(state.issuer, customer);
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
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {customer ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}
              </h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto max-h-[70vh]">
              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  autoFocus
                  placeholder="Kundenname..."
                  className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Debitoren-Nr. (z.B. 10001)</label>
                <input
                  type="text"
                  value={debtorNumber}
                  onChange={(e) => setDebtorNumber(e.target.value)}
                  placeholder="10001"
                  className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Straße & Hausnummer</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Musterstraße 12"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Adresszusatz (optional)</label>
                  <input
                    type="text"
                    value={address2}
                    onChange={(e) => setAddress2(e.target.value)}
                    placeholder="z.B. 2. OG / c/o"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">PLZ</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="12345"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm tabular-nums text-ink outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Stadt</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Musterstadt"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">E-Mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rechnung@firma.de"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Stundensatz (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                    placeholder="z.B. 80"
                    className="rounded-md border border-divider bg-paper px-3 py-2.5 text-sm tabular-nums text-ink outline-none focus:border-accent"
                  />
                </div>
              </div>


              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">E-Rechnung Status</label>
                <div className="flex items-center gap-2">
                  <div
                    onClick={() => setEInvoiceAccepted(!eInvoiceAccepted)}
                    className={`flex flex-1 cursor-pointer items-center justify-between rounded-md border p-3 transition-all ${eInvoiceAccepted ? 'border-green-500/30 bg-green-500/5' : 'border-divider bg-paper hover:border-accent/50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${eInvoiceAccepted ? 'bg-green-500/20 text-green-500' : 'bg-muted/10 text-muted'
                        }`}>
                        <ShieldCheck size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-ink">Einverständnis liegt vor</div>
                        <div className="text-[10px] text-muted">Gesetzliche PDF-Rechnungserlaubnis</div>
                      </div>
                    </div>

                    {/* Custom Toggle Switch */}
                    <div className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${eInvoiceAccepted ? 'bg-green-500' : 'bg-muted/30'}`}>
                      <motion.div
                        animate={{ x: eInvoiceAccepted ? 18 : 2 }}
                        initial={false}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm"
                      />
                    </div>
                  </div>

                  {customer && (
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      title="Vertragsvorlage herunterladen"
                      className="flex h-[54px] w-[54px] cursor-pointer items-center justify-center rounded-md border border-divider bg-paper text-muted transition-all hover:border-ink hover:text-ink active:scale-95"
                    >
                      <Download size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Farbe</label>
                
                <div className="flex flex-wrap gap-2.5">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setColor(c); setShowPicker(false); }}
                      style={{ background: c }}
                      className={`size-8 cursor-pointer rounded-full transition-all active:scale-90 ${color.toLowerCase() === c.toLowerCase() ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100 hover:scale-105'}`}
                    />
                  ))}
                  
                  {/* Custom Color Button / Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPicker(!showPicker)}
                    style={{ background: !PALETTE.some(c => c.toLowerCase() === color.toLowerCase()) ? color : undefined }}
                    className={`flex size-8 cursor-pointer items-center justify-center rounded-full border border-divider transition-all active:scale-90 
                      ${!PALETTE.some(c => c.toLowerCase() === color.toLowerCase()) 
                        ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface border-transparent' 
                        : showPicker ? 'bg-ink text-paper border-ink' : 'bg-paper text-muted hover:border-ink hover:text-ink'
                      }`}
                    title="Eigene Farbe wählen"
                  >
                    <Pipette size={14} className={!PALETTE.some(c => c.toLowerCase() === color.toLowerCase()) ? 'hidden' : ''} />
                    {!PALETTE.some(c => c.toLowerCase() === color.toLowerCase()) && (
                      <div className="size-1.5 rounded-full bg-white shadow-sm ring-1 ring-black/10" />
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {showPicker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-4 flex flex-col gap-4 overflow-hidden rounded-lg bg-paper p-4 border border-divider"
                    >
                      <div className="custom-color-picker flex justify-center">
                        <HexColorPicker color={color} onChange={setColor} />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="size-8 shrink-0 rounded-md border border-divider shadow-sm" style={{ background: color }} />
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted">#</span>
                          <input
                            type="text"
                            value={color.replace('#', '')}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              if (val.length <= 6) setColor(`#${val}`);
                            }}
                            className="w-full rounded-md border border-divider bg-surface py-2 pl-6 pr-3 text-xs font-bold tabular-nums text-ink outline-none focus:border-accent"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
                {customer ? 'Speichern' : 'Hinzufügen'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
