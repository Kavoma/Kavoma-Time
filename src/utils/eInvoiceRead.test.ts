// @vitest-environment happy-dom
//
// Der Leser braucht einen DOM. `happy-dom` bringt ihn mit und behandelt
// XML-Namensräume korrekt — geprüft wurde vor der Aufnahme, dass `localName`,
// Attribute und das Fehlerdokument bei kaputtem XML stimmen. Genau darauf
// stützt sich der Leser.

import { describe, expect, it } from 'vitest';
import {
  parseEInvoiceXml,
  looksLikeEInvoice,
  unitLabel,
  taxCategoryLabel,
  EInvoiceParseError,
} from './eInvoiceRead';
import { buildFacturXXml } from './eInvoiceXml';
import type { Invoice, Issuer, Customer } from '../types';

/** Ein Zeitstempel aus Kalenderangaben — wie ihn der Leser zurückgeben muss. */
const tag = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

// ============================================================
// CII — ZUGFeRD / Factur-X und XRechnung-CII
// ============================================================

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>RE-2026-0042</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20260815</udt:DateTimeString></ram:IssueDateTime>
    <ram:IncludedNote><ram:Content>Vielen Dank für Ihren Auftrag.</ram:Content></ram:IncludedNote>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>Beratung Größenordnung</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>95.00</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="HUR">8.00</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>760.00</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>04011000-12345-67</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>Müller &amp; Söhne GmbH</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>10115</ram:PostcodeCode>
          <ram:LineOne>Hauptstraße 1</ram:LineOne>
          <ram:CityName>Berlin</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">rechnung@mueller.example</ram:URIID></ram:URIUniversalCommunication>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE123456789</ram:ID></ram:SpecifiedTaxRegistration>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">12/345/67890</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>Kavoma</ram:Name>
        <ram:PostalTradeAddress><ram:CityName>Hamburg</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime><udt:DateTimeString format="102">20260731</udt:DateTimeString></ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE02 1203 0000 0000 2020 51</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
        <ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>BYLADEM1001</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>140.60</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>740.00</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:BillingSpecifiedPeriod>
        <ram:StartDateTime><udt:DateTimeString format="102">20260701</udt:DateTimeString></ram:StartDateTime>
        <ram:EndDateTime><udt:DateTimeString format="102">20260731</udt:DateTimeString></ram:EndDateTime>
      </ram:BillingSpecifiedPeriod>
      <ram:SpecifiedTradeAllowanceCharge>
        <ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>
        <ram:ActualAmount>20.00</ram:ActualAmount>
        <ram:Reason>Treuerabatt</ram:Reason>
      </ram:SpecifiedTradeAllowanceCharge>
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>Zahlbar ohne Abzug bis 14.09.2026</ram:Description>
        <ram:DueDateDateTime><udt:DateTimeString format="102">20260914</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>760.00</ram:LineTotalAmount>
        <ram:AllowanceTotalAmount>20.00</ram:AllowanceTotalAmount>
        <ram:TaxBasisTotalAmount>740.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">140.60</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>880.60</ram:GrandTotalAmount>
        <ram:DuePayableAmount>880.60</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

