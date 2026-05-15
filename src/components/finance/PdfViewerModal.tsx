import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Trash2, AlertTriangle } from 'lucide-react';
import { loadPdfBlob } from '../../utils/attachments';
import { Attachment } from '../../types';
import { formatFileSize } from '../../utils/attachments';

interface PdfViewerModalProps {
  open: boolean;
  attachment: Attachment | null;
  title?: string;
  onClose: () => void;
  onDelete?: () => void;
}

export function PdfViewerModal({ open, attachment, title, onClose, onDelete }: PdfViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !attachment) {
      setBlobUrl(null);
      setError(null);
      setConfirmDelete(false);
      return;
    }
    let cancelled = false;
    setError(null);
    loadPdfBlob(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? 'PDF konnte nicht geladen werden.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, attachment]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDownload = () => {
    if (!blobUrl || !attachment) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = attachment.filename;
    a.click();
  };

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
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.7)]"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? attachment.filename}
          >
            <div className="flex items-center justify-between border-b border-divider px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{title ?? attachment.filename}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted">
                  {attachment.filename} · {formatFileSize(attachment.sizeBytes)} · SHA-256{' '}
                  <span className="font-mono">{attachment.sha256.slice(0, 12)}…</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={!blobUrl}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-divider bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                  title="Original-PDF herunterladen"
                >
                  <Download size={13} /> Download
                </button>
                {onDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-red-300 transition-all hover:border-red-400 hover:bg-red-500/20"
                    title="Beleg löschen"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-divider hover:text-ink"
                  aria-label="Schließen"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="relative flex-1 bg-black/40">
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <AlertTriangle size={28} className="text-red-300" />
                  <div className="text-sm font-bold">PDF konnte nicht geladen werden</div>
                  <div className="max-w-md text-[12px] text-muted">{error}</div>
                </div>
              )}
              {!error && blobUrl && (
                <iframe
                  src={blobUrl}
                  className="h-full w-full"
                  title={attachment.filename}
                />
              )}
              {!error && !blobUrl && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] uppercase tracking-widest text-muted">
                  PDF wird entschlüsselt…
                </div>
              )}
            </div>

            {confirmDelete && onDelete && (
              <div className="border-t border-red-500/30 bg-red-500/5 px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[12px] text-muted">
                    Diesen Beleg unwiderruflich löschen? Die verschlüsselte Datei wird entfernt.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted hover:bg-divider hover:text-ink"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(false); onDelete(); }}
                      className="cursor-pointer rounded-md bg-red-500/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-red-300 transition-all hover:bg-red-500 hover:text-white"
                    >
                      Endgültig löschen
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
