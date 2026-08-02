import type { Invoice, InvoiceItem, Issuer, Customer } from '../types';

/**
 * Erzeugt das ZUGFeRD-/Factur-X-XML (UN/CEFACT Cross Industry Invoice, CII)
 * im Profil EN 16931 ("Comfort").
 *
 * Bewusst ohne XML-Library: das Dokument ist flach genug, dass ein
 * String-Builder mit striktem Escaping robuster ist als eine zusätzliche
 * Abhängigkeit im Renderer. Die Reihenfolge der Elemente ist im CII-Schema
 * **verbindlich** — beim Ergänzen neuer Felder unbedingt die Sequenz einhalten.
 */

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
};

/** Kennung des Profils — wird auch in die XMP-Metadaten des PDFs geschrieben. */
export const EN16931_GUIDELINE = 'urn:cen.eu:en16931:2017';
export const ZUGFERD_CONFORMANCE_LEVEL = 'EN 16931';
/** Dateiname, den der ZUGFeRD-Standard für den PDF-Anhang vorschreibt. */
export const FACTUR_X_FILENAME = 'factur-x.xml';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Beträge im CII immer mit Punkt und zwei Nachkommastellen. */
function amount(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** Mengen dürfen mehr Nachkommastellen haben (z. B. 1,75 h). */
function quantity(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00');
}

/** Datumsformat "102" = YYYYMMDD, aus lokaler Zeit gelesen. */
function dateCode(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function dateElement(tag: string, ts: number): string {
  return `<ram:${tag}><udt:DateTimeString format="102">${dateCode(ts)}</udt:DateTimeString></ram:${tag}>`;
}

/** USt-IdNr./Steuernummer für das XML normalisieren (die UI formatiert mit Leerzeichen). */
function compactId(v?: string): string {
  return (v ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Ländercode auf ISO-3166-1 alpha-2 bringen, Default DE. */
function countryCode(v?: string): string {
  const c = (v ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : 'DE';
}

/**
 * Einheiten-Codes nach UN/ECE Recommendation 20.
 * HUR = Stunde, DAY = Tag, C62 = Stück/Einheit (Fallback für Pauschalen).
 */
function unitCode(unit: string): string {
  const u = (unit ?? '').trim().toLowerCase();
  if (u === 'h' || u === 'std' || u === 'std.' || u === 'stunde' || u === 'stunden') return 'HUR';
  if (u === 'tag' || u === 'tage' || u === 'd') return 'DAY';
  if (u === 'km') return 'KMT';
  if (u === 'monat' || u === 'monate') return 'MON';
  return 'C62';
}

interface TaxInfo {
  /** Steuerkategorie nach UNTDID 5305: S = Regelsatz, E = befreit. */
  categoryCode: 'S' | 'E';
  ratePercent: number;
  exemptionReason?: string;
}

function resolveTax(invoice: Invoice, issuer: Issuer): TaxInfo {
  if (issuer.smallBusiness) {
    return {
      categoryCode: 'E',
      ratePercent: 0,
      exemptionReason: 'Kleinunternehmer gemäß § 19 UStG — kein Ausweis von Umsatzsteuer',
    };
  }
  if (!invoice.vatRate || invoice.vatRate <= 0) {
    return { categoryCode: 'E', ratePercent: 0, exemptionReason: 'Steuerbefreite Leistung' };
  }
  return { categoryCode: 'S', ratePercent: invoice.vatRate };
}

/** Rabatt-Positionen werden im EN 16931 als Abschlag auf Kopfebene abgebildet. */
function isDiscount(item: InvoiceItem): boolean {
  return item.kind === 'discount' || item.total < 0;
}

function addressBlock(p: { street?: string; address2?: string; zip?: string; city?: string; country?: string }): string {
  return [
    '<ram:PostalTradeAddress>',
    p.zip ? `<ram:PostcodeCode>${esc(p.zip)}</ram:PostcodeCode>` : '',
    p.street ? `<ram:LineOne>${esc(p.street)}</ram:LineOne>` : '',
    p.address2 ? `<ram:LineTwo>${esc(p.address2)}</ram:LineTwo>` : '',
    p.city ? `<ram:CityName>${esc(p.city)}</ram:CityName>` : '',
    `<ram:CountryID>${countryCode(p.country)}</ram:CountryID>`,
    '</ram:PostalTradeAddress>',
  ].filter(Boolean).join('');
}

function sellerParty(issuer: Issuer): string {
  const vatId = compactId(issuer.vatId);
  const taxId = (issuer.taxId ?? '').trim();
  return [
    '<ram:SellerTradeParty>',
    `<ram:Name>${esc(issuer.name)}</ram:Name>`,
    addressBlock(issuer),
    issuer.email
      ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(issuer.email)}</ram:URIID></ram:URIUniversalCommunication>`
      : '',
    vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : '',
    taxId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(taxId)}</ram:ID></ram:SpecifiedTaxRegistration>` : '',
    '</ram:SellerTradeParty>',
  ].filter(Boolean).join('');
}

function buyerParty(customer: Customer): string {
  const vatId = compactId(customer.vatId);
  return [
    '<ram:BuyerTradeParty>',
    customer.debtorNumber ? `<ram:ID>${esc(customer.debtorNumber)}</ram:ID>` : '',
    `<ram:Name>${esc(customer.name)}</ram:Name>`,
    addressBlock(customer),
    customer.email
      ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(customer.email)}</ram:URIID></ram:URIUniversalCommunication>`
      : '',
    vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : '',
    '</ram:BuyerTradeParty>',
  ].filter(Boolean).join('');
}

function lineItem(item: InvoiceItem, index: number, tax: TaxInfo): string {
  return [
    '<ram:IncludedSupplyChainTradeLineItem>',
    `<ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>`,
    `<ram:SpecifiedTradeProduct><ram:Name>${esc(item.description || 'Leistung')}</ram:Name></ram:SpecifiedTradeProduct>`,
    '<ram:SpecifiedLineTradeAgreement>',
    `<ram:NetPriceProductTradePrice><ram:ChargeAmount>${amount(item.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>`,
    '</ram:SpecifiedLineTradeAgreement>',
    '<ram:SpecifiedLineTradeDelivery>',
    `<ram:BilledQuantity unitCode="${unitCode(item.unit)}">${quantity(item.quantity)}</ram:BilledQuantity>`,
    '</ram:SpecifiedLineTradeDelivery>',
    '<ram:SpecifiedLineTradeSettlement>',
    '<ram:ApplicableTradeTax>',
    '<ram:TypeCode>VAT</ram:TypeCode>',
    `<ram:CategoryCode>${tax.categoryCode}</ram:CategoryCode>`,
    `<ram:RateApplicablePercent>${amount(tax.ratePercent)}</ram:RateApplicablePercent>`,
    '</ram:ApplicableTradeTax>',
    '<ram:SpecifiedTradeSettlementLineMonetarySummation>',
    `<ram:LineTotalAmount>${amount(item.total)}</ram:LineTotalAmount>`,
    '</ram:SpecifiedTradeSettlementLineMonetarySummation>',
    '</ram:SpecifiedLineTradeSettlement>',
    '</ram:IncludedSupplyChainTradeLineItem>',
  ].join('');
}

/**
 * Baut das vollständige Factur-X-XML für eine Rechnung.
 * Der Aufrufer sollte vorher `collectEInvoiceIssues` prüfen — fehlende
 * Pflichtangaben führen hier nicht zu einem Fehler, sondern zu einem
 * unvollständigen (und damit für den Empfänger nutzlosen) Dokument.
 */
export function buildFacturXXml(invoice: Invoice, issuer: Issuer, customer: Customer): string {
  const tax = resolveTax(invoice, issuer);

  const regularItems = invoice.items.filter((it) => !isDiscount(it));
  const discountItems = invoice.items.filter(isDiscount);

  const lineTotal = Number(regularItems.reduce((s, it) => s + it.total, 0).toFixed(2));
  // Abschläge im XML positiv, der ChargeIndicator macht daraus einen Abzug
  const allowanceTotal = Number(Math.abs(discountItems.reduce((s, it) => s + it.total, 0)).toFixed(2));
  const taxBasis = Number((lineTotal - allowanceTotal).toFixed(2));

  // Storno-Rechnungen sind Korrekturbelege (UNTDID 1001: 384)
  const typeCode = invoice.cancelsInvoiceId ? '384' : '380';

  const allowances = discountItems.map((it) => [
    '<ram:SpecifiedTradeAllowanceCharge>',
    '<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>',
    `<ram:ActualAmount>${amount(Math.abs(it.total))}</ram:ActualAmount>`,
    `<ram:Reason>${esc(it.description || 'Rabatt')}</ram:Reason>`,
    '<ram:CategoryTradeTax>',
    '<ram:TypeCode>VAT</ram:TypeCode>',
    `<ram:CategoryCode>${tax.categoryCode}</ram:CategoryCode>`,
    `<ram:RateApplicablePercent>${amount(tax.ratePercent)}</ram:RateApplicablePercent>`,
    '</ram:CategoryTradeTax>',
    '</ram:SpecifiedTradeAllowanceCharge>',
  ].join('')).join('');

  const paymentMeans = issuer.iban
    ? [
        '<ram:SpecifiedTradeSettlementPaymentMeans>',
        // UNTDID 4461: 58 = SEPA-Überweisung
        '<ram:TypeCode>58</ram:TypeCode>',
        '<ram:PayeePartyCreditorFinancialAccount>',
        `<ram:IBANID>${esc(compactId(issuer.iban))}</ram:IBANID>`,
        issuer.bank ? `<ram:AccountName>${esc(issuer.bank)}</ram:AccountName>` : '',
        '</ram:PayeePartyCreditorFinancialAccount>',
        issuer.bic
          ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(compactId(issuer.bic))}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>`
          : '',
        '</ram:SpecifiedTradeSettlementPaymentMeans>',
      ].filter(Boolean).join('')
    : '';

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rsm:CrossIndustryInvoice xmlns:rsm="${NS.rsm}" xmlns:ram="${NS.ram}" xmlns:udt="${NS.udt}">`,

    '<rsm:ExchangedDocumentContext>',
    `<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${EN16931_GUIDELINE}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>`,
    '</rsm:ExchangedDocumentContext>',

    '<rsm:ExchangedDocument>',
    `<ram:ID>${esc(invoice.number)}</ram:ID>`,
    `<ram:TypeCode>${typeCode}</ram:TypeCode>`,
    dateElement('IssueDateTime', invoice.createdAt),
    invoice.notes ? `<ram:IncludedNote><ram:Content>${esc(invoice.notes)}</ram:Content></ram:IncludedNote>` : '',
    tax.exemptionReason ? `<ram:IncludedNote><ram:Content>${esc(tax.exemptionReason)}</ram:Content></ram:IncludedNote>` : '',
    '</rsm:ExchangedDocument>',

    '<rsm:SupplyChainTradeTransaction>',
    regularItems.map((it, i) => lineItem(it, i, tax)).join(''),

    '<ram:ApplicableHeaderTradeAgreement>',
    sellerParty(issuer),
    buyerParty(customer),
    '</ram:ApplicableHeaderTradeAgreement>',

    '<ram:ApplicableHeaderTradeDelivery>',
    `<ram:ActualDeliverySupplyChainEvent>${dateElement('OccurrenceDateTime', invoice.periodTo)}</ram:ActualDeliverySupplyChainEvent>`,
    '</ram:ApplicableHeaderTradeDelivery>',

    '<ram:ApplicableHeaderTradeSettlement>',
    `<ram:PaymentReference>${esc(invoice.number)}</ram:PaymentReference>`,
    '<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>',
    paymentMeans,
    '<ram:ApplicableTradeTax>',
    `<ram:CalculatedAmount>${amount(invoice.vatAmount)}</ram:CalculatedAmount>`,
    '<ram:TypeCode>VAT</ram:TypeCode>',
    tax.exemptionReason ? `<ram:ExemptionReason>${esc(tax.exemptionReason)}</ram:ExemptionReason>` : '',
    `<ram:BasisAmount>${amount(taxBasis)}</ram:BasisAmount>`,
    `<ram:CategoryCode>${tax.categoryCode}</ram:CategoryCode>`,
    `<ram:RateApplicablePercent>${amount(tax.ratePercent)}</ram:RateApplicablePercent>`,
    '</ram:ApplicableTradeTax>',
    '<ram:BillingSpecifiedPeriod>',
    dateElement('StartDateTime', invoice.periodFrom),
    dateElement('EndDateTime', invoice.periodTo),
    '</ram:BillingSpecifiedPeriod>',
    allowances,
    '<ram:SpecifiedTradePaymentTerms>',
    `<ram:Description>Zahlbar ohne Abzug bis ${new Date(invoice.dueDate).toLocaleDateString('de-DE')}</ram:Description>`,
    dateElement('DueDateDateTime', invoice.dueDate),
    '</ram:SpecifiedTradePaymentTerms>',
    '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    `<ram:LineTotalAmount>${amount(lineTotal)}</ram:LineTotalAmount>`,
    allowanceTotal > 0 ? `<ram:AllowanceTotalAmount>${amount(allowanceTotal)}</ram:AllowanceTotalAmount>` : '',
    `<ram:TaxBasisTotalAmount>${amount(taxBasis)}</ram:TaxBasisTotalAmount>`,
    `<ram:TaxTotalAmount currencyID="EUR">${amount(invoice.vatAmount)}</ram:TaxTotalAmount>`,
    `<ram:GrandTotalAmount>${amount(invoice.total)}</ram:GrandTotalAmount>`,
    `<ram:DuePayableAmount>${amount(invoice.total)}</ram:DuePayableAmount>`,
    '</ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    '</ram:ApplicableHeaderTradeSettlement>',

    '</rsm:SupplyChainTradeTransaction>',
    '</rsm:CrossIndustryInvoice>',
  ].filter(Boolean).join('');

  return body;
}

/**
 * Prüft die Stammdaten auf Pflichtangaben nach EN 16931.
 * Rückgabe: leere Liste = alles da. Wird in den Einstellungen und im
 * Rechnungs-Modal als Warnung angezeigt.
 */
export function collectEInvoiceIssues(issuer: Issuer, customer?: Customer | null): string[] {
  const issues: string[] = [];

  if (!issuer.name?.trim()) issues.push('Firmenname des Absenders fehlt');
  if (!issuer.street?.trim()) issues.push('Straße des Absenders fehlt');
  if (!issuer.zip?.trim()) issues.push('PLZ des Absenders fehlt');
  if (!issuer.city?.trim()) issues.push('Stadt des Absenders fehlt');
  if (!compactId(issuer.vatId) && !issuer.taxId?.trim()) {
    issues.push('Weder USt-IdNr. noch Steuernummer hinterlegt');
  }
  if (!issuer.iban?.trim()) issues.push('IBAN des Absenders fehlt');

  if (customer) {
    if (!customer.name?.trim()) issues.push('Name des Kunden fehlt');
    if (!customer.street?.trim() && !customer.address?.trim()) issues.push('Straße des Kunden fehlt');
    if (!customer.zip?.trim()) issues.push('PLZ des Kunden fehlt');
    if (!customer.city?.trim()) issues.push('Stadt des Kunden fehlt');
  }

  return issues;
}
