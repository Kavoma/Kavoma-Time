import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Invoice, Issuer, Customer } from '../types';
import { buildFacturXXml, collectEInvoiceIssues } from './eInvoiceXml';
import { attachFacturX } from './zugferdPdf';

/** Steuert, ob dem PDF das ZUGFeRD-XML beigelegt wird. */
export interface EInvoiceOptions {
  /** Default true — abschaltbar über die Einstellungen. */
  embedXml?: boolean;
}

const fmtEuro = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const getAddr = (obj: any) => {
  const lines = [
    obj.street,
    obj.address2,
    `${obj.zip || ''} ${obj.city || ''}`.trim()
  ].filter(Boolean);
  if (lines.length === 0 && obj.address) return obj.address.split('\n').filter(Boolean);
  return lines;
};

export function generateInvoicePdf(invoice: Invoice, issuer: Issuer, customer: Customer, entries?: any[]): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderInvoiceOnDoc(doc, invoice, issuer, customer);
  if (entries && entries.length > 0) {
    doc.addPage();
    renderServiceReportOnDoc(doc, invoice, issuer, customer, entries);
  }
  return doc.output('blob');
}

/**
 * Rechnungs-PDF inklusive eingebettetem ZUGFeRD-XML (Profil EN 16931).
 *
 * Fällt bewusst auf das reine PDF zurück, wenn die Einbettung abgeschaltet ist
 * oder Pflicht-Stammdaten fehlen — eine E-Rechnung mit Lücken wäre für den
 * Empfänger schlimmer als gar keine.
 */
export async function generateEInvoicePdf(
  invoice: Invoice,
  issuer: Issuer,
  customer: Customer,
  entries?: any[],
  options?: EInvoiceOptions,
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderInvoiceOnDoc(doc, invoice, issuer, customer);
  if (entries && entries.length > 0) {
    doc.addPage();
    renderServiceReportOnDoc(doc, invoice, issuer, customer, entries);
  }

  const embed = options?.embedXml !== false;
  if (!embed || collectEInvoiceIssues(issuer, customer).length > 0) {
    return doc.output('blob');
  }

  try {
    const xml = buildFacturXXml(invoice, issuer, customer);
    const enriched = await attachFacturX(
      doc.output('arraybuffer'),
      xml,
      invoice.number,
      new Date(invoice.createdAt),
    );
    return new Blob([enriched as unknown as BlobPart], { type: 'application/pdf' });
  } catch (err) {
    // Lieber ein reines PDF ausliefern als gar keins — der Fehler ist im
    // Log sichtbar, die Rechnung bleibt versendbar.
    console.error('ZUGFeRD-Einbettung fehlgeschlagen, exportiere reines PDF:', err);
    return doc.output('blob');
  }
}

/** Reines Factur-X-XML ohne PDF-Hülle — für den separaten XML-Export. */
export function generateEInvoiceXml(invoice: Invoice, issuer: Issuer, customer: Customer): string {
  return buildFacturXXml(invoice, issuer, customer);
}

