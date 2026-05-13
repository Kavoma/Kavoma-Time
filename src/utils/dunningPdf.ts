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

export function downloadDunningPdf(invoice: Invoice, issuer: Issuer, customer: Customer) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  let y = 20;

  const latestReminder = invoice.reminders[invoice.reminders.length - 1];
  if (!latestReminder) return;

  const titleMap = {
    1: 'Zahlungserinnerung',
    2: '1. Mahnung',
    3: '2. Mahnung (Letzte)'
  };
  const title = titleMap[latestReminder.level] || `Zahlungs- / Mahnstufe unbekannt (Level ${latestReminder.level})`;

  // === Absender (oben rechts) ===
  doc.setFontSize(8);
  doc.setTextColor(80);
  const senderLines = [
    issuer.name,
    ...getAddr(issuer),
    issuer.email && `E-Mail: ${issuer.email}`,
  ].filter(Boolean) as string[];
  senderLines.forEach((line, i) => {
    doc.text(line, W - 20, y + i * 4, { align: 'right' });
  });

  // === Empfänger ===
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

  // === Titel ===
  y = 95;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 20, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  y += 8;
  doc.text(`Datum: ${fmtDate(latestReminder.sentAt)}`, 20, y);
  doc.text(`Bezug: Rechnung Nr. ${invoice.number} vom ${fmtDate(invoice.createdAt)}`, 20, y + 5);

  // === Text ===
  y += 15;
  doc.setFontSize(10);
  doc.setTextColor(0);
  let introText = '';
  if (latestReminder.level === 1) {
    introText = 'Sicherlich ist es Ihnen entgangen, dass die oben genannte Rechnung noch nicht beglichen wurde. Wir bitten Sie freundlich, den offenen Betrag zeitnah zu überweisen.';
  } else if (latestReminder.level === 2) {
    introText = 'Trotz unserer Zahlungserinnerung konnten wir bisher keinen Zahlungseingang feststellen. Wir fordern Sie hiermit förmlich auf, die ausstehende Gesamtforderung zu begleichen.';
  } else {
    introText = 'Da unsere bisherigen Mahnungen unbeantwortet blieben, ist dies unsere letzte Aufforderung vor Einleitung weiterer rechtlicher Schritte. Wir fordern Sie letztmalig zur Zahlung auf.';
  }
  
  const splits = doc.splitTextToSize(introText, 170);
  doc.text(splits, 20, y);
  y += splits.length * 5 + 5;

  // === Aufstellung ===
  const previousFees = invoice.reminders.slice(0, -1).reduce((s, r) => s + r.fee, 0);
  const feeLabel = latestReminder.level === 1 ? 'Bearbeitungsgebühr' : 'Mahngebühr';
  
  const rows = [
    ['Offener Rechnungsbetrag', fmtEuro(invoice.total)],
    previousFees > 0 ? ['Bisherige Gebühren', fmtEuro(previousFees)] : null,
    latestReminder.fee > 0 ? [`Aktuelle ${feeLabel}`, fmtEuro(latestReminder.fee)] : null,
  ].filter(Boolean) as any[];

  autoTable(doc, {
    startY: y,
    head: [['Posten', 'Betrag']],
    body: rows,
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 30 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { halign: 'right', cellWidth: 40 },
    },
    margin: { left: 20, right: 20 },
  });

  // @ts-expect-error
  y = doc.lastAutoTable.finalY + 10;

  // === Gesamt ===
  const sumX = W - 20;
  const totalOutstanding = invoice.total + previousFees + latestReminder.fee;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Gesamtforderung:', sumX - 60, y, { align: 'left' });
  doc.text(fmtEuro(totalOutstanding), sumX, y, { align: 'right' });

  // === Zahlungsinfo ===
  y += 15;
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsinformationen', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.setFontSize(8);
  y += 5;
  doc.text(`Bitte überweisen Sie den Gesamtbetrag bis zum ${fmtDate(latestReminder.newDueDate)} auf folgendes Konto:`, 20, y);
  y += 5;
  if (issuer.bank) { doc.text(`Bank: ${issuer.bank}`, 20, y); y += 4; }
  if (issuer.iban) { doc.text(`IBAN: ${issuer.iban}`, 20, y); y += 4; }
  if (issuer.bic)  { doc.text(`BIC: ${issuer.bic}`,  20, y); y += 4; }
  doc.text(`Verwendungszweck: ${invoice.number}`, 20, y);

  // === Rechtliches ===
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(80);
  const legalNotice = [
    'Rechtliche Hinweise:',
    `1. Mit Ablauf der ursprünglichen Frist befinden Sie sich gemäß § 286 BGB im Verzug.`,
    '2. Pauschalen für den Zahlungsverzug sind nach § 288 Abs. 5 BGB bzw. als Schadensersatz umsatzsteuerfrei.',
    '3. Sollte die Zahlung bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos.'
  ];
  legalNotice.forEach((line, i) => {
    doc.text(line, 20, y + i * 4);
  });

  // === Footer ===
  doc.setFontSize(7);
  doc.setTextColor(140);
  const footerLines = [
    `${issuer.name}${issuer.taxId ? ` · Steuer-Nr./USt-IdNr.: ${issuer.taxId}` : ''}`,
    issuer.email && `E-Mail: ${issuer.email}`,
    'Datenschutzhinweis: Ihre Daten werden ausschließlich zum Zwecke des Forderungseinzugs verarbeitet.',
  ].filter(Boolean) as string[];
  footerLines.forEach((line, i) => {
    doc.text(line, W / 2, 284 + i * 4, { align: 'center' });
  });

  // Save
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}-${invoice.number}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
