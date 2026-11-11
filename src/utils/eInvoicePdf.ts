// ============================================================
// Das XML aus einem PDF holen
// ============================================================
//
// ZUGFeRD und Factur-X sind Hybridformate: ein PDF/A-3 zum Ansehen, mit dem
// maschinenlesbaren XML als Dateianhang darin. Der Mensch sieht die Rechnung,
// die Software liest die Zahlen — aus **einer** Datei.
//
// `zugferdPdf.ts` schreibt diesen Anhang. Hier steht die Gegenrichtung.
//
// pdf-lib hat dafür keine High-Level-API — `doc.attach()` gibt es, ein
// `doc.getAttachments()` nicht. Der Weg führt deshalb durch den Katalog:
//
//   Catalog → /Names → /EmbeddedFiles → Namensbaum
//     Der Baum hat entweder /Names (Paare aus Name und Dateispezifikation)
//     oder /Kids (Teilbäume). Grosse Dokumente nutzen Kids, kleine nicht —
//     beides muss gehen.
//   Dateispezifikation → /EF → /F  → der eigentliche Datenstrom
//
// Zusätzlich führt PDF/A-3 die Anhänge in `/AF` am Katalog. Manche Erzeuger
// füllen nur das eine, manche nur das andere. Gesucht wird deshalb in beiden.

import {
  PDFDocument, PDFDict, PDFName, PDFArray, PDFRawStream, PDFString, PDFHexString,
  decodePDFRawStream,
} from 'pdf-lib';
import { looksLikeEInvoice, parseEInvoiceXml, type ParsedEInvoice } from './eInvoiceRead';

/**
 * Dateinamen, die der Standard für den XML-Anhang vorsieht.
 *
 * `factur-x.xml` ist der aktuelle Name, `zugferd-invoice.xml` der aus
 * ZUGFeRD 1.0, `xrechnung.xml` kommt bei hybriden XRechnungen vor. Grosse und
 * kleine Schreibweise mischen die Erzeuger munter.
 */
const KNOWN_NAMES = [
  'factur-x.xml',
  'zugferd-invoice.xml',
  'xrechnung.xml',
  'cii.xml',
  'order-x.xml',
];

export interface EmbeddedXml {
  filename: string;
  xml: string;
}

function asDict(value: unknown): PDFDict | undefined {
  return value instanceof PDFDict ? value : undefined;
}

/**
 * Text aus einem PDF-String holen.
 *
 * Nicht über `toString()`: Dateinamen liegen meist als `PDFHexString` vor —
 * UTF-16BE mit vorangestellter BOM, hexadezimal notiert. Die Textdarstellung
 * davon ist die Hex-Ziffernfolge selbst, also `FEFF0066…` statt `factur-x.xml`.
 * Beide Klassen können `decodeText()`; die Basisklasse kennt es nicht, deshalb
 * die Fallunterscheidung.
 */
function pdfText(value: unknown): string | undefined {
  if (value instanceof PDFHexString || value instanceof PDFString) {
    return value.decodeText();
  }
  return undefined;
}

/** Den Namensbaum abgehen — flach oder über Kids verschachtelt. */
function collectFromNameTree(node: PDFDict | undefined, out: Map<string, PDFDict>, tiefe = 0): void {
  // Ein Baum, der sich selbst enthält, wäre eine Endlosschleife. Kommt in
  // absichtlich kaputten Dateien vor.
  if (!node || tiefe > 32) return;

  const names = node.lookup(PDFName.of('Names'));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const label = pdfText(names.lookup(i)) ?? `#${i}`;
      const spec = asDict(names.lookup(i + 1));
      if (spec) out.set(label, spec);
    }
  }

  const kids = node.lookup(PDFName.of('Kids'));
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) {
      collectFromNameTree(asDict(kids.lookup(i)), out, tiefe + 1);
    }
  }
}

/** Aus einer Dateispezifikation den Namen und die Bytes ziehen. */
function readFileSpec(spec: PDFDict, fallbackName: string): { name: string; bytes: Uint8Array } | null {
  const ef = asDict(spec.lookup(PDFName.of('EF')));
  if (!ef) return null;

  // `/F` ist der eingebettete Strom, `/UF` die Unicode-Variante desselben.
  const stream = ef.lookup(PDFName.of('F')) ?? ef.lookup(PDFName.of('UF'));
  if (!(stream instanceof PDFRawStream)) return null;

  // `/UF` ist der Unicode-Name und geht vor; `/F` ist die alte Schreibweise.
  const name = pdfText(spec.lookup(PDFName.of('UF')))
    ?? pdfText(spec.lookup(PDFName.of('F')))
    ?? fallbackName;

  try {
    return { name, bytes: decodePDFRawStream(stream).decode() };
  } catch {
    // Ein Anhang mit einem Filter, den pdf-lib nicht kennt. Kein Grund, die
    // übrigen Anhänge aufzugeben.
    return null;
  }
}

