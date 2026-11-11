// Z3-Datenexport — Datenträgerüberlassung nach dem Beschreibungsstandard der
// Finanzverwaltung (GDPdU/GoBD).
//
// Bei einer digitalen Betriebsprüfung ist Z3 der Regelfall: Der Prüfer nimmt
// die Daten mit und wertet sie in seiner eigenen Software aus (in aller Regel
// IDEA). Damit das ohne Rückfragen geht, liegt neben den CSV-Dateien eine
// `index.xml`, die jede Tabelle, jede Spalte und jedes Format beschreibt.
//
// **Wozu das gut ist.** Ohne solchen Export bleibt nur der Ausdruck — und dann
// darf der Prüfer schätzen. Eine Schätzung fällt selten zugunsten des
// Geschätzten aus.
//
// **Zwei Entscheidungen, die auffallen könnten:**
//
// - **Die CSV-Dateien haben keine Kopfzeile.** Die Spaltennamen stehen in der
//   `index.xml`; das ist ihr Zweck. Eine zusätzliche Kopfzeile müsste dort
//   angekündigt werden, sonst liest der Prüfer die Überschrift als ersten
//   Datensatz — einen Beleg „Rechnungsnummer" hat noch keine Prüfung gern
//   gesehen.
// - **Windows-1252 statt UTF-8.** Die Prüfsoftware liest ANSI. In UTF-8 käme
//   „Bürostühle" als „BÃ¼rostÃ¼hle" an, und der Prüfer sähe einen Datenbestand,
//   der beschädigt aussieht.

import { toWindows1252 } from './datevExport';
import { ustAnteil } from './payments';
import type {
  Customer,
  Invoice,
  Issuer,
  Payment,
  Project,
  TimeEntry,
  VendorInvoice,
  VendorInvoiceCategory,
} from '../types';

export interface Z3Datei {
  name: string;
  bytes: Uint8Array;
}

export interface Z3ExportInput {
  jahr: number;
  issuer: Issuer;
  customers: Customer[];
  projects: Project[];
  entries: TimeEntry[];
  invoices: Invoice[];
  vendorInvoices: VendorInvoice[];
}

export interface Z3ExportResult {
  dateien: Z3Datei[];
  /** Zeilen je Tabelle — die Oberfläche sagt damit, was mitgeht. */
  zeilen: Record<string, number>;
}

const ZAHLWEG_LABEL: Record<NonNullable<Payment['method']>, string> = {
  transfer: 'Ueberweisung',
  cash: 'Bar',
  card: 'Karte',
  other: 'Sonstiges',
};

const KATEGORIE_LABEL: Record<VendorInvoiceCategory, string> = {
  hardware: 'Hardware',
  software: 'Software',
  office: 'Büro',
  travel: 'Reise',
  service: 'Dienstleistung',
  other: 'Sonstiges',
};

// === Spaltenbeschreibung =======================================

type SpaltenTyp =
  | { art: 'text'; maxLaenge?: number }
  | { art: 'zahl'; nachkomma: number }
  | { art: 'datum' };

interface Spalte {
  name: string;
  beschreibung: string;
  typ: SpaltenTyp;
  /** Primärschlüssel — höchstens einer je Tabelle. */
  schluessel?: boolean;
}

interface Tabelle {
  datei: string;
  name: string;
  beschreibung: string;
  spalten: Spalte[];
  zeilen: string[][];
}

const text = (maxLaenge?: number): SpaltenTyp => ({ art: 'text', maxLaenge });
const zahl = (nachkomma = 2): SpaltenTyp => ({ art: 'zahl', nachkomma });
const datum = (): SpaltenTyp => ({ art: 'datum' });

// === Werte formatieren =========================================

const zwei = (n: number) => String(n).padStart(2, '0');

/**
 * Datum als JJJJ-MM-TT aus den Kalenderfeldern der lokalen Zeitzone. Über
 * `toISOString()` wäre es UTC — ein Beleg vom 1. Januar 00:30 rutschte damit
 * ins Vorjahr und fehlte in der geprüften Periode.
 */