describe('CII lesen', () => {
  const inv = parseEInvoiceXml(CII);

  it('erkennt Syntax und Profil', () => {
    expect(inv.syntax).toBe('cii');
    expect(inv.profile).toBe('urn:cen.eu:en16931:2017');
    expect(inv.profileLabel).toBe('EN 16931 (Comfort)');
  });

  it('liest Kopfdaten', () => {
    expect(inv.number).toBe('RE-2026-0042');
    expect(inv.documentTypeCode).toBe('380');
    expect(inv.documentTypeLabel).toBe('Rechnung');
    expect(inv.isCreditNote).toBe(false);
    expect(inv.currency).toBe('EUR');
    expect(inv.buyerReference).toBe('04011000-12345-67');
  });

  it('liest Daten als Kalendertage in lokaler Zeit', () => {
    // Der Fallstrick: `new Date('2026-08-15')` wäre UTC-Mitternacht und
    // westlich von Greenwich der 14. August.
    expect(inv.issueDate).toBe(tag(2026, 8, 15));
    expect(inv.dueDate).toBe(tag(2026, 9, 14));
    expect(inv.periodFrom).toBe(tag(2026, 7, 1));
    expect(inv.periodTo).toBe(tag(2026, 7, 31));
    expect(new Date(inv.issueDate!).getDate()).toBe(15);
  });

  it('trennt USt-IdNr. und Steuernummer über die schemeID', () => {
    expect(inv.seller.name).toBe('Müller & Söhne GmbH');
    expect(inv.seller.vatId).toBe('DE123456789');
    expect(inv.seller.taxId).toBe('12/345/67890');
    expect(inv.seller.zip).toBe('10115');
    expect(inv.seller.street).toBe('Hauptstraße 1');
    expect(inv.seller.city).toBe('Berlin');
    expect(inv.seller.email).toBe('rechnung@mueller.example');
  });

  it('liest die Positionen samt Einheit', () => {
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]).toMatchObject({
      lineId: '1',
      name: 'Beratung Größenordnung',
      quantity: 8,
      unit: 'Std.',
      unitPrice: 95,
      lineTotal: 760,
      taxPercent: 19,
    });
  });

  it('liest Summen und Steueraufteilung', () => {
    expect(inv.lineTotal).toBe(760);
    expect(inv.allowanceTotal).toBe(20);
    expect(inv.taxBasisTotal).toBe(740);
    expect(inv.taxTotal).toBe(140.6);
    expect(inv.grandTotal).toBe(880.6);
    expect(inv.duePayable).toBe(880.6);
    expect(inv.taxes).toEqual([
      { categoryCode: 'S', ratePercent: 19, basisAmount: 740, taxAmount: 140.6, exemptionReason: undefined },
    ]);
  });

  it('normalisiert IBAN und BIC', () => {
    expect(inv.paymentIban).toBe('DE02120300000000202051');
    expect(inv.paymentBic).toBe('BYLADEM1001');
    expect(inv.paymentTerms).toMatch(/Zahlbar ohne Abzug/);
  });

  it('nimmt die Anmerkungen mit', () => {
    expect(inv.notes).toEqual(['Vielen Dank für Ihren Auftrag.']);
  });

  it('findet nichts zu beanstanden', () => {
    expect(inv.warnings).toEqual([]);
  });
});

describe('CII ohne Kopf-Abschlagssumme', () => {
  it('rechnet die Abschläge aus den Einzelposten zusammen', () => {
    // Nicht jeder Erzeuger schreibt AllowanceTotalAmount. Dann muss der Leser
    // aus den einzelnen Abschlägen summieren, statt das Feld leer zu lassen.
    const ohneSumme = CII.replace('<ram:AllowanceTotalAmount>20.00</ram:AllowanceTotalAmount>', '');
    const inv = parseEInvoiceXml(ohneSumme);
    expect(inv.allowanceTotal).toBe(20);
  });

  it('unterscheidet Abschlag von Zuschlag am ChargeIndicator', () => {
    const mitZuschlag = CII
      .replace('<ram:AllowanceTotalAmount>20.00</ram:AllowanceTotalAmount>', '')
      .replace('<udt:Indicator>false</udt:Indicator>', '<udt:Indicator>true</udt:Indicator>');
    const inv = parseEInvoiceXml(mitZuschlag);
    expect(inv.chargeTotal).toBe(20);
    expect(inv.allowanceTotal).toBeUndefined();
  });
});

// ============================================================
// UBL — die andere erlaubte XRechnung-Syntax
// ============================================================

const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ID>XR-2026-7</cbc:ID>
  <cbc:IssueDate>2026-08-15</cbc:IssueDate>
  <cbc:DueDate>2026-09-14</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:Note>Lieferung wie besprochen.</cbc:Note>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>04011000-12345-67</cbc:BuyerReference>
  <cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate></cac:InvoicePeriod>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="EM">rechnung@lieferant.example</cbc:EndpointID>
    <cac:PostalAddress>
      <cbc:StreetName>Marktplatz 5</cbc:StreetName>
      <cbc:AdditionalStreetName>Hinterhaus</cbc:AdditionalStreetName>
      <cbc:CityName>Köln</cbc:CityName>
      <cbc:PostalZone>50667</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>DE987654321</cbc:CompanyID>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Lieferant GmbH</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Kavoma</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:CityName>Hamburg</cbc:CityName><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE02120300000000202051</cbc:ID>
      <cac:FinancialInstitutionBranch><cbc:ID>BYLADEM1001</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms><cbc:Note>Zahlbar innerhalb von 30 Tagen</cbc:Note></cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">38.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">200.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">38.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19.00</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">200.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">238.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">238.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Tastatur</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19.00</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

