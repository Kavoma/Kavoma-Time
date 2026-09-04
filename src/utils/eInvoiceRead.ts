// ============================================================
// E-Rechnungen lesen
// ============================================================
//
// Seit dem 1. Januar 2025 muss jedes Unternehmen in Deutschland E-Rechnungen
// **empfangen** können — ohne Ausnahme, auch Kleinunternehmer nach § 19 UStG,
// die vom Versand dauerhaft befreit sind (§ 34a UStDV). Empfangen heißt nicht
// „eine Datei entgegennehmen", sondern sie lesen und verarbeiten zu können.
//
// Zwei Syntaxen sind zu erwarten, und beide kommen vor:
//
//   - **CII** (UN/CEFACT Cross Industry Invoice) — das ist ZUGFeRD/Factur-X,
//     meist eingebettet in ein PDF/A-3, und eine der beiden erlaubten
//     XRechnung-Syntaxen.
//   - **UBL** (OASIS Universal Business Language) — die andere erlaubte
//     XRechnung-Syntax, als reine XML-Datei ohne PDF. Im Behördenverkehr die
//     verbreitetere.
//
// Wer nur CII liest, kann die Hälfte der Pflicht nicht erfüllen.
//
// **Ohne XML-Bibliothek.** Der `DOMParser` ist im Renderer vorhanden, und er
// löst keine externen Entitäten auf — das schließt die naheliegende Gefahr
// beim Lesen fremder Dateien (XXE) von vornherein aus. Eine zusätzliche
// Abhängigkeit würde diese Eigenschaft erst wieder aufgeben.
//
// **Gesucht wird über `localName`, nicht über Präfixe.** Ob jemand `ram:`,
// `a:` oder gar kein Präfix schreibt, ist seine Sache; die Namensräume sind
// festgelegt, die Präfixe nicht. Wer auf `ram:Name` prüft, scheitert an der
// ersten Rechnung eines Absenders mit anderer Vorliebe.

/** Grössere Dateien sind keine Rechnung mehr. Schützt vor dem Aufhängen an Datenmüll. */
const MAX_XML_BYTES = 12 * 1024 * 1024;

export type EInvoiceSyntax = 'cii' | 'ubl';

export interface EInvoiceParty {
  name?: string;
  vatId?: string;
  taxId?: string;
  street?: string;
  address2?: string;
  zip?: string;
  city?: string;
  country?: string;
  email?: string;
}

export interface EInvoiceLine {
  lineId?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
  taxPercent?: number;
}

export interface EInvoiceTax {
  categoryCode?: string;
  ratePercent?: number;
  basisAmount?: number;
  taxAmount?: number;
  exemptionReason?: string;
}

export interface ParsedEInvoice {
  syntax: EInvoiceSyntax;
  /** Kennung der Profil-Richtlinie, z. B. `urn:cen.eu:en16931:2017`. */
  profile?: string;
  profileLabel?: string;
  /** UNTDID 1001, z. B. 380 = Rechnung, 381 = Gutschrift, 384 = Korrektur. */
  documentTypeCode?: string;
  documentTypeLabel?: string;
  isCreditNote: boolean;
  number?: string;
  issueDate?: number;
  dueDate?: number;
  currency: string;
  seller: EInvoiceParty;
  buyer: EInvoiceParty;
  /** Leitweg-ID im Behördenverkehr. */
  buyerReference?: string;
  periodFrom?: number;
  periodTo?: number;
  lines: EInvoiceLine[];
  taxes: EInvoiceTax[];
  lineTotal?: number;
  allowanceTotal?: number;
  chargeTotal?: number;
  taxBasisTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  prepaidAmount?: number;
  duePayable?: number;
  paymentIban?: string;
  paymentBic?: string;
  paymentTerms?: string;
  notes: string[];
  /**
   * Auffälligkeiten, die dem Menschen gezeigt werden. Ausdrücklich **keine**
   * Konformitätsprüfung — dafür bräuchte es die Schematron-Regeln der
   * KoSIT. Hier steht nur, was beim Übernehmen der Daten stören würde.
   */
  warnings: string[];
}

// === Bausteine ==============================================================

/** Direkte Kindelemente mit diesem lokalen Namen. */
function kids(el: Element | null | undefined, name: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (child.localName === name) out.push(child);
  }
  return out;
}

