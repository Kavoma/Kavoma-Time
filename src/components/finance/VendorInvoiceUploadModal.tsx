import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText, FileCode2, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Attachment, VendorInvoice, VendorInvoiceCategory } from '../../types';
import { uploadDocument, formatFileSize, detectMime } from '../../utils/attachments';
import { findEInvoiceInFile, type EInvoiceFound } from '../../utils/pdfLazy';
import { DatePicker } from '../DatePicker';
import { EInvoiceView } from './EInvoiceView';
import { newNumericId } from '../../sync/ids';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (vendor: VendorInvoice, attachment: Attachment) => void;
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

// de-DE-Format: Punkt = Tausendertrenner, Komma = Dezimaltrenner.
// Beispiele: "1.234,56" → 1234.56; "1234,56" → 1234.56; "12.50" → 1250
// (en-US "12.50" wird hier bewusst NICHT als 12.5 interpretiert — die App ist DE.)
function parseCurrency(input: string): number {
  const normalized = input.trim().replace(/\./g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function isValidDateInput(input: string): boolean {
  if (!input) return false;
  const ts = new Date(input).getTime();
  return Number.isFinite(ts);
}

export function VendorInvoiceUploadModal({ open, onClose, onSave }: Props) {
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

  /** Gelesene E-Rechnung, falls die Datei eine enthält. */
  const [eRechnung, setERechnung] = useState<EInvoiceFound | null>(null);
  const [lese, setLese] = useState(false);
  /** Warum in einer Datei keine E-Rechnung gefunden wurde — nur bei XML relevant. */
  const [leseFehler, setLeseFehler] = useState<string | null>(null);
  const [zeigeDetails, setZeigeDetails] = useState(false);

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
    setERechnung(null);
    setLese(false);
    setLeseFehler(null);
    setZeigeDetails(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  /**
   * Nimmt die Datei an und **liest sie**, statt sie nur abzulegen.
   *
   * Steckt eine E-Rechnung darin — als eingebettetes XML in einem ZUGFeRD-PDF
   * oder als reine XRechnung —, werden die Felder daraus vorbelegt. Das ist der
   * eigentliche Gewinn: Bislang wurde jedes Feld getippt, obwohl die Zahlen in
   * der Datei schon maschinenlesbar standen.
   *
   * Vorbelegt heißt nicht festgeschrieben. Alle Felder bleiben änderbar, und
   * was der Leser beanstandet, steht sichtbar daneben.
   */
  const acceptFile = async (f: File | undefined | null) => {
    if (!f) return;
    const mime = detectMime(f);
    if (mime === null) {
      setError('Nur PDF- oder XML-Dateien sind erlaubt.');
      return;
    }
    setError(null);
    setFile(f);
    setERechnung(null);
    setLeseFehler(null);
    setZeigeDetails(false);
    setLese(true);

    try {
      const gefunden = await findEInvoiceInFile(f);
      if (gefunden) {
        setERechnung(gefunden);
        uebernehmen(gefunden);
      } else if (mime === 'application/xml') {
        // Bei einem PDF ist „keine E-Rechnung" der Normalfall und keiner
        // Meldung wert. Bei einer XML-Datei hat jemand etwas erwartet.
        setLeseFehler('In dieser XML-Datei steckt keine E-Rechnung, die Kavoma Time lesen kann.');
      }
    } catch (e) {
      setLeseFehler(e instanceof Error ? e.message : 'Die E-Rechnung konnte nicht gelesen werden.');
    } finally {
      setLese(false);
    }
  };

  /** Die gelesenen Werte in die Formularfelder. */
  const uebernehmen = ({ invoice }: EInvoiceFound) => {
    if (invoice.seller.name) setVendorName(invoice.seller.name);
    if (invoice.number) setInvoiceNumber(invoice.number);
    if (invoice.issueDate !== undefined) {
      const d = new Date(invoice.issueDate);
      const p = (n: number) => String(n).padStart(2, '0');
      setInvoiceDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    }
    // Der Zahlbetrag geht dem Bruttobetrag vor: Bei einer Anzahlung ist er das,
    // was tatsächlich fließt. Beträge werden deutsch formatiert ins Feld
    // geschrieben, damit sie zum Parser des Formulars passen.
    const brutto = invoice.duePayable ?? invoice.grandTotal;
    if (brutto !== undefined) setAmountGross(brutto.toFixed(2).replace('.', ','));

    const ust = invoice.taxTotal;
    if (ust !== undefined) setVatAmount(ust.toFixed(2).replace('.', ','));
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    void acceptFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const canSave =
    !!file && vendorName.trim().length > 0 && amountGross.trim().length > 0 && isValidDateInput(invoiceDate) && !busy;

  const submit = async () => {
    if (!file) return;
    const amount = parseCurrency(amountGross);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Bitte einen gültigen Bruttobetrag eingeben.');
      return;
    }
    let vat: number | undefined;
    if (vatAmount.trim()) {
      const parsedVat = parseCurrency(vatAmount);
      if (!Number.isFinite(parsedVat) || parsedVat < 0) {
        setError('Bitte einen gültigen USt-Betrag eingeben oder das Feld leer lassen.');
        return;
      }
      vat = parsedVat;
    }
    const invoiceDateTs = new Date(invoiceDate).getTime();
    if (!Number.isFinite(invoiceDateTs)) {
      setError('Bitte ein gültiges Beleg-Datum auswählen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Eingangsrechnungen nehmen auch XML an: Eine XRechnung kommt als reine
      // XML-Datei ohne PDF, und wer die abweist, kann die Empfangspflicht seit
      // 2025 nicht erfüllen.
      const attachment = await uploadDocument(file, ['application/pdf', 'application/xml']);
      const vendor: VendorInvoice = {
        id: newNumericId(),
        attachmentId: attachment.id,
        vendorName: vendorName.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        invoiceDate: invoiceDateTs,
        amountGross: amount,
        vatAmount: vat,
        category,
        note: note.trim() || undefined,
        createdAt: Date.now(),
        eInvoice: eRechnung
          ? {
              syntax: eRechnung.invoice.syntax,
              profileLabel: eRechnung.invoice.profileLabel,
              source: eRechnung.source,
            }
          : undefined,
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
            className="absolute inset-0 kv-scrim"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden kv-overlay text-ink"
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
                    ? 'border-success-line/40 bg-success-soft'
                    : 'border-divider bg-paper/40 hover:border-muted'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,application/xml,text/xml,.pdf,.xml"
                  onChange={handleChange}
                  className="hidden"
                />
                {file ? (
                  <>
                    {detectMime(file) === 'application/xml'
                      ? <FileCode2 size={28} className="text-success" />
                      : <FileText size={28} className="text-success" />}
                    <div className="text-sm font-bold">{file.name}</div>
                    <div className="text-[11px] text-muted">
                      {formatFileSize(file.size)} · {detectMime(file) === 'application/xml' ? 'XML' : 'PDF'}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setFile(null);
                        setERechnung(null);
                        setLeseFehler(null);
                      }}
                      className="mt-2 cursor-pointer text-xs font-bold text-muted underline hover:text-ink"
                    >
                      Andere Datei wählen
                    </button>
                  </>
                ) : (
                  <>
                    <Upload size={28} className="text-muted" />
                    <div className="text-sm font-bold">PDF oder XML hierher ziehen oder klicken</div>
                    <div className="text-[11px] text-muted">
                      Max. 15 MB · wird AES-256 verschlüsselt gespeichert
                    </div>
                    <div className="text-[11px] text-muted">
                      E-Rechnungen (ZUGFeRD, Factur-X, XRechnung) werden gelesen und füllen die Felder aus
                    </div>
                  </>
                )}
              </label>

              {lese && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[12px] text-muted">
                  <Loader2 size={13} className="animate-spin" />
                  Datei wird auf eine E-Rechnung geprüft…
                </div>
              )}

              {leseFehler && !lese && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-[12px] text-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{leseFehler} Du kannst die Felder von Hand ausfüllen — der Beleg wird trotzdem gespeichert.</span>
                </div>
              )}

              {eRechnung && !lese && (
                <div className="mt-3 rounded-md border border-success-line/40 bg-success-soft px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Sparkles size={14} className="mt-0.5 shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-ink">
                        E-Rechnung erkannt — die Felder sind ausgefüllt.
                      </div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {eRechnung.invoice.profileLabel ?? (eRechnung.invoice.syntax === 'cii' ? 'CII' : 'UBL')}
                        {eRechnung.source === 'embedded'
                          ? ` · im PDF eingebettet als ${eRechnung.filename}`
                          : ' · eigenständige XML-Datei'}
                        {'. '}
                        Prüfe die Werte, bevor du speicherst — geändert werden dürfen sie alle.
                      </div>
                      <button
                        type="button"
                        onClick={() => setZeigeDetails((v) => !v)}
                        className="mt-1.5 cursor-pointer text-[11px] font-bold text-muted underline decoration-divider hover:text-ink"
                      >
                        {zeigeDetails ? 'Rechnung ausblenden' : 'Ganze Rechnung ansehen'}
                      </button>
                    </div>
                  </div>

                  {zeigeDetails && (
                    <div className="mt-3 border-t border-divider-soft pt-3">
                      <EInvoiceView invoice={eRechnung.invoice} />
                    </div>
                  )}
                </div>
              )}

              {/* Auffälligkeiten auch ohne aufgeklappte Ansicht zeigen — sie
                  betreffen genau die Zahlen, die gleich übernommen werden. */}
              {eRechnung && !lese && !zeigeDetails && eRechnung.invoice.warnings.length > 0 && (
                <div className="mt-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5 text-warning">
                    <AlertTriangle size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Bitte nachsehen</span>
                  </div>
                  <ul className="space-y-1 text-[11px] leading-relaxed text-muted">
                    {eRechnung.invoice.warnings.map((warnung, i) => <li key={i}>{warnung}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col">
                  <label className="mb-1.5 kv-label">Lieferant *</label>
                  <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="z. B. MediaMarkt" />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1.5 kv-label">Beleg-Nr.</label>
                  <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="optional" />
                </div>
                <DatePicker label="Beleg-Datum *" value={invoiceDate} onChange={setInvoiceDate} />
                <div className="flex flex-col">
                  <label className="mb-1.5 kv-label">Brutto (€) *</label>
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
                  <label className="mb-1.5 kv-label">davon USt (€)</label>
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
                  <label className="mb-1.5 kv-label">Kategorie</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as VendorInvoiceCategory)}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 flex flex-col">
                  <label className="mb-1.5 kv-label">Notiz</label>
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[12px] text-danger">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <button
                onClick={handleClose}
                disabled={busy}
                className="kv-btn kv-btn-quiet"
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                disabled={!canSave}
                className="kv-btn kv-btn-primary"
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