function renderInvoiceOnDoc(doc: jsPDF, invoice: Invoice, issuer: Issuer, customer: Customer) {
  const W = 210;
  let y = 20;

  // === Absender (oben rechts, klein) ===
  doc.setFontSize(8);
  doc.setTextColor(80);
  const senderLines = [
    issuer.name,
    ...getAddr(issuer),
    issuer.email && `E-Mail: ${issuer.email}`,
    issuer.phone && `Tel: ${issuer.phone}`,
  ].filter(Boolean) as string[];
  senderLines.forEach((line, i) => {
    doc.text(line, W - 20, y + i * 4, { align: 'right' });
  });

  // === Empfänger (links, Fenster-Position DIN 5008) ===
  y = 50;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`${issuer.name} · ${issuer.street || ''} · ${issuer.zip || ''} ${issuer.city || ''}`, 25, y);

  y = 56;
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(customer.name, 25, y);
  const addrLines = getAddr(customer);
  addrLines.forEach((line: string, i: number) => {
    doc.text(line, 25, y + 5 + i * 5);
  });
  
  // (Rest des Codes bleibt gleich...)

  // === Titel + Meta ===
  y = 95;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rechnung ${invoice.number}`, 20, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  y += 8;

  // Linke Spalte Meta
  doc.text(`Rechnungsdatum: ${fmtDate(invoice.createdAt)}`, 20, y);
  doc.text(`Fällig bis: ${fmtDate(invoice.dueDate)}`, 20, y + 5);

  y += 12;
  if (invoice.periodFrom && invoice.periodTo) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Leistungszeitraum: ${fmtDate(invoice.periodFrom)} – ${fmtDate(invoice.periodTo)}`, 20, y);
    y += 6;
  }

  // === Betreff / Kurzbeschreibung ===
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);
  doc.text('Gegenstand der Leistung: Erbringung von Dienstleistungen laut nachfolgender Aufstellung.', 20, y);

  // === Items-Tabelle ===
  y += 10;
  const rows = invoice.items.map(item => [
    item.description,
    `${item.quantity.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${item.unit}`,
    fmtEuro(item.unitPrice),
    fmtEuro(item.total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Leistung / Beschreibung', 'Menge', 'Einzelpreis', 'Gesamt']],
    body: rows,
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 30 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: 20, right: 20 },
  });

  // @ts-expect-error — autotable hängt sich an doc
  y = (doc as any).lastAutoTable.finalY + 8;

  // === Summen ===
  doc.setFontSize(9);
  const sumX = W - 20;
  doc.setTextColor(80);
  doc.text('Zwischensumme:', sumX - 50, y, { align: 'left' });
  doc.setTextColor(0);
  doc.text(fmtEuro(invoice.subtotal), sumX, y, { align: 'right' });
  y += 5;

  if (invoice.vatRate > 0) {
    doc.setTextColor(80);
    doc.text(`zzgl. ${invoice.vatRate}% USt.:`, sumX - 50, y, { align: 'left' });
    doc.setTextColor(0);
    doc.text(fmtEuro(invoice.vatAmount), sumX, y, { align: 'right' });
    y += 5;
  }

  doc.setDrawColor(200);
  doc.line(sumX - 50, y, sumX, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Gesamtbetrag:', sumX - 50, y, { align: 'left' });
  doc.text(fmtEuro(invoice.total), sumX, y, { align: 'right' });

  // === Kleinunternehmer-Hinweis ===
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80);
  if (invoice.vatRate === 0) {
    doc.text('Gemäß §19 UStG wird keine Umsatzsteuer berechnet.', 20, y);
    y += 6;
  }

  // === Notizen ===
  if (invoice.notes) {
    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(0);
    const splits = doc.splitTextToSize(invoice.notes, 170);
    doc.text(splits, 20, y);
    y += splits.length * 4 + 4;
  }

  // === Zahlungsinfo ===
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsinformationen', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.setFontSize(8);
  y += 5;
  doc.text(`Bitte überweisen Sie den Gesamtbetrag bis zum ${fmtDate(invoice.dueDate)} auf folgendes Konto:`, 20, y);
  y += 5;
  if (issuer.bank) { doc.text(`Bank: ${issuer.bank}`, 20, y); y += 4; }
  if (issuer.iban) { doc.text(`IBAN: ${issuer.iban}`, 20, y); y += 4; }
  if (issuer.bic)  { doc.text(`BIC: ${issuer.bic}`,  20, y); y += 4; }
  doc.text(`Verwendungszweck: ${invoice.number}`, 20, y);

  // === Footer (Steuernummer etc.) ===
  doc.setFontSize(7);
  doc.setTextColor(140);
  const taxParts = [
    issuer.taxId ? `Steuer-Nr.: ${issuer.taxId}` : '',
    issuer.vatId ? `USt-IdNr.: ${issuer.vatId}` : '',
  ].filter(Boolean);
  const footerLines = [
    `${issuer.name}${taxParts.length ? ` · ${taxParts.join(' · ')}` : ''}`,
    issuer.email,
  ].filter(Boolean) as string[];
  footerLines.forEach((line, i) => {
    doc.text(line, W / 2, 284 + i * 4, { align: 'center' });
  });
}