/** Dem Pfad aus lokalen Namen folgen, erstes Treffer-Element. */
function at(el: Element | null | undefined, ...path: string[]): Element | null {
  let cur: Element | null | undefined = el;
  for (const name of path) {
    cur = kids(cur, name)[0];
    if (!cur) return null;
  }
  return cur ?? null;
}

/** Alle Elemente auf dem Pfad — der letzte Schritt darf mehrfach vorkommen. */
function allAt(el: Element | null | undefined, ...path: string[]): Element[] {
  const last = path.pop();
  if (!last) return [];
  return kids(at(el, ...path), last);
}

function txt(el: Element | null | undefined, ...path: string[]): string | undefined {
  const found = path.length ? at(el, ...path) : el;
  const value = found?.textContent?.trim();
  return value ? value : undefined;
}

/**
 * Beträge im XML sind immer im englischen Format (Punkt als Dezimaltrenner) —
 * das schreibt das Schema vor. Wer hier `parseFloat` auf einen deutschen
 * Betrag loslässt, liest aus „1.234,56" die Zahl 1,234.
 */
function num(el: Element | null | undefined, ...path: string[]): number | undefined {
  const raw = txt(el, ...path);
  if (raw === undefined) return undefined;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Datum in einen Zeitstempel **in lokaler Zeit**.
 *
 * Bewusst nicht `new Date('2026-09-02')`: Das liest ISO-Datumsstrings als UTC,
 * und westlich von Greenwich landet der Beleg damit einen Tag früher. Ein
 * Rechnungsdatum ist ein Kalendertag, keine Uhrzeit.
 */
function toTimestamp(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime();
}

/** CII: `<udt:DateTimeString format="102">20260902</udt:DateTimeString>`. */
function ciiDate(el: Element | null | undefined, ...path: string[]): number | undefined {
  const holder = path.length ? at(el, ...path) : el;
  if (!holder) return undefined;
  const raw = txt(kids(holder, 'DateTimeString')[0]) ?? txt(holder);
  if (!raw) return undefined;
  const compact = raw.replace(/[^0-9]/g, '');
  if (compact.length >= 8) {
    return toTimestamp(+compact.slice(0, 4), +compact.slice(4, 6), +compact.slice(6, 8));
  }
  return undefined;
}

/** UBL: `<cbc:IssueDate>2026-09-02</cbc:IssueDate>`. */
function ublDate(el: Element | null | undefined, ...path: string[]): number | undefined {
  const raw = txt(el, ...path);
  if (!raw) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return m ? toTimestamp(+m[1], +m[2], +m[3]) : undefined;
}

/**
 * Einheiten-Codes nach UN/ECE Recommendation 20 in etwas Lesbares.
 * Unbekanntes wird durchgereicht statt verschluckt — ein roher Code sagt mehr
 * als ein leeres Feld.
 */
const UNITS: Record<string, string> = {
  HUR: 'Std.', DAY: 'Tage', MON: 'Monate', ANN: 'Jahre', WEE: 'Wochen',
  C62: 'Stk.', H87: 'Stk.', EA: 'Stk.', NAR: 'Stk.', PCE: 'Stk.',
  KMT: 'km', MTR: 'm', MTK: 'm²', MTQ: 'm³', LTR: 'l',
  KGM: 'kg', GRM: 'g', TNE: 't', SET: 'Satz', P1: '%',
  MIN: 'Min.', SEC: 'Sek.', E48: 'Dienstleistung',
};

export function unitLabel(code?: string): string | undefined {
  if (!code) return undefined;
  return UNITS[code.toUpperCase()] ?? code;
}

/** UNTDID 1001 — die Codes, die in der Praxis vorkommen. */
const DOC_TYPES: Record<string, string> = {
  '80': 'Belastungsanzeige',
  '82': 'Gebührenrechnung',
  '84': 'Korrigierte Rechnung',
  '325': 'Vorausrechnung',
  '326': 'Teilrechnung',
  '380': 'Rechnung',
  '381': 'Gutschrift',
  '383': 'Belastungsanzeige',
  '384': 'Rechnungskorrektur',
  '386': 'Vorauszahlungsrechnung',
  '389': 'Selbstfakturierte Rechnung',
  '875': 'Abschlagsrechnung (Bau)',
  '876': 'Teilschlussrechnung (Bau)',
  '877': 'Schlussrechnung (Bau)',
};

/** Die Profil-Kennungen, denen man in Deutschland begegnet. */
function profileLabelFor(id?: string): string | undefined {
  if (!id) return undefined;
  const v = id.toLowerCase();
  if (v.includes('xrechnung')) return 'XRechnung';
  if (v.includes('extended')) return 'ZUGFeRD EXTENDED';
  if (v.includes('en16931')) return 'EN 16931 (Comfort)';
  if (v.includes('basicwl')) return 'ZUGFeRD BASIC WL — ohne Positionen';
  if (v.includes('basic')) return 'ZUGFeRD BASIC';
  if (v.includes('minimum')) return 'ZUGFeRD MINIMUM — nur Summen';
  return undefined;
}

/** Steuerkategorie nach UNTDID 5305. */
export function taxCategoryLabel(code?: string): string | undefined {
  switch ((code ?? '').toUpperCase()) {
    case 'S': return 'Regelsatz';
    case 'Z': return 'Nullsatz';
    case 'E': return 'steuerbefreit';
    case 'AE': return 'Reverse Charge';
    case 'K': return 'innergemeinschaftliche Lieferung';
    case 'G': return 'Ausfuhrlieferung';
    case 'O': return 'nicht steuerbar';
    case 'L': return 'Kanarische Inseln (IGIC)';
    case 'M': return 'Ceuta und Melilla (IPSI)';
    default: return undefined;
  }
}

function compact(v?: string): string | undefined {
  const s = v?.replace(/\s+/g, '').toUpperCase();
  return s ? s : undefined;
}

// === CII ====================================================================

function partyFromCii(el: Element | null): EInvoiceParty {
  const addr = at(el, 'PostalTradeAddress');
  const party: EInvoiceParty = {
    name: txt(el, 'Name'),
    street: txt(addr, 'LineOne'),
    address2: txt(addr, 'LineTwo'),
    zip: txt(addr, 'PostcodeCode'),
    city: txt(addr, 'CityName'),
    country: txt(addr, 'CountryID'),
    email: txt(el, 'URIUniversalCommunication', 'URIID'),
  };
  // `schemeID` unterscheidet USt-IdNr. (VA) von Steuernummer (FC).
  for (const reg of kids(el, 'SpecifiedTaxRegistration')) {
    const id = kids(reg, 'ID')[0];
    const scheme = id?.getAttribute('schemeID')?.toUpperCase();
    const value = txt(id);
    if (!value) continue;
    if (scheme === 'VA') party.vatId = compact(value);
    else if (scheme === 'FC') party.taxId = value;
  }
  return party;
}

function parseCii(root: Element): ParsedEInvoice {
  const doc = at(root, 'ExchangedDocument');
  const tx = at(root, 'SupplyChainTradeTransaction');
  const agreement = at(tx, 'ApplicableHeaderTradeAgreement');
  const delivery = at(tx, 'ApplicableHeaderTradeDelivery');
  const settlement = at(tx, 'ApplicableHeaderTradeSettlement');
  const totals = at(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');

  const profile = txt(
    at(root, 'ExchangedDocumentContext', 'GuidelineSpecifiedDocumentContextParameter'), 'ID',
  );
  const typeCode = txt(doc, 'TypeCode');

  const lines: EInvoiceLine[] = kids(tx, 'IncludedSupplyChainTradeLineItem').map((li) => {
    const qtyEl = at(li, 'SpecifiedLineTradeDelivery', 'BilledQuantity');
    return {
      lineId: txt(li, 'AssociatedDocumentLineDocument', 'LineID'),
      name: txt(li, 'SpecifiedTradeProduct', 'Name'),
      quantity: num(qtyEl),
      unit: unitLabel(qtyEl?.getAttribute('unitCode') ?? undefined),
      unitPrice: num(li, 'SpecifiedLineTradeAgreement', 'NetPriceProductTradePrice', 'ChargeAmount'),
      lineTotal: num(li, 'SpecifiedLineTradeSettlement', 'SpecifiedTradeSettlementLineMonetarySummation', 'LineTotalAmount'),
      taxPercent: num(li, 'SpecifiedLineTradeSettlement', 'ApplicableTradeTax', 'RateApplicablePercent'),
    };
  });

  const taxes: EInvoiceTax[] = kids(settlement, 'ApplicableTradeTax').map((t) => ({
    categoryCode: txt(t, 'CategoryCode'),
    ratePercent: num(t, 'RateApplicablePercent'),
    basisAmount: num(t, 'BasisAmount'),
    taxAmount: num(t, 'CalculatedAmount'),
    exemptionReason: txt(t, 'ExemptionReason'),
  }));

  // Abschläge und Zuschläge auf Kopfebene trennt der ChargeIndicator.
  let allowanceTotal = num(totals, 'AllowanceTotalAmount');
  let chargeTotal = num(totals, 'ChargeTotalAmount');
  if (allowanceTotal === undefined || chargeTotal === undefined) {
    let ab = 0;
    let zu = 0;
    for (const ac of kids(settlement, 'SpecifiedTradeAllowanceCharge')) {
      const istZuschlag = (txt(ac, 'ChargeIndicator', 'Indicator') ?? '').toLowerCase() === 'true';
      const betrag = num(ac, 'ActualAmount') ?? 0;
      if (istZuschlag) zu += betrag; else ab += betrag;
    }
    if (allowanceTotal === undefined && ab > 0) allowanceTotal = Number(ab.toFixed(2));
    if (chargeTotal === undefined && zu > 0) chargeTotal = Number(zu.toFixed(2));
  }

  const period = at(settlement, 'BillingSpecifiedPeriod');
  const account = at(settlement, 'SpecifiedTradeSettlementPaymentMeans', 'PayeePartyCreditorFinancialAccount');

  const notes = kids(doc, 'IncludedNote')
    .map((n) => txt(n, 'Content'))
    .filter((v): v is string => Boolean(v));

  return {
    syntax: 'cii',
    profile,
    profileLabel: profileLabelFor(profile),
    documentTypeCode: typeCode,
    documentTypeLabel: typeCode ? DOC_TYPES[typeCode] : undefined,
    isCreditNote: typeCode === '381',
    number: txt(doc, 'ID'),
    issueDate: ciiDate(doc, 'IssueDateTime'),
    dueDate: ciiDate(settlement, 'SpecifiedTradePaymentTerms', 'DueDateDateTime'),
    currency: txt(settlement, 'InvoiceCurrencyCode') ?? 'EUR',
    seller: partyFromCii(at(agreement, 'SellerTradeParty')),
    buyer: partyFromCii(at(agreement, 'BuyerTradeParty')),
    buyerReference: txt(agreement, 'BuyerReference'),
    periodFrom: ciiDate(period, 'StartDateTime'),
    periodTo: ciiDate(period, 'EndDateTime')
      ?? ciiDate(delivery, 'ActualDeliverySupplyChainEvent', 'OccurrenceDateTime'),
    lines,
    taxes,
    lineTotal: num(totals, 'LineTotalAmount'),
    allowanceTotal,
    chargeTotal,
    taxBasisTotal: num(totals, 'TaxBasisTotalAmount'),
    taxTotal: num(totals, 'TaxTotalAmount'),
    grandTotal: num(totals, 'GrandTotalAmount'),
    prepaidAmount: num(totals, 'TotalPrepaidAmount'),
    duePayable: num(totals, 'DuePayableAmount'),
    paymentIban: compact(txt(account, 'IBANID')),
    paymentBic: compact(txt(
      at(settlement, 'SpecifiedTradeSettlementPaymentMeans', 'PayeeSpecifiedCreditorFinancialInstitution'), 'BICID',
    )),
    paymentTerms: txt(settlement, 'SpecifiedTradePaymentTerms', 'Description'),
    notes,
    warnings: [],
  };
}

// === UBL ====================================================================

function partyFromUbl(el: Element | null): EInvoiceParty {
  const addr = at(el, 'PostalAddress');
  const party: EInvoiceParty = {
    // Der Handelsname steht unter PartyName, der eingetragene unter
    // PartyLegalEntity. Fehlt der eine, ist der andere besser als nichts.
    name: txt(el, 'PartyName', 'Name') ?? txt(el, 'PartyLegalEntity', 'RegistrationName'),
    street: txt(addr, 'StreetName'),
    address2: txt(addr, 'AdditionalStreetName'),
    zip: txt(addr, 'PostalZone'),
    city: txt(addr, 'CityName'),
    country: txt(addr, 'Country', 'IdentificationCode'),
    email: txt(el, 'Contact', 'ElectronicMail') ?? txt(el, 'EndpointID'),
  };
  for (const scheme of kids(el, 'PartyTaxScheme')) {
    const id = txt(scheme, 'CompanyID');
    if (!id) continue;
    const schemeId = (txt(scheme, 'TaxScheme', 'ID') ?? '').toUpperCase();
    // `VAT` ist die USt-IdNr.; alles andere (typisch `FC`) die Steuernummer.
    if (schemeId === 'VAT') party.vatId = compact(id);
    else party.taxId = id;
  }
  return party;
}

function parseUbl(root: Element, isCreditNoteRoot: boolean): ParsedEInvoice {
  const profile = txt(root, 'CustomizationID');
  const typeCode = txt(root, 'InvoiceTypeCode') ?? txt(root, 'CreditNoteTypeCode');

  const lineTag = isCreditNoteRoot ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = isCreditNoteRoot ? 'CreditedQuantity' : 'InvoicedQuantity';

  const lines: EInvoiceLine[] = kids(root, lineTag).map((li) => {
    const qtyEl = at(li, qtyTag);
    return {
      lineId: txt(li, 'ID'),
      name: txt(li, 'Item', 'Name'),
      quantity: num(qtyEl),
      unit: unitLabel(qtyEl?.getAttribute('unitCode') ?? undefined),
      unitPrice: num(li, 'Price', 'PriceAmount'),
      lineTotal: num(li, 'LineExtensionAmount'),
      taxPercent: num(li, 'Item', 'ClassifiedTaxCategory', 'Percent'),
    };
  });

  const taxes: EInvoiceTax[] = allAt(root, 'TaxTotal', 'TaxSubtotal').map((t) => ({
    categoryCode: txt(t, 'TaxCategory', 'ID'),
    ratePercent: num(t, 'TaxCategory', 'Percent'),
    basisAmount: num(t, 'TaxableAmount'),
    taxAmount: num(t, 'TaxAmount'),
    exemptionReason: txt(t, 'TaxCategory', 'TaxExemptionReason'),
  }));

  const totals = at(root, 'LegalMonetaryTotal');
  const account = at(root, 'PaymentMeans', 'PayeeFinancialAccount');
  const period = at(root, 'InvoicePeriod');

  const notes = kids(root, 'Note')
    .map((n) => txt(n))
    .filter((v): v is string => Boolean(v));

  return {
    syntax: 'ubl',
    profile,
    profileLabel: profileLabelFor(profile),
    documentTypeCode: typeCode,
    documentTypeLabel: typeCode ? DOC_TYPES[typeCode] : undefined,
    // Ein CreditNote-Wurzelelement ist immer eine Gutschrift, unabhängig vom Code.
    isCreditNote: isCreditNoteRoot || typeCode === '381',
    number: txt(root, 'ID'),
    issueDate: ublDate(root, 'IssueDate'),
    dueDate: ublDate(root, 'DueDate') ?? ublDate(at(root, 'PaymentMeans'), 'PaymentDueDate'),
    currency: txt(root, 'DocumentCurrencyCode') ?? 'EUR',
    seller: partyFromUbl(at(root, 'AccountingSupplierParty', 'Party')),
    buyer: partyFromUbl(at(root, 'AccountingCustomerParty', 'Party')),
    buyerReference: txt(root, 'BuyerReference'),
    periodFrom: ublDate(period, 'StartDate'),
    periodTo: ublDate(period, 'EndDate'),
    lines,
    taxes,
    lineTotal: num(totals, 'LineExtensionAmount'),
    allowanceTotal: num(totals, 'AllowanceTotalAmount'),
    chargeTotal: num(totals, 'ChargeTotalAmount'),
    taxBasisTotal: num(totals, 'TaxExclusiveAmount'),
    taxTotal: num(at(root, 'TaxTotal'), 'TaxAmount'),
    grandTotal: num(totals, 'TaxInclusiveAmount'),
    prepaidAmount: num(totals, 'PrepaidAmount'),
    duePayable: num(totals, 'PayableAmount'),
    paymentIban: compact(txt(account, 'ID')),
    paymentBic: compact(txt(account, 'FinancialInstitutionBranch', 'ID')),
    paymentTerms: txt(root, 'PaymentTerms', 'Note'),
    notes,
    warnings: [],
  };
}

// === Einstieg ===============================================================

export class EInvoiceParseError extends Error {}

/**
 * Erkennt an der Wurzel, ob überhaupt eine E-Rechnung vorliegt — ohne zu
 * parsen. Für die schnelle Entscheidung „ist das hier eine?".
 */
export function looksLikeEInvoice(xml: string): boolean {
  return /<([A-Za-z0-9_.-]+:)?(CrossIndustryInvoice|Invoice|CreditNote)[\s>]/.test(xml);
}

/**
 * Liest eine E-Rechnung aus XML.
 *
 * Wirft bei allem, was keine ist. Fehlende **Einzelfelder** sind dagegen kein
 * Fehler: Die schlanken ZUGFeRD-Profile (MINIMUM, BASIC WL) enthalten
 * absichtlich keine Positionen, und eine Rechnung ohne Fälligkeitsdatum ist
 * erlaubt. Was fehlt, bleibt `undefined` und wird als solches angezeigt.
 */
export function parseEInvoiceXml(xml: string): ParsedEInvoice {
  if (xml.length > MAX_XML_BYTES) {
    throw new EInvoiceParseError('Die Datei ist zu groß für eine E-Rechnung.');
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // Der DOMParser wirft nicht, er liefert ein Fehlerdokument.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new EInvoiceParseError('Die Datei ist kein gültiges XML.');
  }

  const root = doc.documentElement;
  if (!root) throw new EInvoiceParseError('Die Datei ist leer.');

  let parsed: ParsedEInvoice;
  switch (root.localName) {
    case 'CrossIndustryInvoice':
      parsed = parseCii(root);
      break;
    case 'Invoice':
      parsed = parseUbl(root, false);
      break;
    case 'CreditNote':
      parsed = parseUbl(root, true);
      break;
    default:
      throw new EInvoiceParseError(
        `Das ist keine E-Rechnung — erwartet wurde CrossIndustryInvoice, Invoice oder CreditNote, gefunden „${root.localName}".`,
      );
  }

  parsed.warnings = collectWarnings(parsed);
  return parsed;
}

/**
 * Was einem Menschen auffallen sollte, bevor er die Zahlen übernimmt.
 *
 * Ausdrücklich **keine Konformitätsprüfung**: Die vollständigen Regeln der
 * EN 16931 stecken in den Schematron-Dateien der KoSIT und sind ein eigenes
 * Vorhaben. Hier steht nur, was beim Übernehmen stören würde — und lieber eine
 * Warnung zu wenig als eine falsche.
 */
function collectWarnings(inv: ParsedEInvoice): string[] {
  const w: string[] = [];

  if (!inv.number) w.push('Die Rechnung trägt keine Rechnungsnummer.');
  if (inv.issueDate === undefined) w.push('Kein Rechnungsdatum gefunden.');
  if (!inv.seller.name) w.push('Kein Name des Rechnungsstellers gefunden.');
  if (inv.grandTotal === undefined) w.push('Kein Bruttobetrag gefunden.');

  if (inv.currency !== 'EUR') {
    w.push(`Die Rechnung ist in ${inv.currency} ausgestellt. Kavoma Time rechnet in Euro — der Betrag wird unverändert übernommen und ist damit nicht der Euro-Betrag.`);
  }

  // Die Summenprobe deckt vertauschte oder falsch gelesene Felder auf. Ein
  // Cent Abweichung ist Rundung, alles darüber ist ein Befund.
  const { taxBasisTotal, taxTotal, grandTotal } = inv;
  if (taxBasisTotal !== undefined && taxTotal !== undefined && grandTotal !== undefined) {
    const abweichung = Math.abs(taxBasisTotal + taxTotal - grandTotal);
    if (abweichung > 0.01) {
      w.push(`Die Summen gehen nicht auf: Netto ${taxBasisTotal.toFixed(2)} + USt ${taxTotal.toFixed(2)} ergibt nicht ${grandTotal.toFixed(2)}.`);
    }
  }

  if (inv.isCreditNote) {
    w.push('Das ist eine Gutschrift, keine Rechnung. Der Betrag mindert deine Ausgaben, statt sie zu erhöhen.');
  }

  if (inv.lines.length === 0 && inv.grandTotal !== undefined) {
    w.push('Die Rechnung enthält keine Einzelpositionen — das ist bei den Profilen MINIMUM und BASIC WL normal.');
  }

  return w;
}
