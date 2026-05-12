import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Invoice, Issuer, Customer } from '../types';

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
  const footerLines = [
    `${issuer.name}${issuer.taxId ? ` · Steuer-Nr./USt-IdNr.: ${issuer.taxId}` : ''}`,
    issuer.email,
    'Dieses Dokument ist ein PDF (Hinweis: E-Rechnungs-Pflicht ab 2025/2026 beachten).',
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
 * Erzeugt eine Einverständniserklärung für den Erhalt von PDF-Rechnungen
 */
export function generateContractPdf(issuer: Issuer, customer: Customer): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Einverständniserklärung zum elektronischen Rechnungserhalt', 20, 30);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 50;
  const text = `
Hiermit erklärt sich der Kunde:
${customer.name}
${getAddr(customer).join('\n')}

damit einverstanden, Rechnungen von:
${issuer.name}
${getAddr(issuer).join('\n')}

künftig ausschließlich in elektronischer Form (als PDF-Datei via E-Mail) zu erhalten. 
Dies geschieht im Hinblick auf die gesetzlichen Anforderungen zur E-Rechnungspflicht ab 2025/2026.

Der Kunde stellt sicher, dass der Empfang der Rechnungen unter der folgenden E-Mail-Adresse möglich ist:
${customer.email || '__________________________'}

Diese Vereinbarung gilt bis auf Widerruf.
  `.trim();

  const lines = doc.splitTextToSize(text, 170);
  doc.text(lines, 20, y);
  
  y += lines.length * 5 + 30;
  doc.text('__________________________', 20, y);
  doc.text('Ort, Datum', 20, y + 5);
  
  doc.text('__________________________', 110, y);
  doc.text('Unterschrift Kunde', 110, y + 5);

  return doc.output('blob');
}

export function downloadInvoicePdf(invoice: Invoice, issuer: Issuer, customer: Customer, entries?: any[]) {
  const blob = generateInvoicePdf(invoice, issuer, customer, entries);
  saveAs(blob, `Rechnung-${invoice.number}-${customer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

export function downloadServiceReportPdf(invoice: Invoice, issuer: Issuer, customer: Customer, entries: any[]) {
  const blob = generateServiceReportPdf(invoice, issuer, customer, entries);
  saveAs(blob, `Taetigkeitsbericht-${invoice.number}.pdf`);
}

export function downloadContractPdf(issuer: Issuer, customer: Customer) {
  const blob = generateContractPdf(issuer, customer);
  saveAs(blob, `Einverstaendnis_PDF_Rechnung_${customer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
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