function decodeXml(bytes: Uint8Array): string {
  // UTF-8 ist vorgeschrieben, aber eine BOM kommt vor und würde den DOMParser
  // vor dem Wurzelelement stolpern lassen.
  //
  // Als Escape geschrieben, nicht als Zeichen: Ein wörtliches U+FEFF im
  // Quelltext ist unsichtbar — man sieht weder, dass es da ist, noch wenn es
  // beim Bearbeiten verschwindet.
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

/**
 * Sucht das E-Rechnungs-XML in einem PDF.
 *
 * Reihenfolge mit Absicht: erst die Namen, die der Standard vorschreibt, dann
 * irgendein `.xml`. Ein PDF kann mehrere Anhänge tragen — Lieferschein,
 * Stundennachweis, Allgemeine Geschäftsbedingungen —, und der erstbeste wäre
 * dann der falsche.
 *
 * Gibt `null` zurück, wenn kein XML dabei ist. Das ist der Normalfall bei einem
 * gewöhnlichen PDF und **kein Fehler**.
 */
export async function extractEmbeddedXml(pdfBytes: ArrayBuffer | Uint8Array): Promise<EmbeddedXml | null> {
  let doc: PDFDocument;
  try {
    // Verschlüsselte PDFs sollen nicht am Einlesen scheitern: Der Anhang liegt
    // trotzdem lesbar vor, wenn nur Rechte gesetzt sind.
    doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return null;
  }

  const specs = new Map<string, PDFDict>();

  // Weg 1: der Namensbaum unter /Names /EmbeddedFiles.
  const names = asDict(doc.catalog.lookup(PDFName.of('Names')));
  collectFromNameTree(asDict(names?.lookup(PDFName.of('EmbeddedFiles'))), specs);

  // Weg 2: das /AF-Feld, das PDF/A-3 zusätzlich verlangt.
  const af = doc.catalog.lookup(PDFName.of('AF'));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const spec = asDict(af.lookup(i));
      if (spec) specs.set(`AF-${i}`, spec);
    }
  }

  if (specs.size === 0) return null;

  const gefunden: EmbeddedXml[] = [];
  for (const [key, spec] of specs) {
    const file = readFileSpec(spec, key);
    if (file) gefunden.push({ filename: file.name, xml: decodeXml(file.bytes) });
  }

  const nachName = (n: string) =>
    gefunden.find((f) => f.filename.toLowerCase() === n);

  for (const name of KNOWN_NAMES) {
    const treffer = nachName(name);
    if (treffer) return treffer;
  }

  // Kein Standardname: der erste Anhang, der wie eine E-Rechnung aussieht.
  // Die Prüfung auf das Wurzelelement ist wichtiger als die Dateiendung —
  // ein `.xml` kann auch ein Lieferschein sein.
  return gefunden.find((f) => looksLikeEInvoice(f.xml)) ?? null;
}

// === Woher das XML kam =====================================================

/** Lag das XML in einem PDF, oder war die Datei selbst das XML? */
export type EInvoiceSource = 'embedded' | 'standalone';

export interface EInvoiceFound {
  invoice: ParsedEInvoice;
  source: EInvoiceSource;
  /** Name des XML im PDF; bei einer reinen XML-Datei deren eigener Name. */
  filename: string;
}

/**
 * Sucht in beliebigen Dateibytes nach einer E-Rechnung.
 *
 * `null` heißt „keine gefunden" — das ist bei einem gewöhnlichen PDF-Beleg der
 * Normalfall und kein Fehler. Ist dagegen eine da, aber unlesbar, wirft die
 * Funktion: Eine kaputte E-Rechnung stillschweigend als „keine" zu behandeln,
 * würde die Ursache verstecken.
 */
export async function findEInvoice(
  bytes: Uint8Array | ArrayBuffer,
  filename: string,
): Promise<EInvoiceFound | null> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  // Ein PDF beginnt mit "%PDF-". Alles andere versuchen wir als XML.
  const istPdf = view.length >= 5
    && view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46;

  if (istPdf) {
    const eingebettet = await extractEmbeddedXml(view);
    if (!eingebettet) return null;
    return {
      invoice: parseEInvoiceXml(eingebettet.xml),
      source: 'embedded',
      filename: eingebettet.filename,
    };
  }

  const text = decodeXml(view);
  if (!looksLikeEInvoice(text)) return null;
  return { invoice: parseEInvoiceXml(text), source: 'standalone', filename };
}

/** Bequemer Einstieg für den Dateidialog. */
export async function findEInvoiceInFile(file: File): Promise<EInvoiceFound | null> {
  return findEInvoice(await file.arrayBuffer(), file.name);
}
