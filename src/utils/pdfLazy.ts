/**
 * Die PDF-Werkzeuge erst laden, wenn wirklich ein Dokument entsteht.
 *
 * `jspdf` (582 kB) und `pdf-lib` (420 kB) sind zusammen knapp die Hälfte des
 * Bundles, werden aber nur gebraucht, wenn jemand eine Rechnung, Mahnung, ein
 * Angebot oder eine E-Rechnung erzeugt beziehungsweise liest. Statisch
 * eingebunden musste V8 sie bei **jedem** Programmstart parsen — auch bei dem,
 * der nur die Uhr anwerfen wollte.
 *
 * Diese Fassade hält die Aufrufstellen lesbar: Sie importieren weiter eine
 * benannte Funktion, nur eben von hier. `Parameters<…>` zieht die Signaturen
 * aus den echten Modulen, damit sie nicht doppelt gepflegt werden und beim
 * Ändern nicht auseinanderlaufen.
 *
 * **Der Preis: Alles hier ist asynchron**, auch das, was im Modul dahinter
 * synchron ist. Wer `renderInvoicePreviewDataUrl` aufruft, bekommt ein
 * Promise und muss auf verspätete Antworten gefasst sein — siehe die
 * Sequenz-Wächter in `InvoicePreviewPane` und `InvoiceDetailDrawer`.
 *
 * Tests importieren die Module weiterhin direkt; dort ist die Aufteilung
 * ohne Wert und der Umweg nur Rauschen.
 */

type InvoicePdf = typeof import('./invoicePdf');
type DunningPdf = typeof import('./dunningPdf');
type QuotePdf = typeof import('./quotePdf');
type EInvoicePdf = typeof import('./eInvoicePdf');

// Nur Typen — zur Laufzeit bleibt davon nichts übrig, es wird also nichts
// nachgeladen, bloss weil jemand einen Typ braucht.
export type { EInvoiceOptions } from './invoicePdf';
export type { EInvoiceFound, EInvoiceSource, EmbeddedXml } from './eInvoicePdf';

/* ── Rechnung ────────────────────────────────────────────────────────────── */

export async function downloadInvoicePdf(
  ...args: Parameters<InvoicePdf['downloadInvoicePdf']>
): Promise<ReturnType<InvoicePdf['downloadInvoicePdf']>> {
  return (await import('./invoicePdf')).downloadInvoicePdf(...args);
}

export async function downloadServiceReportPdf(
  ...args: Parameters<InvoicePdf['downloadServiceReportPdf']>
): Promise<ReturnType<InvoicePdf['downloadServiceReportPdf']>> {
  return (await import('./invoicePdf')).downloadServiceReportPdf(...args);
}

export async function downloadEInvoiceXml(
  ...args: Parameters<InvoicePdf['downloadEInvoiceXml']>
): Promise<ReturnType<InvoicePdf['downloadEInvoiceXml']>> {
  return (await import('./invoicePdf')).downloadEInvoiceXml(...args);
}

export async function renderInvoicePreviewDataUrl(
  ...args: Parameters<InvoicePdf['renderInvoicePreviewDataUrl']>
): Promise<ReturnType<InvoicePdf['renderInvoicePreviewDataUrl']>> {
  return (await import('./invoicePdf')).renderInvoicePreviewDataUrl(...args);
}

/* ── Mahnung ─────────────────────────────────────────────────────────────── */

export async function downloadDunningPdf(
  ...args: Parameters<DunningPdf['downloadDunningPdf']>
): Promise<ReturnType<DunningPdf['downloadDunningPdf']>> {
  return (await import('./dunningPdf')).downloadDunningPdf(...args);
}

/* ── Angebot ─────────────────────────────────────────────────────────────── */

export async function downloadQuotePdf(
  ...args: Parameters<QuotePdf['downloadQuotePdf']>
): Promise<ReturnType<QuotePdf['downloadQuotePdf']>> {
  return (await import('./quotePdf')).downloadQuotePdf(...args);
}

/* ── E-Rechnung lesen ────────────────────────────────────────────────────── */

export async function findEInvoice(
  ...args: Parameters<EInvoicePdf['findEInvoice']>
): ReturnType<EInvoicePdf['findEInvoice']> {
  return (await import('./eInvoicePdf')).findEInvoice(...args);
}

export async function findEInvoiceInFile(
  ...args: Parameters<EInvoicePdf['findEInvoiceInFile']>
): ReturnType<EInvoicePdf['findEInvoiceInFile']> {
  return (await import('./eInvoicePdf')).findEInvoiceInFile(...args);
}
