import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileCode2, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import type { Attachment } from '../../types';
import { loadAttachmentBytes } from '../../utils/attachments';
import { findEInvoice, type EInvoiceFound } from '../../utils/eInvoicePdf';
import { EInvoiceView } from './EInvoiceView';

interface Props {
  open: boolean;
  attachment: Attachment | null;
  title?: string;
  onClose: () => void;
  onDelete?: () => void;
}

/**
 * Zeigt die E-Rechnung, die in einem abgelegten Beleg steckt.
 *
 * Zwei Wege führen hierher:
 *
 *   - Eine **XRechnung als reine XML-Datei**. Der PDF-Betrachter kann sie
 *     nicht anzeigen, und roh im Browser wäre sie ein Wall aus spitzen
 *     Klammern. Für diese Belege ist das hier die einzige lesbare Ansicht.
 *   - Ein **ZUGFeRD-PDF**. Dort ist das PDF die Ansicht für den Menschen —
 *     aber die Zahlen, nach denen gebucht wird, stehen im eingebetteten XML.
 *     Ob beides übereinstimmt, sieht man nur, wenn man beides ansehen kann.
 *
 * Gelesen wird bei jedem Öffnen neu aus dem Anhang, nicht aus dem Datensatz.
 * Der Anhang ist die Quelle; alles andere wäre eine zweite Wahrheit, die
 * auseinanderlaufen kann.
 */
export function EInvoiceModal({ open, attachment, title, onClose, onDelete }: Props) {
  const [gefunden, setGefunden] = useState<EInvoiceFound | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [loeschBestaetigung, setLoeschBestaetigung] = useState(false);

  useEffect(() => {
    if (!open || !attachment) {
      setGefunden(null);
      setFehler(null);
      setLoeschBestaetigung(false);
      return;
    }
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);
    setGefunden(null);

    loadAttachmentBytes(attachment.id)
      .then((bytes) => findEInvoice(bytes, attachment.filename))
      .then((treffer) => {
        if (abgebrochen) return;
        if (!treffer) {
          setFehler('In diesem Beleg steckt keine lesbare E-Rechnung.');
          return;
        }
        setGefunden(treffer);
      })
      .catch((e) => {
        if (!abgebrochen) setFehler(e?.message ?? 'Der Beleg konnte nicht gelesen werden.');
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => { abgebrochen = true; };
  }, [open, attachment]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && attachment && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 kv-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label="E-Rechnung ansehen"
          >
            <div className="flex items-center justify-between gap-3 border-b border-divider px-6 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <FileCode2 size={16} className="shrink-0 text-accent" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold uppercase tracking-wide">E-Rechnung</h3>
                  {title && <div className="truncate text-[11px] text-muted">{title}</div>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {onDelete && (
                  loeschBestaetigung ? (
                    <button
                      onClick={() => { onDelete(); onClose(); }}
                      className="kv-btn kv-btn-danger"
                    >
                      <Trash2 size={13} /> Wirklich löschen
                    </button>
                  ) : (
                    <button
                      onClick={() => setLoeschBestaetigung(true)}
                      className="kv-icon-btn"
                      aria-label="Beleg löschen"
                      title="Beleg löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  )
                )}
                <button onClick={onClose} className="kv-icon-btn" aria-label="Schließen">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              {laedt && (
                <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-muted">
                  <Loader2 size={14} className="animate-spin" /> Beleg wird entschlüsselt und gelesen…
                </div>
              )}

              {fehler && !laedt && (
                <div className="flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-[12px] text-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{fehler}</span>
                </div>
              )}

              {gefunden && !laedt && (
                <>
                  <div className="mb-3 text-[11px] text-muted">
                    {gefunden.source === 'embedded'
                      ? `Aus dem PDF gelesen — eingebettet als ${gefunden.filename}.`
                      : 'Eigenständige XML-Datei.'}
                  </div>
                  <EInvoiceView invoice={gefunden.invoice} />
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
