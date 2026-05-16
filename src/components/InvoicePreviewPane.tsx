import { useEffect, useRef, useState } from 'react';
import { RefreshCw, FileWarning } from 'lucide-react';
import type { Invoice, Issuer, Customer, TimeEntry } from '../types';
import { renderInvoicePreviewDataUrl } from '../utils/invoicePdf';

interface Props {
  invoice: Invoice | null;
  issuer: Issuer;
  customer: Customer | null;
  entries?: TimeEntry[];
  /** Debounce in ms, default 400. */
  debounceMs?: number;
}

/**
 * Live-Preview einer Rechnung als iframe. Render läuft debounced; bei
 * jeder Änderung der dependencies neu, frühestens nach `debounceMs`.
 * Wirft der Generator (z. B. wegen fehlender Pflichtfelder), fällt das
 * iframe weg und ein Hinweis erscheint.
 */
export function InvoicePreviewPane({ invoice, issuer, customer, entries, debounceMs = 400 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const timerRef = useRef<number | null>(null);

  const render = () => {
    if (!invoice || !customer) {
      setDataUrl(null);
      setError(null);
      return;
    }
    setIsRendering(true);
    try {
      const url = renderInvoicePreviewDataUrl(invoice, issuer, customer, entries);
      setDataUrl(url);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Vorschau konnte nicht erzeugt werden.');
    } finally {
      setIsRendering(false);
    }
  };

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(render, debounceMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, issuer, customer, entries, debounceMs]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-divider bg-paper">
      <div className="flex items-center justify-between border-b border-divider bg-surface px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          Live-Vorschau
        </div>
        <button
          type="button"
          onClick={render}
          disabled={!invoice || !customer || isRendering}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Vorschau jetzt aktualisieren"
        >
          <RefreshCw size={11} className={isRendering ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      <div className="relative flex-1 bg-black/30">
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <FileWarning size={28} className="text-amber-300" />
            <div className="text-sm font-bold text-amber-200">Vorschau nicht möglich</div>
            <div className="max-w-xs text-[11px] text-muted">{error}</div>
          </div>
        )}
        {!error && dataUrl && (
          <iframe
            src={dataUrl}
            className="h-full w-full"
            title="Rechnungs-Vorschau"
          />
        )}
        {!error && !dataUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-muted">
            <div className="h-1 w-32 overflow-hidden rounded-full bg-divider">
              <div className="h-full w-1/2 animate-pulse bg-ink/40" />
            </div>
            Vorschau wird gerendert…
          </div>
        )}
      </div>
    </div>
  );
}