describe('UBL lesen', () => {
  const inv = parseEInvoiceXml(UBL);

  it('erkennt Syntax und XRechnung-Profil', () => {
    expect(inv.syntax).toBe('ubl');
    expect(inv.profileLabel).toBe('XRechnung');
  });

  it('liest Kopfdaten und Daten', () => {
    expect(inv.number).toBe('XR-2026-7');
    expect(inv.issueDate).toBe(tag(2026, 8, 15));
    expect(inv.dueDate).toBe(tag(2026, 9, 14));
    expect(inv.periodFrom).toBe(tag(2026, 7, 1));
    expect(inv.periodTo).toBe(tag(2026, 7, 31));
    expect(inv.buyerReference).toBe('04011000-12345-67');
  });

  it('nimmt den eingetragenen Namen, wenn kein Handelsname da ist', () => {
    expect(inv.seller.name).toBe('Lieferant GmbH');
    expect(inv.seller.vatId).toBe('DE987654321');
    expect(inv.seller.street).toBe('Marktplatz 5');
    expect(inv.seller.address2).toBe('Hinterhaus');
    expect(inv.seller.zip).toBe('50667');
    expect(inv.seller.city).toBe('Köln');
    // Ohne cac:Contact ist die EndpointID die beste verfügbare Adresse.
    expect(inv.seller.email).toBe('rechnung@lieferant.example');
    expect(inv.buyer.name).toBe('Kavoma');
  });

  it('liest Positionen und Summen', () => {
    expect(inv.lines).toEqual([
      { lineId: '1', name: 'Tastatur', quantity: 2, unit: 'Stk.', unitPrice: 100, lineTotal: 200, taxPercent: 19 },
    ]);
    expect(inv.lineTotal).toBe(200);
    expect(inv.taxBasisTotal).toBe(200);
    expect(inv.taxTotal).toBe(38);
    expect(inv.grandTotal).toBe(238);
    expect(inv.duePayable).toBe(238);
  });

  it('liest Zahlungsangaben', () => {
    expect(inv.paymentIban).toBe('DE02120300000000202051');
    expect(inv.paymentBic).toBe('BYLADEM1001');
    expect(inv.paymentTerms).toBe('Zahlbar innerhalb von 30 Tagen');
    expect(inv.notes).toEqual(['Lieferung wie besprochen.']);
  });

  it('findet nichts zu beanstanden', () => {
    expect(inv.warnings).toEqual([]);
  });
});

describe('UBL-Gutschrift', () => {
  it('erkennt sie an der Wurzel, nicht nur am Code', () => {
    const gutschrift = UBL
      .replace('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
               '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"')
      .replace('</Invoice>', '</CreditNote>')
      .replace('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>', '<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>')
      .replace(/InvoiceLine>/g, 'CreditNoteLine>')
      .replace(/InvoicedQuantity/g, 'CreditedQuantity');

    const inv = parseEInvoiceXml(gutschrift);
    expect(inv.isCreditNote).toBe(true);
    expect(inv.documentTypeLabel).toBe('Gutschrift');
    // Die Positionen heißen anders und müssen trotzdem gefunden werden.
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].quantity).toBe(2);
    expect(inv.warnings.some((w) => w.includes('Gutschrift'))).toBe(true);
  });
});

// ============================================================
// Eigenheiten, an denen naive Leser scheitern
// ============================================================

