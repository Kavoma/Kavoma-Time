import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, Save, Trash2 } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface DetailDrawerProps {
  open: boolean;
  /** Anzeigetitel (Name der Entität). */
  title: string;
  /** Optionaler farbiger Akzent links neben dem Titel (z.B. Kunden-/Projekt-Farbe). */
  accentColor?: string;
  /** Optionaler Subtitle unter dem Titel. */
  subtitle?: ReactNode;
  /** Read-Mode-Inhalt — KPIs, Listen, Historie. */
  readContent: ReactNode;
  /** Edit-Mode-Inhalt — Formular-Felder. */
  editContent: ReactNode;
  /** Wird im Edit-Modus aufgerufen, wenn der User speichern will. Soll `true` bei Erfolg zurückgeben (schließt dann den Drawer). */
  onSave: () => boolean | void;
  /** Lösch-Aktion (optional). Wenn vorhanden, erscheint ein Lösch-Button im Edit-Modus. */
  onDelete?: () => void;
  /** Schließt den Drawer. */
  onClose: () => void;
  /** Markiert ob der Edit-Mode dirty ist — beeinflusst Confirm beim Schließen. */
  dirty?: boolean;
  /** Optionaler initialer Modus (Default: 'read'). Nützlich für „Neu anlegen" Flow. */
  initialMode?: 'read' | 'edit';
}

/**
 * Generischer Side-Drawer von rechts mit Read/Edit-Modus.
 * Wird von CustomerDetailDrawer und ProjectDetailDrawer konsumiert.
 *
 * Mechanik:
 * - Slide-In von rechts (640px breit, max 60vw)
 * - Backdrop-Click und Esc schließen (Confirm wenn dirty)
 * - Header trägt Mode-Toggle (Stift/Disketten-Icon) und Schließen-Button
 * - Body scrollt unabhängig vom Header
 */
export function DetailDrawer({
  open,
  title,
  accentColor,
  subtitle,
  readContent,
  editContent,
  onSave,
  onDelete,
  onClose,
  dirty = false,
  initialMode = 'read',
}: DetailDrawerProps) {
  const [mode, setMode] = useState<'read' | 'edit'>(initialMode);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const attemptClose = () => {
    if (mode === 'edit' && dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmClose || confirmDelete) {
          setConfirmClose(false);
          setConfirmDelete(false);
          return;
        }
        attemptClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, dirty, confirmClose, confirmDelete]);

  const handleSave = () => {
    const ok = onSave();
    if (ok !== false) setMode('read');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-x-0 top-10 bottom-0 z-50 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 kv-scrim"
            onClick={attemptClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.aside
            className="absolute right-3 top-3 bottom-3 flex w-[640px] max-w-[calc(60vw-24px)] flex-col overflow-hidden rounded-xl border border-divider bg-surface text-ink shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.25 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                {accentColor && (
                  <span
                    className="mt-1 inline-block h-6 w-1 shrink-0 rounded-full"
                    style={{ background: accentColor }}
                  />
                )}
                <div className="min-w-0">
                  <div className="truncate text-base font-bold leading-tight">{title}</div>
                  {subtitle && <div className="mt-0.5 text-[11px] text-muted">{subtitle}</div>}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {mode === 'read' && (
                  <Tooltip content="Bearbeiten" position="bottom">
                    <button
                      type="button"
                      onClick={() => setMode('edit')}
                      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-3 text-xs font-bold text-ink transition-colors hover:border-ink"
                    >
                      <Pencil size={12} /> Bearbeiten
                    </button>
                  </Tooltip>
                )}
                {mode === 'edit' && (
                  <>
                    <Tooltip content={dirty ? 'Erst speichern oder verwerfen' : 'Bearbeiten beenden'} position="bottom">
                      <button
                        type="button"
                        onClick={() => { setMode('read'); }}
                        disabled={dirty}
                        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-bold text-muted transition-colors hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Abbrechen
                      </button>
                    </Tooltip>
                    <Tooltip content="Speichern (Strg+S)" position="bottom">
                      <button
                        type="button"
                        onClick={handleSave}
                        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-ink bg-ink px-3 text-xs font-bold text-paper transition-colors hover:bg-accent hover:border-accent"
                      >
                        <Save size={12} /> Speichern
                      </button>
                    </Tooltip>
                  </>
                )}
                <Tooltip content="Schließen (Esc)" position="bottom">
                  <button
                    type="button"
                    onClick={attemptClose}
                    aria-label="Schließen"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-divider hover:text-ink"
                  >
                    <X size={16} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mode === 'read' ? readContent : editContent}
            </div>

            {/* Footer (nur Edit-Mode mit Delete-Möglichkeit) */}
            {mode === 'edit' && onDelete && (
              <div className="border-t border-divider px-5 py-3">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs font-bold text-danger transition-colors hover:border-danger-line hover:bg-danger-soft"
                  >
                    <Trash2 size={12} /> Löschen
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2">
                    <span className="text-[12px] text-danger">Unwiderruflich löschen?</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="cursor-pointer rounded-md px-2 py-1 text-xs font-bold text-muted hover:bg-divider hover:text-ink"
                      >
                        Nein
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirmDelete(false); onDelete(); }}
                        className="cursor-pointer rounded-md bg-danger-soft px-2 py-1 text-xs font-bold text-danger transition-colors hover:bg-danger-solid hover:text-ink"
                      >
                        Ja, löschen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.aside>

          {/* Confirm-Close-Modal */}
          <AnimatePresence>
            {confirmClose && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="absolute inset-0 bg-scrim" onClick={() => setConfirmClose(false)} />
                <motion.div
                  className="relative z-10 w-full max-w-sm kv-overlay p-5 text-ink"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                >
                  <div className="text-sm font-bold">Änderungen verwerfen?</div>
                  <div className="mt-2 text-[12px] text-muted">
                    Du hast Änderungen vorgenommen. Beim Schließen ohne Speichern gehen sie verloren.
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-bold text-muted hover:bg-divider hover:text-ink"
                    >
                      Weiter bearbeiten
                    </button>
                    <button
                      onClick={() => { setConfirmClose(false); onClose(); }}
                      className="cursor-pointer rounded-md bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger-solid hover:text-ink"
                    >
                      Verwerfen
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
