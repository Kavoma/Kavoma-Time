import { PDFDocument, AFRelationship, PDFName, PDFString, PDFHexString, PDFDict, PDFArray, PDFRef } from 'pdf-lib';
import { FACTUR_X_FILENAME, ZUGFERD_CONFORMANCE_LEVEL } from './eInvoiceXml';
import { SRGB_KANAELE, SRGB_KENNUNG, buildSrgbProfile } from './srgbProfile';

/**
 * Hängt das Factur-X-/ZUGFeRD-XML an ein fertiges Rechnungs-PDF und macht das
 * Ergebnis zu einem PDF/A-3B.
 *
 * Vier Dinge gehören dazu, und alle vier sind Pflicht — fehlt eines, weist ein
 * Prüfprogramm die Datei ab:
 *
 * 1. **Eingebettete Schriften.** Erledigt beim Zeichnen (`pdfFonts.ts`); hier
 *    ist nichts mehr zu tun, aber es ist der Grund, warum das überhaupt geht.
 * 2. **Ausgabebedingung** mit ICC-Profil — sagt, in welchem Farbraum die
 *    Farben gemeint sind. Auch ein Dokument aus reinem schwarzem Text braucht
 *    sie.
 * 3. **XMP mit `pdfaid:part` und `pdfaid:conformance`.** Ohne diese zwei
 *    Felder ist es kein PDF/A, egal wie sauber der Rest ist.
 * 4. **Datei-Kennung im Trailer** (`/ID`), damit zwei Fassungen desselben
 *    Dokuments unterscheidbar bleiben.
 *
 * Nicht geprüft ist das Ergebnis gegen veraPDF — das gehört in eine Umgebung
 * mit Java und ist kein Teil dieses Programms.
 */

/**
 * XMP-Paket mit dem Factur-X-Namespace. Ohne diesen Block findet
 * Buchhaltungssoftware den Anhang nicht zuverlässig als E-Rechnung.
 */