describe('Robustheit', () => {
  it('ist gegen fremde Namensraum-Präfixe unempfindlich', () => {
    // Präfixe sind frei wählbar. Wer auf `ram:` prüft statt auf den lokalen
    // Namen, scheitert am ersten Absender mit anderer Vorliebe.
    // Erst die Deklarationen umbenennen, dann die Verwendungen — sonst
    // entsteht ungültiges XML mit undeklarierten Präfixen.
    const anders = CII
      .replace(/xmlns:rsm=/g, 'xmlns:a=').replace(/xmlns:ram=/g, 'xmlns:b=').replace(/xmlns:udt=/g, 'xmlns:c=')
      .replace(/rsm:/g, 'a:').replace(/ram:/g, 'b:').replace(/udt:/g, 'c:');
    const inv = parseEInvoiceXml(anders);
    expect(inv.number).toBe('RE-2026-0042');
    expect(inv.grandTotal).toBe(880.6);
    expect(inv.lines[0].name).toBe('Beratung Größenordnung');
  });

  it('liest Beträge im englischen Format, nicht im deutschen', () => {
    // „1234.56" sind eintausendzweihundertvierunddreißig Komma sechsundfünfzig.
    const gross = CII.replace('<ram:GrandTotalAmount>880.60</ram:GrandTotalAmount>',
                              '<ram:GrandTotalAmount>1234.56</ram:GrandTotalAmount>');
    expect(parseEInvoiceXml(gross).grandTotal).toBe(1234.56);
  });

  it('macht aus fehlenden Feldern kein Drama', () => {
    // Das Profil MINIMUM hat weder Positionen noch Fälligkeit — das ist erlaubt.
    const minimal = `<?xml version="1.0"?>
      <rsm:CrossIndustryInvoice xmlns:rsm="urn:x" xmlns:ram="urn:y">
        <rsm:ExchangedDocument><ram:ID>M-1</ram:ID><ram:TypeCode>380</ram:TypeCode></rsm:ExchangedDocument>
        <rsm:SupplyChainTradeTransaction>
          <ram:ApplicableHeaderTradeAgreement>
            <ram:SellerTradeParty><ram:Name>Knapp GmbH</ram:Name></ram:SellerTradeParty>
          </ram:ApplicableHeaderTradeAgreement>
          <ram:ApplicableHeaderTradeSettlement>
            <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
              <ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>
            </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
          </ram:ApplicableHeaderTradeSettlement>
        </rsm:SupplyChainTradeTransaction>
      </rsm:CrossIndustryInvoice>`;
    const inv = parseEInvoiceXml(minimal);
    expect(inv.number).toBe('M-1');
    expect(inv.grandTotal).toBe(119);
    expect(inv.dueDate).toBeUndefined();
    expect(inv.lines).toEqual([]);
    expect(inv.warnings.some((w) => w.includes('keine Einzelpositionen'))).toBe(true);
    expect(inv.warnings.some((w) => w.includes('Rechnungsdatum'))).toBe(true);
  });

  it('meldet, wenn die Summen nicht aufgehen', () => {
    // Der praktische Nutzen: vertauschte oder falsch gelesene Felder fallen auf,
    // bevor jemand die Zahl in die Buchhaltung übernimmt.
    const falsch = CII.replace('<ram:GrandTotalAmount>880.60</ram:GrandTotalAmount>',
                               '<ram:GrandTotalAmount>800.60</ram:GrandTotalAmount>');
    expect(parseEInvoiceXml(falsch).warnings.some((w) => w.includes('gehen nicht auf'))).toBe(true);
  });

  it('meldet eine Fremdwährung, statt sie stillschweigend als Euro zu nehmen', () => {
    const chf = CII.replace('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>',
                            '<ram:InvoiceCurrencyCode>CHF</ram:InvoiceCurrencyCode>');
    const inv = parseEInvoiceXml(chf);
    expect(inv.currency).toBe('CHF');
    expect(inv.warnings.some((w) => w.includes('CHF'))).toBe(true);
  });

  it('weist zurück, was keine E-Rechnung ist', () => {
    expect(() => parseEInvoiceXml('<html><body>Hallo</body></html>'))
      .toThrow(EInvoiceParseError);
    expect(() => parseEInvoiceXml('<nonsense/>'))
      .toThrow(/keine E-Rechnung/);
  });

  it('weist kaputtes XML mit einer verständlichen Meldung ab', () => {
    expect(() => parseEInvoiceXml('<Invoice><cbc:ID>1</Invoice>'))
      .toThrow(/kein gültiges XML/);
  });

  it('weist eine unsinnig große Datei ab, statt sich daran aufzuhängen', () => {
    expect(() => parseEInvoiceXml('<Invoice>' + 'x'.repeat(13 * 1024 * 1024) + '</Invoice>'))
      .toThrow(/zu groß/);
  });
});

describe('Schnellerkennung', () => {
  it('erkennt beide Syntaxen am Wurzelelement', () => {
    expect(looksLikeEInvoice(CII)).toBe(true);
    expect(looksLikeEInvoice(UBL)).toBe(true);
    expect(looksLikeEInvoice('<Lieferschein><Pos/></Lieferschein>')).toBe(false);
  });
});

describe('Beschriftungen', () => {
  it('übersetzt Einheiten-Codes und reicht Unbekanntes durch', () => {
    expect(unitLabel('HUR')).toBe('Std.');
    expect(unitLabel('hur')).toBe('Std.');
    expect(unitLabel('C62')).toBe('Stk.');
    // Lieber der rohe Code als ein leeres Feld.
    expect(unitLabel('XYZ')).toBe('XYZ');
    expect(unitLabel(undefined)).toBeUndefined();
  });

  it('übersetzt Steuerkategorien', () => {
    expect(taxCategoryLabel('S')).toBe('Regelsatz');
    expect(taxCategoryLabel('AE')).toBe('Reverse Charge');
    expect(taxCategoryLabel('?')).toBeUndefined();
  });
});