export function z3Datum(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

function z3Zahl(value: number, nachkomma: number): string {
  return value.toFixed(nachkomma).replace('.', ',');
}

/**
 * CSV nach dem, was die `index.xml` ankündigt: Semikolon trennt, Text steht in
 * Anführungszeichen. Zeilenumbrüche in einem Feld werden zu Leerzeichen —
 * eingerahmt wären sie zwar zulässig, aber nicht jede Prüfsoftware kommt damit
 * zurecht, und eine Notiz ist die Mühe nicht wert.
 */
function csvFeld(value: string): string {
  return `"${value.replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`;
}

function csvZeile(werte: readonly string[]): string {
  return werte.map(csvFeld).join(';');
}

function tabelleZuCsv(t: Tabelle): string {
  // CRLF, weil die index.xml genau das als Satztrenner ankündigt.
  return t.zeilen.map(csvZeile).join('\r\n') + (t.zeilen.length ? '\r\n' : '');
}

// === index.xml =================================================

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function spaltenXml(s: Spalte, einzug: string): string {
  const tag = s.schluessel ? 'VariablePrimaryKey' : 'VariableColumn';
  const typ =
    s.typ.art === 'zahl'
      ? `<Numeric><Accuracy>${s.typ.nachkomma}</Accuracy></Numeric>`
      : s.typ.art === 'datum'
        ? '<Date><Format>YYYY-MM-DD</Format></Date>'
        : s.typ.maxLaenge
          ? `<AlphaNumeric><MaxLength>${s.typ.maxLaenge}</MaxLength></AlphaNumeric>`
          : '<AlphaNumeric/>';
  return [
    `${einzug}<${tag}>`,
    `${einzug}  <Name>${xmlEscape(s.name)}</Name>`,
    `${einzug}  <Description>${xmlEscape(s.beschreibung)}</Description>`,
    `${einzug}  ${typ}`,
    `${einzug}</${tag}>`,
  ].join('\n');
}

function tabelleXml(t: Tabelle, jahr: number): string {
  // Der Primärschlüssel muss vor den übrigen Spalten stehen, die Reihenfolge
  // danach ist die Reihenfolge in der Datei.
  const sortiert = [...t.spalten].sort(
    (a, b) => Number(Boolean(b.schluessel)) - Number(Boolean(a.schluessel)),
  );
  return [
    '    <Table>',
    `      <URL>${xmlEscape(t.datei)}</URL>`,
    `      <Name>${xmlEscape(t.name)}</Name>`,
    `      <Description>${xmlEscape(t.beschreibung)}</Description>`,
    '      <Validity>',
    `        <Range><From>${jahr}-01-01</From><To>${jahr}-12-31</To></Range>`,
    '        <Format>YYYY-MM-DD</Format>',
    '      </Validity>',
    '      <DecimalSymbol>,</DecimalSymbol>',
    '      <DigitGroupingSymbol>.</DigitGroupingSymbol>',
    '      <VariableLength>',
    '        <ColumnDelimiter>;</ColumnDelimiter>',
    '        <RecordDelimiter>&#13;&#10;</RecordDelimiter>',
    '        <TextEncapsulator>&quot;</TextEncapsulator>',
    ...sortiert.map((s) => spaltenXml(s, '        ')),
    '      </VariableLength>',
    '    </Table>',
  ].join('\n');
}

export const DTD_DATEINAME = 'gdpdu-01-09-2004.dtd';

function indexXml(tabellen: Tabelle[], input: Z3ExportInput): string {
  const { issuer, jahr } = input;
  const ort = [issuer.zip, issuer.city].filter(Boolean).join(' ');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!DOCTYPE DataSet SYSTEM "${DTD_DATEINAME}">`,
    '<DataSet>',
    '  <Version>1.0</Version>',
    '  <DataSupplier>',
    `    <Name>${xmlEscape(issuer.name)}</Name>`,
    `    <Location>${xmlEscape(ort)}</Location>`,
    `    <Comment>Steuernummer ${xmlEscape(issuer.taxId || 'nicht angegeben')}` +
      ` — Datenträgerüberlassung (Z3) für ${jahr}, erzeugt mit Kavoma Time</Comment>`,
    '  </DataSupplier>',
    '  <Media>',
    `    <Name>Kavoma Time ${jahr}</Name>`,
    ...tabellen.map((t) => tabelleXml(t, jahr)),
    '  </Media>',
    '</DataSet>',
    '',
  ].join('\n');
}

/**
 * Die Dokumenttyp-Definition zur `index.xml`.
 *
 * Das ist ein **Nachbau**, der genau die Elemente beschreibt, die dieser
 * Export schreibt — nicht die amtliche Datei im vollen Umfang. Sie liegt bei,
 * weil eine `index.xml` mit `SYSTEM`-Verweis ins Leere sonst bei manchen
 * Prüfprogrammen gar nicht erst aufgeht. Wer die amtliche Fassung braucht,
 * ersetzt die Datei; das Format der `index.xml` ändert sich dadurch nicht.
 */
export const DTD_INHALT = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Beschreibungsstandard fuer die Datentraegerueberlassung.
     Nachbau, beschraenkt auf die von Kavoma Time erzeugten Elemente. -->
<!ELEMENT DataSet (Version, DataSupplier?, Media+)>
<!ELEMENT Version (#PCDATA)>
<!ELEMENT DataSupplier (Name, Location?, Comment?)>
<!ELEMENT Media (Name, Table+)>
<!ELEMENT Table (URL, Name, Description?, Validity?, DecimalSymbol?,
                 DigitGroupingSymbol?, VariableLength)>
<!ELEMENT URL (#PCDATA)>
<!ELEMENT Name (#PCDATA)>
<!ELEMENT Location (#PCDATA)>
<!ELEMENT Comment (#PCDATA)>
<!ELEMENT Description (#PCDATA)>
<!ELEMENT Validity (Range, Format?)>
<!ELEMENT Range (From, To?)>
<!ELEMENT From (#PCDATA)>
<!ELEMENT To (#PCDATA)>
<!ELEMENT Format (#PCDATA)>
<!ELEMENT DecimalSymbol (#PCDATA)>
<!ELEMENT DigitGroupingSymbol (#PCDATA)>
<!ELEMENT VariableLength (ColumnDelimiter, RecordDelimiter, TextEncapsulator,
                          VariablePrimaryKey*, VariableColumn*)>
<!ELEMENT ColumnDelimiter (#PCDATA)>
<!ELEMENT RecordDelimiter (#PCDATA)>
<!ELEMENT TextEncapsulator (#PCDATA)>
<!ELEMENT VariablePrimaryKey (Name, Description?, (AlphaNumeric | Numeric | Date))>
<!ELEMENT VariableColumn (Name, Description?, (AlphaNumeric | Numeric | Date))>
<!ELEMENT AlphaNumeric (MaxLength?)>
<!ELEMENT MaxLength (#PCDATA)>
<!ELEMENT Numeric (Accuracy?)>
<!ELEMENT Accuracy (#PCDATA)>
<!ELEMENT Date (Format?)>
`;

// === Die Tabellen ==============================================

const imJahr = (ts: number, jahr: number) => new Date(ts).getFullYear() === jahr;

function tabellen(input: Z3ExportInput): Tabelle[] {
  const { jahr, customers, projects, entries, invoices, vendorInvoices } = input;
  const kundeVon = new Map(customers.map((c) => [c.id, c]));
  const projektVon = new Map(projects.map((p) => [p.id, p]));

  // Nur festgeschriebene Rechnungen sind Belege. Entwürfe tragen keine Nummer
  // und gehören nicht in eine Prüfung — sie würden dort als Umsatz gelesen,
  // den es nie gab. Stornierte bleiben mit ihrem Status drin: Sie zu
  // verschweigen wäre genau die Lücke, die eine Prüfung sucht.
  const rechnungen = invoices
    .filter((i) => i.status !== 'draft' && imJahr(i.createdAt, jahr))
    .sort((a, b) => a.createdAt - b.createdAt);

  const rechnungenTab: Tabelle = {
    datei: 'rechnungen.csv',
    name: 'Ausgangsrechnungen',
    beschreibung: `Ausgangsrechnungen ${jahr}, Kopfdaten`,
    spalten: [
      { name: 'Rechnungsnummer', beschreibung: 'Fortlaufende Rechnungsnummer', typ: text(40), schluessel: true },
      { name: 'Rechnungsdatum', beschreibung: 'Datum der Rechnungsstellung', typ: datum() },
      { name: 'Leistungszeitraum von', beschreibung: 'Beginn des Leistungszeitraums', typ: datum() },
      { name: 'Leistungszeitraum bis', beschreibung: 'Ende des Leistungszeitraums', typ: datum() },
      { name: 'Faelligkeit', beschreibung: 'Zahlungsziel', typ: datum() },
      { name: 'Debitorennummer', beschreibung: 'Konto des Rechnungsempfaengers', typ: text(20) },
      { name: 'Kunde', beschreibung: 'Name des Rechnungsempfaengers', typ: text(120) },
      { name: 'Nettobetrag', beschreibung: 'Summe ohne Umsatzsteuer in EUR', typ: zahl() },
      { name: 'Steuersatz', beschreibung: 'Umsatzsteuersatz in Prozent', typ: zahl() },
      { name: 'Steuerbetrag', beschreibung: 'Umsatzsteuer in EUR', typ: zahl() },
      { name: 'Bruttobetrag', beschreibung: 'Rechnungsbetrag in EUR', typ: zahl() },
      { name: 'Status', beschreibung: 'aktiv oder storniert', typ: text(20) },
      { name: 'Storniert am', beschreibung: 'Datum der Stornierung, sonst leer', typ: datum() },
      { name: 'Storniert durch', beschreibung: 'Nummer der Stornorechnung, sonst leer', typ: text(40) },
      { name: 'Storno zu', beschreibung: 'Nummer der aufgehobenen Rechnung, sonst leer', typ: text(40) },
      { name: 'Bezahlt', beschreibung: 'ja oder nein', typ: text(4) },
      { name: 'Bezahlt am', beschreibung: 'Datum des Zahlungseingangs, sonst leer', typ: datum() },
    ],
    zeilen: rechnungen.map((i) => {
      const kunde = kundeVon.get(i.customerId);
      const storno = i.cancelledByInvoiceId
        ? invoices.find((x) => x.id === i.cancelledByInvoiceId)
        : undefined;
      // Die Spur muss in beide Richtungen lesbar sein: Wer bei der
      // Storno-Rechnung landet, soll die aufgehobene finden, ohne im ganzen
      // Bestand danach zu suchen.
      const hebtAuf = i.cancelsInvoiceId
        ? invoices.find((x) => x.id === i.cancelsInvoiceId)
        : undefined;
      return [
        i.number,
        z3Datum(i.createdAt),
        z3Datum(i.periodFrom),
        z3Datum(i.periodTo),
        z3Datum(i.dueDate),
        kunde?.debtorNumber ?? '',
        kunde?.name ?? '',
        z3Zahl(i.subtotal, 2),
        z3Zahl(i.vatRate, 2),
        z3Zahl(i.vatAmount, 2),
        z3Zahl(i.total, 2),
        i.status === 'cancelled' ? 'storniert' : 'aktiv',
        i.cancelledAt ? z3Datum(i.cancelledAt) : '',
        storno?.number ?? '',
        hebtAuf?.number ?? '',
        i.paid ? 'ja' : 'nein',
        i.paidAt ? z3Datum(i.paidAt) : '',
      ];
    }),
  };

  const positionenTab: Tabelle = {
    datei: 'rechnungspositionen.csv',
    name: 'Rechnungspositionen',
    beschreibung: `Einzelpositionen der Ausgangsrechnungen ${jahr}`,
    spalten: [
      { name: 'Rechnungsnummer', beschreibung: 'Verweis auf Ausgangsrechnungen', typ: text(40) },
      { name: 'Position', beschreibung: 'Laufende Nummer innerhalb der Rechnung', typ: zahl(0) },
      { name: 'Beschreibung', beschreibung: 'Leistungsbeschreibung', typ: text(400) },
      { name: 'Menge', beschreibung: 'Stunden, Stueck oder Prozent', typ: zahl(2) },
      { name: 'Einheit', beschreibung: 'Mengeneinheit', typ: text(20) },
      { name: 'Einzelpreis', beschreibung: 'Preis je Einheit in EUR', typ: zahl() },
      { name: 'Gesamtpreis', beschreibung: 'Positionssumme netto in EUR', typ: zahl() },
    ],
    zeilen: rechnungen.flatMap((i) =>
      i.items.map((p, idx) => [
        i.number,
        String(idx + 1),
        p.description,
        z3Zahl(p.quantity, 2),
        p.unit,
        z3Zahl(p.unitPrice, 2),
        z3Zahl(p.total, 2),
      ]),
    ),
  };

  const belege = vendorInvoices
    .filter((v) => imJahr(v.invoiceDate, jahr))
    .sort((a, b) => a.invoiceDate - b.invoiceDate);

  const belegeTab: Tabelle = {
    datei: 'eingangsrechnungen.csv',
    name: 'Eingangsrechnungen',
    beschreibung: `Eingangsrechnungen ${jahr}`,
    spalten: [
      { name: 'Belegnummer', beschreibung: 'Interne laufende Nummer', typ: text(20), schluessel: true },
      { name: 'Belegdatum', beschreibung: 'Datum der Lieferantenrechnung', typ: datum() },
      { name: 'Lieferant', beschreibung: 'Name des Rechnungsstellers', typ: text(120) },
      { name: 'Rechnungsnummer', beschreibung: 'Nummer beim Lieferanten', typ: text(60) },
      { name: 'Kategorie', beschreibung: 'Aufwandsart', typ: text(30) },
      { name: 'Nettobetrag', beschreibung: 'Betrag ohne Vorsteuer in EUR', typ: zahl() },
      { name: 'Steuerbetrag', beschreibung: 'Abziehbare Vorsteuer in EUR', typ: zahl() },
      { name: 'Bruttobetrag', beschreibung: 'Rechnungsbetrag in EUR', typ: zahl() },
      { name: 'Herkunft', beschreibung: 'E-Rechnung oder Handerfassung', typ: text(30) },
      { name: 'Notiz', beschreibung: 'Freitext', typ: text(400) },
    ],
    zeilen: belege.map((v) => {
      const ust = v.vatAmount ?? 0;
      return [
        String(v.id),
        z3Datum(v.invoiceDate),
        v.vendorName,
        v.invoiceNumber ?? '',
        KATEGORIE_LABEL[v.category],
        z3Zahl(v.amountGross - ust, 2),
        z3Zahl(ust, 2),
        z3Zahl(v.amountGross, 2),
        v.eInvoice ? `E-Rechnung (${v.eInvoice.syntax.toUpperCase()})` : 'Handerfassung',
        v.note ?? '',
      ];
    }),
  };

  // Nur Kunden, die im geprüften Jahr vorkommen. Der ganze Stamm wäre mehr,
  // als die Prüfung verlangt — und personenbezogene Daten gibt man nicht
  // großzügiger heraus, als man muss.
  const beteiligt = new Set(rechnungen.map((i) => i.customerId));
  const kundenTab: Tabelle = {
    datei: 'kunden.csv',
    name: 'Debitoren',
    beschreibung: `Rechnungsempfaenger mit Umsatz im Jahr ${jahr}`,
    spalten: [
      { name: 'Debitorennummer', beschreibung: 'Kontonummer des Kunden', typ: text(20), schluessel: true },
      { name: 'Name', beschreibung: 'Firmen- oder Personenname', typ: text(120) },
      { name: 'Strasse', beschreibung: 'Strasse und Hausnummer', typ: text(120) },
      { name: 'PLZ', beschreibung: 'Postleitzahl', typ: text(10) },
      { name: 'Ort', beschreibung: 'Ort', typ: text(80) },
      { name: 'Land', beschreibung: 'Laendercode nach ISO 3166-1 alpha-2', typ: text(2) },
      { name: 'USt-IdNr', beschreibung: 'Umsatzsteuer-Identifikationsnummer', typ: text(20) },
    ],
    zeilen: customers
      .filter((c) => beteiligt.has(c.id))
      .map((c) => [
        c.debtorNumber ?? '',
        c.name,
        c.street ?? c.address ?? '',
        c.zip ?? '',
        c.city ?? '',
        c.country ?? 'DE',
        c.vatId ?? '',
      ]),
  };

  // Die Grundaufzeichnung hinter den Stundenrechnungen. Ohne sie steht in der
  // Rechnung eine Stundenzahl, die durch nichts belegt ist — und genau danach
  // wird gefragt.
  const zeiten = entries
    .filter((e) => e.endedAt !== null && imJahr(e.startedAt, jahr))
    .sort((a, b) => a.startedAt - b.startedAt);

  const zeitenTab: Tabelle = {
    datei: 'zeiterfassung.csv',
    name: 'Leistungsnachweis',
    beschreibung: `Erfasste Arbeitszeiten ${jahr} — Grundaufzeichnung zu den Stundenrechnungen`,
    spalten: [
      { name: 'Nummer', beschreibung: 'Laufende Nummer des Zeiteintrags', typ: text(20), schluessel: true },
      { name: 'Datum', beschreibung: 'Tag der Leistung', typ: datum() },
      { name: 'Beginn', beschreibung: 'Uhrzeit des Beginns', typ: text(5) },
      { name: 'Ende', beschreibung: 'Uhrzeit des Endes', typ: text(5) },
      { name: 'Dauer Stunden', beschreibung: 'Erfasste Dauer in Stunden', typ: zahl(2) },
      { name: 'Kunde', beschreibung: 'Auftraggeber', typ: text(120) },
      { name: 'Projekt', beschreibung: 'Projekt oder Auftrag', typ: text(120) },
      { name: 'Taetigkeit', beschreibung: 'Beschreibung der Leistung', typ: text(400) },
      { name: 'Abgerechnet in', beschreibung: 'Rechnungsnummer, sonst leer', typ: text(40) },
    ],
    zeilen: (() => {
      // Welcher Eintrag in welcher Rechnung gelandet ist — das ist die Brücke
      // zwischen Grundaufzeichnung und Beleg.
      const rechnungZu = new Map<number, string>();
      for (const i of rechnungen) for (const id of i.entryIds) rechnungZu.set(id, i.number);
      const uhr = (ts: number) => {
        const d = new Date(ts);
        return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
      };
      return zeiten.map((e) => [
        String(e.id),
        z3Datum(e.startedAt),
        uhr(e.startedAt),
        e.endedAt ? uhr(e.endedAt) : '',
        z3Zahl(e.durationSeconds / 3600, 2),
        kundeVon.get(e.customerId)?.name ?? '',
        projektVon.get(e.projectId)?.name ?? '',
        e.description,
        rechnungZu.get(e.id) ?? '',
      ]);
    })(),
  };

  // Zahlungseingänge. Ohne sie steht in der Rechnungstabelle „bezahlt: ja",
  // aber nirgends, wann und in welchen Schritten — bei einer Ist-Versteuerung
  // ist genau das die Frage.
  const zahlungenTab: Tabelle = {
    datei: 'zahlungen.csv',
    name: 'Zahlungseingaenge',
    beschreibung: `Zahlungen auf Ausgangsrechnungen, eingegangen ${jahr}`,
    spalten: [
      { name: 'Nummer', beschreibung: 'Laufende Nummer des Zahlungseingangs', typ: text(64), schluessel: true },
      { name: 'Rechnungsnummer', beschreibung: 'Verweis auf Ausgangsrechnungen', typ: text(40) },
      { name: 'Eingegangen am', beschreibung: 'Wertstellung', typ: datum() },
      { name: 'Betrag', beschreibung: 'Zahlbetrag brutto in EUR', typ: zahl() },
      { name: 'Umsatzsteueranteil', beschreibung: 'Anteilige Umsatzsteuer in EUR', typ: zahl() },
      { name: 'Weg', beschreibung: 'Ueberweisung, bar, Karte oder sonstiges', typ: text(20) },
      { name: 'Erfassung', beschreibung: 'erfasst oder erschlossen', typ: text(20) },
      { name: 'Notiz', beschreibung: 'Freitext', typ: text(400) },
    ],
    // Anders als bei den übrigen Tabellen zählt hier der Zahlungseingang, nicht
    // das Rechnungsdatum: Eine Rechnung aus dem Vorjahr, die im geprüften Jahr
    // bezahlt wurde, gehört in dieses Jahr.
    zeilen: invoices
      .filter((i) => i.status !== 'draft')
      .flatMap((i) =>
        (i.payments ?? [])
          .filter((p) => imJahr(p.paidAt, jahr))
          .map((p) => ({ i, p })),
      )
      .sort((a, b) => a.p.paidAt - b.p.paidAt)
      .map(({ i, p }) => [
        p.id,
        i.number,
        z3Datum(p.paidAt),
        z3Zahl(p.amount, 2),
        z3Zahl(ustAnteil(i, p), 2),
        p.method ? ZAHLWEG_LABEL[p.method] : '',
        // „erschlossen" ist keine Kleinigkeit: Diese Zeilen stammen aus dem
        // früheren Ja/Nein-Schalter. Betrag und Datum sind abgeleitet, nicht
        // erfasst — das darf eine Prüfung nicht für eine Buchung halten.
        p.source === 'switch' ? 'erschlossen' : 'erfasst',
        p.note ?? '',
      ]),
  };

  // Leere Tabellen bleiben weg: Eine angekündigte Datei ohne Zeilen lässt die
  // Prüfsoftware stolpern, und eine leere Tabelle sagt ohnehin nichts.
  return [rechnungenTab, positionenTab, zahlungenTab, belegeTab, kundenTab, zeitenTab].filter(
    (t) => t.zeilen.length > 0,
  );
}

export function buildZ3Export(input: Z3ExportInput): Z3ExportResult {
  const tabs = tabellen(input);
  // Die XML-Dateien tragen ihre Kodierung selbst in der Deklaration und gehen
  // deshalb als UTF-8 hinaus. Nur die CSV-Dateien haben keine solche Angabe —
  // für sie gilt, was die Prüfsoftware annimmt, und das ist ANSI.
  const utf8 = new TextEncoder();
  const dateien: Z3Datei[] = [
    // Die index.xml zuerst — sie ist das, was der Prüfer öffnet.
    { name: 'index.xml', bytes: utf8.encode(indexXml(tabs, input)) },
    { name: DTD_DATEINAME, bytes: utf8.encode(DTD_INHALT) },
    ...tabs.map((t) => ({ name: t.datei, bytes: toWindows1252(tabelleZuCsv(t)) })),
  ];
  const zeilen: Record<string, number> = {};
  for (const t of tabs) zeilen[t.name] = t.zeilen.length;
  return { dateien, zeilen };
}

/** Nur für den Test — die XML-Fassung ohne den Umweg über die Bytes. */
export function buildIndexXml(input: Z3ExportInput): string {
  return indexXml(tabellen(input), input);
}
