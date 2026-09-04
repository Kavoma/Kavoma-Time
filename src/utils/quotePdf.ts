// Das Angebots-PDF.
//
// Es teilt sich mit der Rechnung den Briefbogen (`pdfLetterhead.ts`) und den
// Positionsblock, unterscheidet sich aber im Schluss — und zwar an der Stelle,
// die zählt: Wo die Rechnung Kontodaten nennt und zur Zahlung auffordert,
// nennt das Angebot seine **Gültigkeit** und bittet um Rückmeldung.
//
// **Kein ZUGFeRD.** Das eingebettete XML beschreibt eine Rechnung; ein Angebot
// ist keine. (Für Aufträge gäbe es Order-X — ein eigenes Vorhaben, und ohne
// Empfänger, der es liest, ohne Nutzen.)

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Customer, Issuer, Quote } from '../types';
import { RAND, SEITENBREITE, briefFuss, briefkopf, fmtDate, fmtEuro } from './pdfLetterhead';
import { PDF_FONT, registriereSchrift } from './pdfFonts';

export function generateQuotePdf(quote: Quote, issuer: Issuer, customer: Customer): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registriereSchrift(doc);
  renderQuoteOnDoc(doc, quote, issuer, customer);
  return doc.output('blob');
}

function renderQuoteOnDoc(doc: jsPDF, quote: Quote, issuer: Issuer, customer: Customer): void {
  const W = SEITENBREITE;
  let y = briefkopf(doc, issuer, customer);

  // === Titel + Kopfangaben ===
  doc.setFontSize(18);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(`Angebot ${quote.number}`, RAND, y);

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  y += 8;
  doc.text(`Angebotsdatum: ${fmtDate(quote.createdAt)}`, RAND, y);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(`Gültig bis: ${fmtDate(quote.validUntil)}`, RAND, y + 5);

  y += 17;
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(40);
  doc.text(
    'gerne unterbreiten wir Ihnen folgendes Angebot über die nachstehenden Leistungen.',
    RAND, y,
  );

  // === Positionen ===
  y += 10;
  autoTable(doc, {
    startY: y,
    head: [['Leistung / Beschreibung', 'Menge', 'Einzelpreis', 'Gesamt']],
    body: quote.items.map((item) => [
      item.description,
      `${item.quantity.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${item.unit}`,
      fmtEuro(item.unitPrice),
      fmtEuro(item.total),
    ]),
    theme: 'plain',
    // Ohne diese Angabe setzt jspdf-autotable für seine Zellen die
    // eingebaute Helvetica — und damit stünde eine nicht eingebettete
    // Standardschrift im Dokument, die PDF/A sofort durchfallen lässt.
    styles: { font: PDF_FONT },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 30 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: RAND, right: RAND },
  });

  // `lastAutoTable` hängt das Plugin zur Laufzeit an — in den Typen steht es
  // nicht. Derselbe Kniff wie im Rechnungs-PDF.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // === Summen ===
  doc.setFontSize(9);
  const sumX = W - RAND;
  doc.setTextColor(80);
  doc.text('Zwischensumme:', sumX - 50, y, { align: 'left' });
  doc.setTextColor(0);
  doc.text(fmtEuro(quote.subtotal), sumX, y, { align: 'right' });
  y += 5;

  if (quote.vatRate > 0) {
    doc.setTextColor(80);
    doc.text(`zzgl. ${quote.vatRate}% USt.:`, sumX - 50, y, { align: 'left' });
    doc.setTextColor(0);
    doc.text(fmtEuro(quote.vatAmount), sumX, y, { align: 'right' });
    y += 5;
  }

  doc.setDrawColor(200);
  doc.line(sumX - 50, y, sumX, y);
  y += 5;
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(11);
  doc.text('Angebotssumme:', sumX - 50, y, { align: 'left' });
  doc.text(fmtEuro(quote.total), sumX, y, { align: 'right' });

  y += 12;
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80);
  if (quote.vatRate === 0) {
    doc.text('Gemäß §19 UStG wird keine Umsatzsteuer berechnet.', RAND, y);
    y += 6;
  }

  // === Freitext ===
  if (quote.notes) {
    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(0);
    const splits = doc.splitTextToSize(quote.notes, 170);
    doc.text(splits, RAND, y);
    y += splits.length * 4 + 4;
  }

  // === Schluss ===
  //
  // Hier steht bei der Rechnung die Kontoverbindung. Ein Angebot fordert kein
  // Geld — es nennt seine Frist und bittet um Antwort. Die Kontodaten wären
  // an dieser Stelle nicht nur überflüssig, sondern missverständlich.
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('Gültigkeit und Annahme', RAND, y);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(80);
  doc.setFontSize(8);
  y += 5;
  doc.text(
    `Dieses Angebot ist freibleibend und gilt bis zum ${fmtDate(quote.validUntil)}.`,
    RAND, y,
  );
  y += 4;
  doc.text(
    'Für eine Beauftragung genügt eine formlose Rückmeldung unter Angabe der Angebotsnummer.',
    RAND, y,
  );
  y += 4;
  doc.text('Alle Preise verstehen sich in Euro.', RAND, y);

  briefFuss(doc, issuer);
}

export function downloadQuotePdf(quote: Quote, issuer: Issuer, customer: Customer): void {
  const blob = generateQuotePdf(quote, issuer, customer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Angebot_${quote.number}_${customer.name.replace(/[^\w-]+/g, '_')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Vorschau als Data-URL — dasselbe Muster wie bei der Rechnung. */
export function renderQuotePreviewDataUrl(
  quote: Quote, issuer: Issuer, customer: Customer,
): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registriereSchrift(doc);
  renderQuoteOnDoc(doc, quote, issuer, customer);
  return doc.output('dataurlstring');
}