function buildXmp(invoiceNumber: string, zeitstempel: string): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Das xpacket-Attribut trägt laut XMP-Spezifikation das BOM-Zeichen (U+FEFF)
  const BOM = '﻿';
  return `<?xpacket begin="${BOM}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Rechnung ${esc(invoiceNumber)}</rdf:li></rdf:Alt></dc:title>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>Kavoma Time</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>Kavoma Time</xmp:CreatorTool>
      <xmp:CreateDate>${esc(zeitstempel)}</xmp:CreateDate>
      <xmp:ModifyDate>${esc(zeitstempel)}</xmp:ModifyDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${FACTUR_X_FILENAME}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${ZUGFERD_CONFORMANCE_LEVEL}</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Name des eingebetteten XML-Dokuments</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Version des Factur-X-Schemas</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Profil des eingebetteten XML</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Nimmt die Bytes eines fertigen Rechnungs-PDFs und gibt ein PDF zurück,
 * das das übergebene CII-XML als Anhang (AFRelationship "Alternative") und
 * die passenden XMP-Metadaten trägt.
 */
export async function attachFacturX(
  pdfBytes: ArrayBuffer | Uint8Array,
  xml: string,
  invoiceNumber: string,
  issuedAt: Date,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);

  await doc.attach(new TextEncoder().encode(xml), FACTUR_X_FILENAME, {
    mimeType: 'text/xml',
    description: 'Factur-X/ZUGFeRD Rechnung',
    creationDate: issuedAt,
    modificationDate: issuedAt,
    afRelationship: AFRelationship.Alternative,
  });

  // Die Angaben hier müssen zu denen im XMP passen — PDF/A verlangt, dass
  // Dokumentinfo und XMP dasselbe sagen. Deshalb stammt beides aus `issuedAt`
  // und denselben festen Zeichenketten.
  doc.setTitle(`Rechnung ${invoiceNumber}`);
  doc.setProducer('Kavoma Time');
  doc.setCreator('Kavoma Time');
  doc.setCreationDate(issuedAt);
  doc.setModificationDate(issuedAt);

  setzeAusgabebedingung(doc);

  // XMP-Paket in den Katalog hängen (pdf-lib hat dafür keine High-Level-API).
  // Wichtig: als UTF-8-Bytes übergeben — bei einem String kürzt pdf-lib jedes
  // Zeichen auf ein Byte und zerstört damit BOM und Umlaute.
  const xmp = buildXmp(invoiceNumber, xmpZeit(issuedAt));
  const metadataStream = doc.context.stream(new TextEncoder().encode(xmp), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(metadataStream));

  entferneNichtEingebetteteSchriften(doc);
  setzeDateiKennung(doc, `${invoiceNumber}|${issuedAt.getTime()}`);

  return doc.save();
}

/**
 * Wirft die Standardschriften hinaus, die jsPDF ungefragt mitschreibt.
 *
 * jsPDF legt beim Anlegen eines Dokuments alle vierzehn Standardschriften an
 * und schreibt sie in die Ausgabe — **auch die, die niemand benutzt**. Für
 * PDF/A ist das tödlich: Jede Schrift im Dokument muss eingebettet sein, und
 * Helvetica ist es nie. Die Schriftverwaltung von jsPDF liegt in einer
 * Closure und lässt sich nicht vorher leeren; bleibt also, sie hinterher zu
 * entfernen.
 *
 * Entfernt wird nur, was **nicht eingebettet und nicht benutzt** ist. Eine
 * benutzte Standardschrift bliebe stehen — dann wäre die Datei kein PDF/A, und
 * das soll auffallen statt still zu einem kaputten Dokument zu führen.
 */
function entferneNichtEingebetteteSchriften(doc: PDFDocument): void {
  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fonts) continue;

    // Welche Namen der Seiteninhalt tatsächlich anspricht (`/F1 12 Tf`).
    const inhalt = inhaltAlsText(doc, page.node);

    for (const [name, ref] of fonts.entries()) {
      const font = doc.context.lookupMaybe(ref, PDFDict);
      if (!font) continue;
      const deskriptor = doc.context.lookupMaybe(font.get(PDFName.of('FontDescriptor')), PDFDict);
      const eingebettet = Boolean(
        deskriptor?.get(PDFName.of('FontFile')) ??
        deskriptor?.get(PDFName.of('FontFile2')) ??
        deskriptor?.get(PDFName.of('FontFile3')),
      );
      if (eingebettet) continue;

      // Wortgrenze, damit `/F1` nicht auf `/F12` passt.
      const benutzt = new RegExp(`${name.asString().replace('/', '\\/')}(?![0-9])`).test(inhalt);
      if (benutzt) continue;

      fonts.delete(name);
      // Auch das Objekt selbst hinaus, nicht nur den Verweis. Sonst bliebe die
      // Schrift als verwaister Eintrag in der Datei stehen — unsichtbar, aber
      // auffindbar, und ein strenger Prüfer sieht dort weiterhin ein
      // nicht eingebettetes Helvetica.
      if (ref instanceof PDFRef) doc.context.delete(ref);
    }
  }
}

/** Den Inhaltsstrom einer Seite als Text — auch wenn er aus mehreren Teilen besteht. */
function inhaltAlsText(doc: PDFDocument, seite: ReturnType<PDFDocument['getPages']>[number]['node']): string {
  const contents = seite.get(PDFName.of('Contents'));
  if (!contents) return '';

  // `lookupMaybe` **wirft** bei einem anderen Typ, statt `undefined` zu geben —
  // und ein Inhalt ist mal ein Strom, mal ein Feld von Strömen. Deshalb erst
  // auflösen, dann fragen, was es ist.
  const aufgeloest = doc.context.lookup(contents);
  const refs = aufgeloest instanceof PDFArray ? aufgeloest.asArray() : [contents];

  let text = '';
  for (const r of refs) {
    const stream = doc.context.lookup(r);
    // `getContents()` liefert die **entpackten** Bytes; der rohe Strom wäre
    // komprimiert und die Suche darin sinnlos.
    const bytes = (stream as unknown as { getContents?: () => Uint8Array })?.getContents?.();
    if (bytes) text += new TextDecoder('latin1').decode(bytes);
  }
  return text;
}

/**
 * Setzt die Datei-Kennung `/ID` im Trailer.
 *
 * pdf-lib schreibt von sich aus eine **zufällige**. Damit sähe dieselbe
 * Rechnung bei jedem Erzeugen anders aus, und niemand könnte unterscheiden, ob
 * sich am Dokument etwas geändert hat oder nur der Zufallswert. Abgeleitet aus
 * Rechnungsnummer und Datum ist sie wiederholbar.
 *
 * Die beiden Werte sind gleich: Der erste kennzeichnet das Dokument dauerhaft,
 * der zweite diese Fassung — beim ersten Schreiben ist das dasselbe.
 */
function setzeDateiKennung(doc: PDFDocument, quelle: string): void {
  const kennung = PDFHexString.of(hexKennung(quelle));
  doc.context.trailerInfo.ID = doc.context.obj([kennung, kennung]);
}

/**
 * Zeitstempel im XMP-Format (ISO 8601 mit Zeitzonenversatz).
 *
 * Aus den **lokalen** Kalenderfeldern gebaut, nicht über `toISOString()`: Eine
 * Rechnung vom 1. Januar 00:30 trüge sonst das Datum des Vortags — dasselbe
 * Muster, das schon beim Z3-Export zu vermeiden war.
 */
function xmpZeit(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  const versatz = -d.getTimezoneOffset();
  const vz = versatz >= 0 ? '+' : '-';
  const abs = Math.abs(versatz);
  return (
    `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}` +
    `T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}` +
    `${vz}${z(Math.floor(abs / 60))}:${z(abs % 60)}`
  );
}

/**
 * Die Ausgabebedingung: sRGB als Zielfarbraum, mit dem Profil im Dokument.
 *
 * PDF/A schreibt sie vor, auch für ein Dokument aus schwarzem Text. Der Grund
 * ist die Archivierung: „schwarz" ist ohne Farbraum keine Farbe, sondern eine
 * Zahl, und in zehn Jahren soll dieselbe Zahl dieselbe Farbe ergeben.
 */
function setzeAusgabebedingung(doc: PDFDocument): void {
  const profil = buildSrgbProfile();
  const profilStream = doc.context.stream(profil, {
    N: SRGB_KANAELE,
    // Ohne den Filter läge das Profil unkomprimiert im PDF; es sind nur rund
    // 600 Byte, aber pdf-lib komprimiert Streams ohnehin nicht von selbst.
  });
  const profilRef = doc.context.register(profilStream);

  const outputIntent = doc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',                       // die Kennung, die PDF/A verlangt
    OutputConditionIdentifier: PDFString.of(SRGB_KENNUNG),
    Info: PDFString.of(SRGB_KENNUNG),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: profilRef,
  });
  doc.catalog.set(
    PDFName.of('OutputIntents'),
    doc.context.obj([doc.context.register(outputIntent)]),
  );
}

/** 32 Hex-Zeichen (16 Byte) aus einer Zeichenkette — schlicht und wiederholbar. */
function hexKennung(quelle: string): string {
  // Ein einfacher, aber gut streuender Hash (FNV-1a), viermal mit
  // verschiedenen Startwerten. Kryptographie ist hier nicht nötig: Die Kennung
  // soll Fassungen unterscheiden, nicht Fälschungen erkennen.
  const teile: string[] = [];
  for (let k = 0; k < 4; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b9);
    for (let i = 0; i < quelle.length; i++) {
      h ^= quelle.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    teile.push((h >>> 0).toString(16).padStart(8, '0'));
  }
  return teile.join('').toUpperCase();
}