// ============================================================
// Rundlauf gegen den eigenen Schreiber
// ============================================================
// Kavoma Time schreibt selbst ZUGFeRD. Wenn Schreiber und Leser sich über
// dieselbe Rechnung nicht einig sind, ist einer von beiden falsch — und das
// fällt sonst erst beim Empfänger auf.

describe('Rundlauf: selbst geschrieben, selbst gelesen', () => {
  const issuer: Issuer = {
    name: 'Kavoma', street: 'Beispielweg 3', zip: '20095', city: 'Hamburg', country: 'DE',
    email: 'rechnung@kavoma.example', phone: '', iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001', bank: 'Beispielbank', taxId: '22/333/44444', vatId: 'DE111222333',
    smallBusiness: false, vatRate: 19,
  };
  const customer = {
    id: 1, name: 'Grosskunde AG', street: 'Industriestr. 9', zip: '80331', city: 'München',
    country: 'DE', email: 'buchhaltung@grosskunde.example', debtorNumber: '10001',
  } as unknown as Customer;

  const invoice = {
    id: 'i1', number: 'RE-2026-0100', customerId: 1, projectId: null, mode: 'hourly',
    periodFrom: tag(2026, 7, 1), periodTo: tag(2026, 7, 31),
    createdAt: tag(2026, 8, 5), dueDate: tag(2026, 9, 4),
    items: [
      { description: 'Entwicklung', quantity: 10, unit: 'h', unitPrice: 100, total: 1000, kind: 'time' },
      { description: 'Treuerabatt', quantity: 1, unit: '€', unitPrice: -50, total: -50, kind: 'discount' },
    ],
    entryIds: [], subtotal: 950, vatRate: 19, vatAmount: 180.5, total: 1130.5,
    notes: 'Danke für die gute Zusammenarbeit.', paid: false, status: 'active', reminders: [],
  } as unknown as Invoice;

  const gelesen = parseEInvoiceXml(buildFacturXXml(invoice, issuer, customer));

  it('liest zurück, was geschrieben wurde', () => {
    expect(gelesen.syntax).toBe('cii');
    expect(gelesen.number).toBe('RE-2026-0100');
    expect(gelesen.issueDate).toBe(invoice.createdAt);
    expect(gelesen.dueDate).toBe(invoice.dueDate);
    expect(gelesen.grandTotal).toBe(1130.5);
    expect(gelesen.taxTotal).toBe(180.5);
    expect(gelesen.taxBasisTotal).toBe(950);
    expect(gelesen.allowanceTotal).toBe(50);
  });

  it('gibt Absender und Empfänger unverfälscht zurück', () => {
    expect(gelesen.seller.name).toBe('Kavoma');
    expect(gelesen.seller.vatId).toBe('DE111222333');
    expect(gelesen.seller.taxId).toBe('22/333/44444');
    expect(gelesen.buyer.name).toBe('Grosskunde AG');
    expect(gelesen.buyer.city).toBe('München');
    expect(gelesen.paymentIban).toBe('DE02120300000000202051');
  });

  it('behält die Positionen ohne die Rabattzeile', () => {
    // Rabatte stehen im EN 16931 als Abschlag auf Kopfebene, nicht als Position.
    expect(gelesen.lines).toHaveLength(1);
    expect(gelesen.lines[0]).toMatchObject({ name: 'Entwicklung', quantity: 10, unit: 'Std.', unitPrice: 100 });
  });

  it('hat nichts zu beanstanden', () => {
    expect(gelesen.warnings).toEqual([]);
  });

  it('erkennt eine Kleinunternehmer-Rechnung als steuerbefreit', () => {
    const klein: Issuer = { ...issuer, smallBusiness: true, vatRate: 0 };
    const ohneUst = { ...invoice, vatRate: 0, vatAmount: 0, total: 950 } as Invoice;
    const inv = parseEInvoiceXml(buildFacturXXml(ohneUst, klein, customer));
    expect(inv.taxes[0].categoryCode).toBe('E');
    expect(inv.taxes[0].ratePercent).toBe(0);
    expect(inv.taxes[0].exemptionReason).toMatch(/Kleinunternehmer/);
    expect(inv.grandTotal).toBe(950);
    expect(inv.warnings).toEqual([]);
  });

  it('erkennt eine Storno-Rechnung als Korrekturbeleg', () => {
    const storno = { ...invoice, cancelsInvoiceId: 'i0' } as Invoice;
    const inv = parseEInvoiceXml(buildFacturXXml(storno, issuer, customer));
    expect(inv.documentTypeCode).toBe('384');
    expect(inv.documentTypeLabel).toBe('Rechnungskorrektur');
  });
});
