import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Trash2, AlertTriangle, ZoomIn, ZoomOut, Maximize2, Printer, ExternalLink, ShieldCheck } from 'lucide-react';
import { loadPdfBlob, formatFileSize } from '../../utils/attachments';
import { Attachment } from '../../types';
import { InfoTooltip } from '../settings/InfoTooltip';

interface PdfViewerModalProps {
  open: boolean;
  attachment: Attachment | null;
  title?: string;
  onClose: () => void;
  onDelete?: () => void;
}

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;
const FIT_WIDTH = 'fit-width' as const;

type ZoomValue = number | typeof FIT_WIDTH;

/** PDF.js (Chrome PDF Plugin) Fragment-Parameter. Quelle: PDF Open Parameters Spec. */
function buildPdfUrl(blobUrl: string, zoom: ZoomValue): string {
  // toolbar=0  — native Toolbar (Download/Print/Sidebar) ausblenden
  // navpanes=0 — Thumbnail-Sidebar ausblenden
  // view=FitH  — initial auf Breite passend
  const base = `${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`;
  if (zoom === FIT_WIDTH) return `${base}&view=FitH`;
  return `${base}&zoom=${zoom}`;
}

export function PdfViewerModal({ open, attachment, title, onClose, onDelete }: PdfViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** null = noch nicht geprüft. false = wird gerade aus der Cloud geholt. */
  const [lokalVorhanden, setLokalVorhanden] = useState<boolean | null>(null);
  const [zoom, setZoom] = useState<ZoomValue>(FIT_WIDTH);
  // Wird debounced gesetzt, damit nicht jeder Zoom-Click den iframe sofort neu lädt
  const [debouncedZoom, setDebouncedZoom] = useState<ZoomValue>(FIT_WIDTH);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // PDF entschlüsseln & Blob-URL aufbauen
  useEffect(() => {
    if (!open || !attachment) {
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setError(null);
      setConfirmDelete(false);
      return;
    }
    let cancelled = false;
    setError(null);
    setLokalVorhanden(null);
    setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });

    // Vorab fragen, damit die Wartemeldung die Wahrheit sagt: Entschlüsseln
    // dauert Millisekunden, ein Beleg aus der Cloud kann Sekunden brauchen.
    window.api?.attachmentHas?.(attachment.id)
      .then((da) => { if (!cancelled) setLokalVorhanden(da); })
      .catch(() => { if (!cancelled) setLokalVorhanden(true); });

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
    return () => { cancelled = true; };
  }, [open, attachment]);

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  // Zoom debouncen — verhindert iframe-Reload-Flackern bei schnellen +/-/0-Klicks
  useEffect(() => {
    const t = setTimeout(() => setDebouncedZoom(zoom), 120);
    return () => clearTimeout(t);
  }, [zoom]);

  const zoomIn = () => {
    setZoom((curr) => {
      const currentNumeric = typeof curr === 'number' ? curr : 100;
      const next = ZOOM_STEPS.find((s) => s > currentNumeric);
      return next ?? currentNumeric;
    });
  };
  const zoomOut = () => {
    setZoom((curr) => {
      const currentNumeric = typeof curr === 'number' ? curr : 100;
      const next = [...ZOOM_STEPS].reverse().find((s) => s < currentNumeric);
      return next ?? currentNumeric;
    });
  };

  // Tastatur: Esc schließt, +/-/0 zoomen
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Zoom-Shortcuts nur, wenn der Fokus nicht in einem Input/Textarea liegt
      const target = e.target as HTMLElement | null;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (inField) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
      else if (e.key === '0') { e.preventDefault(); setZoom(FIT_WIDTH); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zoom]);

  // Beim Öffnen/Attachment-Wechsel zurück auf Fit-Width
  useEffect(() => {
    setZoom(FIT_WIDTH);
  }, [open, attachment]);

  const handleDownload = () => {
    if (!blobUrl || !attachment) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = attachment.filename;
    a.click();
  };

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error('Drucken nicht möglich:', e);
    }
  };

  const handleOpenInBrowser = () => {
    if (!blobUrl) return;
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  const zoomLabel = zoom === FIT_WIDTH ? 'Auto' : `${zoom}%`;
  // Im Auto-Modus verhalten sich zoomIn/zoomOut so, als stünde der Zoom auf 100 % —
  // die Buttons müssen daher auch dort aktiv bleiben.
  const effectiveZoom = typeof zoom === 'number' ? zoom : 100;
  const canZoomOut = effectiveZoom > ZOOM_STEPS[0];
  const canZoomIn = effectiveZoom < ZOOM_STEPS[ZOOM_STEPS.length - 1];

  // Die finale Viewer-URL — nutzt den debounced Zoom, damit der iframe nur ruhig reagiert
  const viewerSrc = useMemo(
    () => (blobUrl ? buildPdfUrl(blobUrl, debouncedZoom) : null),
    [blobUrl, debouncedZoom],
  );

  return (
    <AnimatePresence>
      {open && attachment && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 flex h-[95vh] w-[95vw] max-w-[1600px] flex-col overflow-hidden kv-overlay text-ink"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? attachment.filename}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-bold">{title ?? attachment.filename}</div>
                <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted">
                  {formatFileSize(attachment.sizeBytes)}
                </span>
                <InfoTooltip ariaLabel="Datei-Details" position="bottom">
                  <div className="mb-1 flex items-center gap-1.5 font-bold">
                    <ShieldCheck size={13} className="text-success" />
                    Verschlüsselt gespeichert
                  </div>
                  <div className="text-muted">Dateiname: <span className="text-ink">{attachment.filename}</span></div>
                  <div className="text-muted">Größe: <span className="text-ink">{formatFileSize(attachment.sizeBytes)}</span></div>
                  <div className="mt-1 text-muted">SHA-256:</div>
                  <div className="select-text break-all font-mono text-[10px] text-ink">{attachment.sha256}</div>
                </InfoTooltip>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {/* Zoom-Stepper */}
                <div className="mr-1 flex items-center gap-0.5 rounded-md border border-divider bg-paper/60 px-1 py-0.5">
                  <button
                    onClick={zoomOut}
                    disabled={!canZoomOut}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    title="Verkleinern (−)"
                    aria-label="Verkleinern"
                  >
                    <ZoomOut size={12} />
                  </button>
                  <span className="min-w-[3rem] text-center text-[10px] font-bold tabular-nums text-muted">{zoomLabel}</span>
                  <button
                    onClick={zoomIn}
                    disabled={!canZoomIn}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    title="Vergrößern (+)"
                    aria-label="Vergrößern"
                  >
                    <ZoomIn size={12} />
                  </button>
                  <button
                    onClick={() => setZoom(FIT_WIDTH)}
                    disabled={zoom === FIT_WIDTH}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    title="Auf Breite anpassen (0)"
                    aria-label="Auf Breite anpassen"
                  >
                    <Maximize2 size={11} />
                  </button>
                </div>

                <button
                  onClick={handlePrint}
                  disabled={!blobUrl}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-divider bg-paper text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                  title="Drucken"
                  aria-label="Drucken"
                >
                  <Printer size={12} />
                </button>
                <button
                  onClick={handleOpenInBrowser}
                  disabled={!blobUrl}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-divider bg-paper text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                  title="In neuem Fenster öffnen"
                  aria-label="In neuem Fenster öffnen"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!blobUrl}
                  className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                  title="Original-PDF herunterladen"
                >
                  <Download size={12} /> Herunterladen
                </button>

                {/* Trenner */}
                <div className="mx-1 h-5 w-px bg-divider" />

                {onDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-danger-line bg-danger-soft text-danger transition-all hover:border-danger-line hover:bg-danger-soft"
                    title="Beleg löschen"
                    aria-label="Beleg löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-divider hover:text-ink"
                  aria-label="Schließen (Esc)"
                  title="Schließen (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Viewer */}
            <div className="relative flex-1 overflow-hidden bg-scrim">
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <AlertTriangle size={28} className="text-danger" />
                  <div className="text-sm font-bold">PDF konnte nicht geladen werden</div>
                  <div className="max-w-md text-[12px] text-muted">{error}</div>
                  {lokalVorhanden === false && (
                    <div className="max-w-md text-[12px] text-muted">
                      Dieser Beleg wurde auf einem anderen Gerät angelegt und liegt hier noch
                      nicht. Mit Verbindung wird er beim Öffnen nachgeladen.
                    </div>
                  )}
                </div>
              )}
              {!error && viewerSrc && (
                <iframe
                  ref={iframeRef}
                  // Key auf den Hash-Anteil, damit der iframe nur dann neu lädt, wenn sich
                  // der Zoom-Modus tatsächlich ändert — nicht z. B. wenn nur der Modal-State zappt.
                  key={viewerSrc}
                  src={viewerSrc}
                  className="h-full w-full border-0"
                  title={attachment.filename}
                />
              )}
              {!error && !viewerSrc && (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="w-full max-w-md space-y-3">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-divider" />
                    <div className="h-3 w-full animate-pulse rounded bg-divider" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-divider" />
                    <div className="h-32 w-full animate-pulse rounded bg-divider/60" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-divider" />
                    <div className="h-3 w-full animate-pulse rounded bg-divider" />
                    <div className="mt-4 text-center text-[10px] uppercase tracking-widest text-muted">
                      {lokalVorhanden === false ? 'Beleg wird geladen…' : 'PDF wird entschlüsselt…'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Delete-Confirm */}
            {confirmDelete && onDelete && (
              <div className="border-t border-danger-line bg-danger-soft px-5 py-3">
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
                      className="cursor-pointer rounded-md bg-danger-soft px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-danger transition-all hover:bg-danger-solid hover:text-ink"
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
