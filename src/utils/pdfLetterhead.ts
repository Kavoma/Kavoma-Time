// Der gemeinsame Briefbogen von Rechnung, Mahnung und Angebot.
//
// Herausgezogen, als das Angebot dazukam. Zwei Briefköpfe nebeneinander wären
// zwei Stellen, an denen eine geänderte Adresse eingepflegt werden müsste —
// und eine davon würde vergessen. Die Maße folgen DIN 5008 (Anschriftenfeld im
// Fenster), deshalb stehen sie hier als Konstanten und nicht verstreut im Code.

import type jsPDF from 'jspdf';
import type { Customer, Issuer } from '../types';

/** Seitenbreite A4 in Millimetern. */
export const SEITENBREITE = 210;
export const RAND = 20;

export const fmtEuro = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Anschrift aus Einzelfeldern, mit Rückfall auf das alte Freitextfeld.
 *
 * Kunden aus der Zeit vor der Aufteilung haben nur `address`; ohne den Rückfall
 * stünde bei ihnen im Anschriftenfeld nichts — und das Kuvertfenster wäre leer.
 */
export function adressZeilen(obj: {
  street?: string; address2?: string; zip?: string; city?: string; address?: string;
}): string[] {
  const lines = [
    obj.street,
    obj.address2,
    `${obj.zip || ''} ${obj.city || ''}`.trim(),
  ].filter(Boolean) as string[];
  if (lines.length === 0 && obj.address) return obj.address.split('\n').filter(Boolean);
  return lines;
}

/**
 * Absender oben rechts und Anschriftenfeld links.
 *
 * Gibt das Y zurück, ab dem der Inhalt beginnen darf.
 */
export function briefkopf(doc: jsPDF, issuer: Issuer, customer: Customer): number {
  let y = 20;

  doc.setFontSize(8);
  doc.setTextColor(80);
  const absender = [
    issuer.name,
    ...adressZeilen(issuer),
    issuer.email && `E-Mail: ${issuer.email}`,
    issuer.phone && `Tel: ${issuer.phone}`,
  ].filter(Boolean) as string[];
  absender.forEach((line, i) => {
    doc.text(line, SEITENBREITE - RAND, y + i * 4, { align: 'right' });
  });

  // Rücksendeangabe über dem Anschriftenfeld — klein und grau, wie im Kuvert.
  y = 50;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `${issuer.name} · ${issuer.street || ''} · ${issuer.zip || ''} ${issuer.city || ''}`,
    25, y,
  );

  y = 56;
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(customer.name, 25, y);
  adressZeilen(customer).forEach((line, i) => {
    doc.text(line, 25, y + 5 + i * 5);
  });

  return 95;
}

/** Steuernummer und Kontakt am Seitenfuß. */
export function briefFuss(doc: jsPDF, issuer: Issuer): void {
  doc.setFontSize(7);
  doc.setTextColor(140);
  const steuer = [
    issuer.taxId ? `Steuer-Nr.: ${issuer.taxId}` : '',
    issuer.vatId ? `USt-IdNr.: ${issuer.vatId}` : '',
  ].filter(Boolean);
  const zeilen = [
    `${issuer.name}${steuer.length ? ` · ${steuer.join(' · ')}` : ''}`,
    issuer.email,
  ].filter(Boolean) as string[];
  zeilen.forEach((line, i) => {
    doc.text(line, SEITENBREITE / 2, 284 + i * 4, { align: 'center' });
  });
}
