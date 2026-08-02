import { PDFDocument, AFRelationship, PDFName } from 'pdf-lib';
import { FACTUR_X_FILENAME, ZUGFERD_CONFORMANCE_LEVEL } from './eInvoiceXml';

/**
 * Hängt das Factur-X-/ZUGFeRD-XML an ein fertiges Rechnungs-PDF.
 *
 * Bewusste Einschränkung: das Ergebnis ist **kein** zertifiziertes PDF/A-3 —
 * dafür müssten zusätzlich alle Schriften eingebettet und ein ICC-Output-Intent
 * gesetzt werden (jsPDF nutzt die nicht eingebetteten Standard-14-Fonts).
 * Für die Weiterverarbeitung zählt das eingebettete XML plus die XMP-Kennung;
 * beides ist hier vollständig. Siehe Folge-Issue zur PDF/A-3B-Konformität.
 */

/**
 * XMP-Paket mit dem Factur-X-Namespace. Ohne diesen Block findet
 * Buchhaltungssoftware den Anhang nicht zuverlässig als E-Rechnung.
 */
function buildXmp(invoiceNumber: string): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Das xpacket-Attribut trägt laut XMP-Spezifikation das BOM-Zeichen (U+FEFF)
  const BOM = '﻿';
  return `<?xpacket begin="${BOM}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Rechnung ${esc(invoiceNumber)}</rdf:li></rdf:Alt></dc:title>
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

  doc.setTitle(`Rechnung ${invoiceNumber}`);
  doc.setProducer('Kavoma Time');
  doc.setCreationDate(issuedAt);
  doc.setModificationDate(issuedAt);

  // XMP-Paket in den Katalog hängen (pdf-lib hat dafür keine High-Level-API).
  // Wichtig: als UTF-8-Bytes übergeben — bei einem String kürzt pdf-lib jedes
  // Zeichen auf ein Byte und zerstört damit BOM und Umlaute.
  const metadataStream = doc.context.stream(new TextEncoder().encode(buildXmp(invoiceNumber)), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(metadataStream));

  return doc.save();
}
