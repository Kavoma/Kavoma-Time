import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText, AlertTriangle } from 'lucide-react';
import { Attachment, VendorInvoice, VendorInvoiceCategory } from '../../types';
import { uploadPdf, formatFileSize } from '../../utils/attachments';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (vendor: VendorInvoice, attachment: Attachment) => void;
  nextId: number;
}

const CATEGORIES: { value: VendorInvoiceCategory; label: string }[] = [
  { value: 'hardware', label: 'Hardware' },
  { value: 'software', label: 'Software' },
  { value: 'office', label: 'Büro' },
  { value: 'travel', label: 'Reise' },
  { value: 'service', label: 'Dienstleistung' },
  { value: 'other', label: 'Sonstiges' },
];

function todayInput() {
  return new Date().toISOString().split('T')[0];
}

export function VendorInvoiceUploadModal({ open, onClose, onSave, nextId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayInput());
  const [amountGross, setAmountGross] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [category, setCategory] = useState<VendorInvoiceCategory>('other');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setVendorName('');
    setInvoiceNumber('');
    setInvoiceDate(todayInput());
    setAmountGross('');
    setVatAmount('');
    setCategory('other');
    setNote('');
    setError(null);
    setBusy(false);
    setDragging(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('Nur PDF-Dateien sind erlaubt.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const canSave =
    !!file && vendorName.trim().length > 0 && amountGross.trim().length > 0 && !busy;

  const submit = async () => {
    if (!file) return;
    const amount = parseFloat(amountGross.replace(',', '.'));
    if (Number.isNaN(amount) || amount < 0) {
      setError('Bitte einen gültigen Bruttobetrag eingeben.');
      return;
    }
    const vat = vatAmount.trim() ? parseFloat(vatAmount.replace(',', '.')) : undefined;
    if (vat !== undefined && (Number.isNaN(vat) || vat < 0)) {
      setError('Bitte einen gültigen USt-Betrag eingeben oder das Feld leer lassen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const attachment = await uploadPdf(file);
      const vendor: VendorInvoice = {
        id: nextId,
        attachmentId: attachment.id,
        vendorName: vendorName.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        invoiceDate: new Date(invoiceDate).getTime(),
        amountGross: amount,
        vatAmount: vat,
        category,
        note: note.trim() || undefined,
        createdAt: Date.now(),
      };
      onSave(vendor, attachment);
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Beleg konnte nicht gespeichert werden.');
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Eingangsrechnung hochladen"
          >
            <div className="flex items-center justify-between border-b border-divider px-6 py-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Beleg</div>
                <h3 className="mt-0.5 text-sm font-bold uppercase tracking-wide">Eingangsrechnung hochladen</h3>
              </div>
              <button
                onClick={handleClose}
                disabled={busy}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  dragging
                    ? 'border-ink bg-paper/60'
                    : file
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-divider bg-paper/40 hover:border-muted'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleChange}
                  className="hidden"
                />
                {file ? (
                  <>
                    <FileText size={28} className="text-emerald-300" />
                    <div className="text-sm font-bold">{file.name}</div>
                    <div className="text-[11px] text-muted">{formatFileSize(file.size)} · PDF</div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setFile(null); }}
                      className="mt-2 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-muted underline hover:text-ink"
                    >
                      Andere Datei wählen
                    </button>
                  </>
                ) : (
                  <>
                    <Upload size={28} className="text-muted" />
                    <div className="text-sm font-bold">PDF hierher ziehen oder klicken</div>
                    <div className="text-[11px] text-muted">Max. 15 MB · wird AES-256 verschlüsselt gespeichert</div>
                  </>
                )}
              </label>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col">
                  <label className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Lieferant *</label>
                  <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="z. B. MediaMarkt" />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Beleg-Nr.</label>
                  <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="optional" />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Beleg-Datum *</label>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Brutto (€) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountGross}
                    onChange={(e) => setAmountGross(e.target.value)}
                    placeholder="0,00"
                    className="tabular-nums"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">davon USt (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={vatAmount}
                    onChange={(e) => setVatAmount(e.target.value)}
                    placeholder="optional"
                    className="tabular-nums"
                  />
                </div>
                <div className="col-span-2 flex flex-col">
                  <label className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Kategorie</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as VendorInvoiceCategory)}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 flex flex-col">
                  <label className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Notiz</label>
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={handleClose}
                disabled={busy}
                className="cursor-pointer rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted transition-colors hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                disabled={!canSave}
                className="cursor-pointer rounded-md bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper transition-all hover:bg-paper hover:text-ink hover:ring-2 hover:ring-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-paper disabled:hover:ring-0"
              >
                {busy ? 'Verschlüssele…' : 'Beleg speichern'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
