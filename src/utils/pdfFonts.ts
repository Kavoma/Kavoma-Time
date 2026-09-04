// Eingebettete Schrift für alle erzeugten PDFs.
//
// PDF/A verlangt, dass **jede** benutzte Schrift im Dokument steckt. jsPDF
// benutzt ohne Zutun Helvetica — eine der vierzehn Standardschriften, die ein
// PDF nicht mitliefern muss, weil der Betrachter sie schon haben soll. Genau
// das ist für die Archivierung untauglich: In zehn Jahren hat sie vielleicht
// niemand mehr, und das Dokument sieht anders aus als beim Schreiben.
//
// **Warum Liberation Sans.** Sie ist metrisch kompatibel zu Arial und damit
// praktisch auch zu Helvetica: gleiche Zeichenbreiten, gleiche Zeilenlängen.
// Das Layout der Rechnung wurde gegen Helvetica-Masse gebaut — mit einer
// beliebigen anderen freien Schrift wären Spalten und Summen verrutscht, und
// jede Rechnung hätte anders ausgesehen als die vom Vortag. SIL OFL 1.1,
// Lizenztext unter `src/assets/fonts/`.

import type jsPDF from 'jspdf';
import { LIBERATION_SANS_REGULAR } from './fonts/liberationSansRegular';
import { LIBERATION_SANS_BOLD } from './fonts/liberationSansBold';

/**
 * Der Familienname, unter dem die Schrift bei jsPDF liegt.
 *
 * Bewusst **nicht** `helvetica`: Unter dem Namen kennt jsPDF bereits seine
 * eingebaute Standardschrift, und ein `setFont('helvetica')` griffe je nach
 * Reihenfolge auf die falsche zu. Ein eigener Name macht den Unterschied
 * sichtbar — wer im Dokument `helvetica` liest, weiss, dass dort noch die
 * nicht eingebettete Fassung benutzt wird.
 */
export const PDF_FONT = 'LiberationSans';

const DATEIEN = [
  { datei: 'LiberationSans-Regular.ttf', stil: 'normal', daten: LIBERATION_SANS_REGULAR },
  { datei: 'LiberationSans-Bold.ttf', stil: 'bold', daten: LIBERATION_SANS_BOLD },
] as const;

/**
 * Meldet die Schrift an einem frischen Dokument an und stellt sie ein.
 *
 * Muss **vor** der ersten Textausgabe laufen. jsPDF hält die Dateiablage pro
 * Dokument, deshalb kann das nicht einmalig beim Programmstart passieren.
 */
export function registriereSchrift(doc: jsPDF): void {
  for (const f of DATEIEN) {
    doc.addFileToVFS(f.datei, f.daten);
    doc.addFont(f.datei, PDF_FONT, f.stil);
  }
  doc.setFont(PDF_FONT, 'normal');
}