function renderServiceReportOnDoc(doc: jsPDF, invoice: Invoice, issuer: Issuer, customer: Customer, allEntries: any[]) {
  const W = 210;
  let y = 20;

  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text(issuer.name, W - 20, y, { align: 'right' });
  doc.text(`Tätigkeitsbericht zur Rechnung ${invoice.number}`, 20, y);
  
  y = 40;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Tätigkeitsbericht / Leistungsnachweis', 20, y);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 8;
  doc.text(`Kunde: ${customer.name}`, 20, y);
  doc.text(`Zeitraum: ${fmtDate(invoice.periodFrom)} – ${fmtDate(invoice.periodTo)}`, 20, y + 5);

  const relevantEntries = allEntries
    .filter(e => invoice.entryIds.includes(e.id))
    .sort((a, b) => a.startedAt - b.startedAt);

  const rows = relevantEntries.map(e => [
    fmtDate(e.startedAt),
    e.description || '(keine Beschreibung)',
    `${(e.durationSeconds / 3600).toLocaleString('de-DE', { minimumFractionDigits: 2 })} h`
  ]);

  autoTable(doc, {
    startY: y + 15,
    head: [['Datum', 'Tätigkeit / Beschreibung', 'Dauer']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 30 },
      2: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: 20, right: 20 },
  });
}

export function generateServiceReportPdf(invoice: Invoice, issuer: Issuer, customer: Customer, allEntries: any[]): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderServiceReportOnDoc(doc, invoice, issuer, customer, allEntries);
  return doc.output('blob');
}

/**
 * Phase 1.5 — Live-Preview im InvoiceCreateModal.
 * Verwendet die identische Build-Pipeline wie der finale Download,
 * gibt aber statt einem Blob eine data:application/pdf;base64-URL zurück.
 * So ist garantiert, dass Preview und Final-PDF nicht auseinanderlaufen.
 */
export function renderInvoicePreviewDataUrl(
  invoice: Invoice,
  issuer: Issuer,
  customer: Customer,
  entries?: any[],
): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderInvoiceOnDoc(doc, invoice, issuer, customer);
  if (entries && entries.length > 0) {
    doc.addPage();
    renderServiceReportOnDoc(doc, invoice, issuer, customer, entries);
  }
  return doc.output('dataurlstring');
}

export async function downloadInvoicePdf(
  invoice: Invoice,
  issuer: Issuer,
  customer: Customer,
  entries?: any[],
  options?: EInvoiceOptions,
) {
  const blob = await generateEInvoicePdf(invoice, issuer, customer, entries, options);
  saveAs(blob, `Rechnung-${invoice.number}-${customer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

/** Exportiert nur das Factur-X-XML — z. B. für Portale, die kein PDF annehmen. */
export function downloadEInvoiceXml(invoice: Invoice, issuer: Issuer, customer: Customer) {
  const xml = generateEInvoiceXml(invoice, issuer, customer);
  const blob = new Blob([xml], { type: 'application/xml' });
  saveAs(blob, `factur-x-${invoice.number.replace(/[^a-zA-Z0-9-]/g, '_')}.xml`);
}

export function downloadServiceReportPdf(invoice: Invoice, issuer: Issuer, customer: Customer, entries: any[]) {
  const blob = generateServiceReportPdf(invoice, issuer, customer, entries);
  saveAs(blob, `Taetigkeitsbericht-${invoice.number}.pdf`);
}

function saveAs(blob: Blob, filename: string) {
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
