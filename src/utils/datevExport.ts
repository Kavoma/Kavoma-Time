// DATEV-Export — Buchungsstapel im DATEV-Format (EXTF), Version 700.
//
// Der Empfänger ist kein Mensch, sondern DATEV Rechnungswesen. Die Datei wird
// maschinell eingelesen und beim kleinsten Formfehler ganz abgewiesen — es gibt
// keine halbe Übernahme. Deshalb steht hier alles an einer Stelle und ist
// getestet, obwohl der Rest der Oberfläche es nicht ist.
//
// **Zahlungen sind abschaltbar und standardmäßig aus.** Seit es
// Zahlungseingänge gibt (B5), lägen Betrag und Datum vor — aber die Kanzlei
// bucht Zahlungen in aller Regel selbst aus dem Kontoauszug. Beides zugleich
// ergäbe jeden Zahlungseingang doppelt. Wer die Bank *nicht* von der Kanzlei
// buchen lässt, schaltet es ein und gibt sein Geldkonto an. Die Voreinstellung
// ist die, bei der nichts kaputtgehen kann.
//
// **Kontonummern sind Vorgaben, keine Wahrheit.** Welches Erlöskonto gilt,
// entscheidet der Kontenrahmen der Kanzlei. Alles ist einstellbar, und die
// Oberfläche sagt, dass es abgestimmt gehört.

import type {
  Customer,
  Invoice,
  Issuer,
  VendorInvoice,
  VendorInvoiceCategory,
} from '../types';

// === Einstellungen =============================================

export type Kontenrahmen = '03' | '04';

export interface DatevSettings {
  /** Beraternummer der Kanzlei (1001–9999999). */
  beraterNr: string;
  /** Mandantennummer bei dieser Kanzlei (1–99999). */
  mandantenNr: string;
  /** Erster Monat des Wirtschaftsjahres, 1–12. Fast immer 1. */
  wjBeginnMonat: number;
  /** Länge der Sachkonten, 4–8. Personenkonten sind eine Stelle länger. */
  sachkontenlaenge: number;
  kontenrahmen: Kontenrahmen;
  konten: DatevKonten;
  /**
   * Ob die Sätze als festgeschrieben übergeben werden. Voreingestellt aus:
   * Ein festgeschriebener Stapel lässt sich in DATEV nicht mehr korrigieren,
   * und der erste Import in eine fremde Kanzlei ist selten auf Anhieb richtig.
   */
  festschreibung: boolean;
  /**
   * Zahlungseingänge als eigene Buchungssätze mitgeben (Geldkonto an Debitor).
   *
   * **Voreingestellt aus.** Bucht die Kanzlei die Bank selbst — der Normalfall —,
   * stünde sonst jeder Zahlungseingang zweimal in der Buchführung.
   */
  zahlungenBuchen: boolean;
}

export interface DatevKonten {
  /** Erlöse zum Regelsatz. */
  erloese19: string;
  /** Erlöse zum ermäßigten Satz. */
  erloese7: string;
  /** Erlöse ohne Umsatzsteuer — Kleinunternehmer nach § 19 UStG. */
  erloese0: string;
  /**
   * Sammelkonto für Lieferanten. Kavoma Time führt keine Kreditorenstammdaten,
   * deshalb laufen alle Eingangsrechnungen über ein Konto. Wer einzelne
   * Kreditoren will, braucht zuerst Kreditorennummern am Lieferanten.
   */
  kreditorSammel: string;
  /** Aufwandskonto je Belegkategorie. */
  aufwand: Record<VendorInvoiceCategory, string>;
  /**
   * Geldkonto für Zahlungseingänge — nur benutzt, wenn `zahlungenBuchen` an
   * ist. SKR 03: 1200 Bank, 1000 Kasse. SKR 04: 1800 Bank, 1600 Kasse.
   */
  bank: string;
  kasse: string;
}

/**
 * Vorgaben je Kontenrahmen.
 *
 * Belegt sind die Erlöskonten und die beiden eindeutigen Aufwandskonten
 * (Bürobedarf, Reisekosten). Für alles Übrige steht bewusst das Sammelkonto
 * „sonstige betriebliche Aufwendungen" statt einer geratenen Nummer: Ein
 * falsches Konto, das plausibel aussieht, ist schlimmer als ein grobes, das
 * jeder sofort als grob erkennt.
 */
export const KONTEN_VORGABEN: Record<Kontenrahmen, DatevKonten> = {
  '03': {
    erloese19: '8400',
    erloese7: '8300',
    erloese0: '8195',
    kreditorSammel: '70000',
    aufwand: {
      hardware: '4980',
      software: '4980',
      office: '4930',
      travel: '4670',
      service: '4980',
      other: '4980',
    },
    bank: '1200',
    kasse: '1000',
  },
  '04': {
    erloese19: '4400',
    erloese7: '4300',
    erloese0: '4185',
    kreditorSammel: '70000',
    aufwand: {
      hardware: '6300',
      software: '6300',
      office: '6815',
      travel: '6650',
      service: '6300',
      other: '6300',
    },
    bank: '1800',
    kasse: '1600',
  },
};

export const DATEV_VORGABEN: DatevSettings = {
  beraterNr: '',
  mandantenNr: '',
  wjBeginnMonat: 1,
  sachkontenlaenge: 4,
  kontenrahmen: '03',
  konten: KONTEN_VORGABEN['03'],
  festschreibung: false,
  zahlungenBuchen: false,
};

// === Format-Grundlagen =========================================

/** Datenkategorie 21 = Buchungsstapel, Formatversion 13 zur Fassung 700. */
const VERSION = 700;
const KATEGORIE = 21;
const FORMATNAME = 'Buchungsstapel';
const FORMATVERSION = 13;

/**
 * Die Spaltenüberschriften der Fassung 700 — 125 Stück, in genau dieser
 * Reihenfolge. DATEV prüft Anzahl und Reihenfolge; eine ausgelassene Spalte
 * verschiebt alles danach und macht aus dem Belegdatum einen Buchungstext.
 * Deshalb steht die Liste vollständig da, auch wo nichts gefüllt wird.
 */
export const BUCHUNGSSTAPEL_SPALTEN: readonly string[] = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
  'Postensperre',
  'Diverse Adressnummer',
  'Geschäftspartnerbank',
  'Sachverhalt',
  'Zinssperre',
  'Beleglink',
  ...spaltenPaare('Beleginfo - Art', 'Beleginfo - Inhalt', 8),
  'KOST1 - Kostenstelle',
  'KOST2 - Kostenstelle',
  'KOST-Menge',
  'EU-Land u. UStID (Bestimmung)',
  'EU-Steuersatz (Bestimmung)',
  'Abw. Versteuerungsart',
  'Sachverhalt L+L',
  'Funktionsergänzung L+L',
  'BU 49 Hauptfunktionstyp',
  'BU 49 Hauptfunktionsnummer',
  'BU 49 Funktionsergänzung',
  ...spaltenPaare('Zusatzinformation - Art', 'Zusatzinformation- Inhalt', 20),
  'Stück',
  'Gewicht',
  'Zahlweise',
  'Forderungsart',
  'Veranlagungsjahr',
  'Zugeordnete Fälligkeit',
  'Skontotyp',
  'Auftragsnummer',
  'Buchungstyp',
  'USt-Schlüssel (Anzahlungen)',
  'EU-Land (Anzahlungen)',
  'Sachverhalt L+L (Anzahlungen)',
  'EU-Steuersatz (Anzahlungen)',
  'Erlöskonto (Anzahlungen)',
  'Herkunft-Kz',
  'Buchungs GUID',
  'KOST-Datum',
  'SEPA-Mandatsreferenz',
  'Skontosperre',
  'Gesellschaftername',
  'Beteiligtennummer',
  'Identifikationsnummer',
  'Zeichnernummer',
  'Postensperre bis',
  'Bezeichnung SoBil-Sachverhalt',
  'Kennzeichen SoBil-Buchung',
  'Festschreibung',
  'Leistungsdatum',
  'Datum Zuord. Steuerperiode',
  'Fälligkeit',
  'Generalumkehr (GU)',
  'Steuersatz',
  'Land',
  'Abrechnungsreferenz',
  'BVV-Position',
  'EU-Land u. UStID (Ursprung)',
  'EU-Steuersatz (Ursprung)',
  'Abw. Skontokonto',
];

function spaltenPaare(art: string, inhalt: string, anzahl: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= anzahl; i++) {
    out.push(`${art} ${i}`, `${inhalt} ${i}`);
  }
  return out;
}

/** Spaltenindizes (0-basiert), damit die Zuweisung unten lesbar bleibt. */
const SP = {
  umsatz: 0,
  sollHaben: 1,
  wkz: 2,
  konto: 6,
  gegenkonto: 7,
  buSchluessel: 8,
  belegdatum: 9,
  belegfeld1: 10,
  belegfeld2: 11,
  buchungstext: 13,
  festschreibung: 113,
  leistungsdatum: 114,
  faelligkeit: 116,
} as const;

// === Werte formatieren =========================================

/**
 * Beträge stehen deutsch mit Komma und immer positiv — das Vorzeichen trägt
 * das Soll/Haben-Kennzeichen. Ein negativer Betrag *und* ein Kennzeichen
 * wären zwei Vorzeichen und heben sich in DATEV gegenseitig auf.
 */
export function datevBetrag(value: number): string {
  return Math.abs(value).toFixed(2).replace('.', ',');
}

const zwei = (n: number) => String(n).padStart(2, '0');

/** Belegdatum: TTMM. Das Jahr steht im Kopf der Datei. */
function ttmm(ts: number): string {
  const d = new Date(ts);
  return `${zwei(d.getDate())}${zwei(d.getMonth() + 1)}`;
}

/** Leistungsdatum und Fälligkeit: TTMMJJJJ. */
function ttmmjjjj(ts: number): string {
  const d = new Date(ts);
  return `${zwei(d.getDate())}${zwei(d.getMonth() + 1)}${d.getFullYear()}`;
}

/** Zeitstempel im Kopf: JJJJMMTTHHMMSSFFF. */
function kopfZeitstempel(d: Date): string {
  return (
    `${d.getFullYear()}${zwei(d.getMonth() + 1)}${zwei(d.getDate())}` +
    `${zwei(d.getHours())}${zwei(d.getMinutes())}${zwei(d.getSeconds())}` +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

/**
 * Belegfeld 1 ist die Rechnungsnummer, wie sie in DATEV wiederzufinden sein
 * muss. Erlaubt sind 36 Zeichen aus Ziffern, Buchstaben und wenigen
 * Sonderzeichen; alles andere wird zum Bindestrich, statt den Import an einer
 * einzelnen Rechnung scheitern zu lassen.
 */
export function belegfeld(nummer: string): string {
  return nummer.replace(/[^0-9A-Za-z$%&*+\-/]/g, '-').slice(0, 36);
}

/** Buchungstext: 60 Zeichen, Semikolon und Anführungszeichen raus. */
function buchungstext(text: string): string {
  return text.replace(/[";\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * DATEV-CSV: Semikolon trennt, Text steht in Anführungszeichen, Zahlen nicht.
 * Zahlen sind hier alles, was aus Ziffern und Komma besteht — DATEV liest ein
 * eingerahmtes `1234,50` als Text und weist den Satz ab.
 */
function feld(value: string): string {
  if (value === '') return '';
  if (/^-?[0-9]+(,[0-9]+)?$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function zeile(werte: readonly string[]): string {
  return werte.map(feld).join(';');
}

// === Windows-1252 ==============================================

/**
 * DATEV erwartet die Datei in Windows-1252, nicht in UTF-8. Der Unterschied
 * fällt erst am Umlaut auf: Aus „Bürostühle" wird sonst „BÃ¼rostÃ¼hle" — und
 * zwar erst in der Kanzlei, nicht hier.
 *
 * Der Browser kann nur UTF-8 kodieren, also wird von Hand abgebildet. Die
 * Zeichen zwischen 0x80 und 0x9F sind der einzige Teil, in dem sich
 * Windows-1252 von Latin-1 unterscheidet.
 */
const CP1252_OBEN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

export function toWindows1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) {
      out[i] = code;
      continue;
    }
    const oben = CP1252_OBEN.indexOf(text[i]);
    // Was Windows-1252 nicht kennt, wird ein Fragezeichen. Ein sichtbares
    // Zeichen ist ehrlicher als ein stilles Weglassen.
    out[i] = oben >= 0 ? 0x80 + oben : 0x3f;
  }
  return out;
}

// === Buchungssätze =============================================

export interface DatevBuchung {
  umsatz: number;
  sollHaben: 'S' | 'H';
  konto: string;
  gegenkonto: string;
  belegdatum: number;
  belegfeld1: string;
  buchungstext: string;
  leistungsdatum?: number;
  faelligkeit?: number;
}

export interface DatevExportInput {
  jahr: number;
  invoices: Invoice[];
  vendorInvoices: VendorInvoice[];
  customers: Customer[];
  issuer: Issuer;
  settings: DatevSettings;
  /** Nur für den Test überschrieben. */
  jetzt?: Date;
}

export interface DatevExportResult {
  csv: string;
  bytes: Uint8Array;
  buchungen: number;
  /** Was nicht gebucht werden konnte und warum. */
  uebersprungen: { beleg: string; grund: string }[];
}

/** Erlöskonto nach dem Steuersatz der Rechnung. */
function erloeskonto(invoice: Invoice, k: DatevKonten): string {
  if (invoice.vatRate >= 18) return k.erloese19;
  if (invoice.vatRate > 0) return k.erloese7;
  return k.erloese0;
}

const imJahr = (ts: number, jahr: number) => new Date(ts).getFullYear() === jahr;

/**
 * Aus Rechnungen und Belegen werden Buchungssätze.
 *
 * Ausgangsrechnung: Forderung im Soll gegen Erlös. Eingangsrechnung: Aufwand
 * im Soll gegen den Sammelkreditor. Beides der Bruttobetrag — die Steuer zieht
 * DATEV über das Automatikkonto selbst heraus, deshalb bleibt der
 * BU-Schlüssel leer. Wer ihn zusätzlich setzte, hätte zwei Steuerangaben zu
 * einem Satz.
 */
export function buildBuchungen(input: DatevExportInput): {
  buchungen: DatevBuchung[];
  uebersprungen: { beleg: string; grund: string }[];
} {
  const { jahr, invoices, vendorInvoices, customers, settings } = input;
  const buchungen: DatevBuchung[] = [];
  const uebersprungen: { beleg: string; grund: string }[] = [];
  const kundeVon = new Map(customers.map((c) => [c.id, c]));

  for (const inv of invoices) {
    if (!imJahr(inv.createdAt, jahr)) continue;
    // Entwürfe sind keine Belege — sie tragen noch keine Nummer und dürfen
    // nicht in die Buchführung. Stornierte bleiben drin: Die Storno-Rechnung
    // ist ein eigener Beleg und hebt sie im Konto wieder auf.
    if (inv.status === 'draft') continue;

    const kunde = kundeVon.get(inv.customerId);
    if (!kunde) {
      uebersprungen.push({ beleg: inv.number, grund: 'Kunde nicht gefunden' });
      continue;
    }
    if (!kunde.debtorNumber) {
      uebersprungen.push({
        beleg: inv.number,
        grund: `${kunde.name} hat keine Debitorennummer`,
      });
      continue;
    }

    // Eine Storno-Rechnung trägt negative Beträge. Die Seite dreht sich,
    // der Betrag wird positiv — sonst stünde das Vorzeichen doppelt.
    const brutto = inv.total;
    buchungen.push({
      umsatz: brutto,
      sollHaben: brutto < 0 ? 'H' : 'S',
      konto: kunde.debtorNumber,
      gegenkonto: erloeskonto(inv, settings.konten),
      belegdatum: inv.createdAt,
      belegfeld1: belegfeld(inv.number),
      buchungstext: buchungstext(kunde.name),
      leistungsdatum: inv.periodTo,
      faelligkeit: inv.dueDate,
    });
  }

  for (const v of vendorInvoices) {
    if (!imJahr(v.invoiceDate, jahr)) continue;
    buchungen.push({
      umsatz: v.amountGross,
      sollHaben: v.amountGross < 0 ? 'H' : 'S',
      konto: settings.konten.aufwand[v.category] ?? settings.konten.aufwand.other,
      gegenkonto: settings.konten.kreditorSammel,
      belegdatum: v.invoiceDate,
      belegfeld1: belegfeld(v.invoiceNumber ?? ''),
      buchungstext: buchungstext(v.vendorName),
    });
  }

  if (settings.zahlungenBuchen) {
    for (const inv of invoices) {
      if (inv.status === 'draft') continue;
      const kunde = kundeVon.get(inv.customerId);
      // Ohne Debitorenkonto ist die Rechnung selbst schon übersprungen; ihre
      // Zahlung hätte kein Gegenkonto.
      if (!kunde?.debtorNumber) continue;
      for (const p of inv.payments ?? []) {
        if (!imJahr(p.paidAt, jahr)) continue;
        const geldkonto = p.method === 'cash' ? settings.konten.kasse : settings.konten.bank;
        buchungen.push({
          umsatz: p.amount,
          sollHaben: 'S',              // Geldzugang im Soll
          konto: geldkonto,
          gegenkonto: kunde.debtorNumber,
          belegdatum: p.paidAt,
          belegfeld1: belegfeld(inv.number),
          buchungstext: buchungstext(`Zahlung ${kunde.name}`),
        });
      }
    }
  }

  buchungen.sort((a, b) => a.belegdatum - b.belegdatum);
  return { buchungen, uebersprungen };
}

/** Der Kopf der Datei — 31 Felder, die DATEV den Stapel zuordnen lassen. */
function kopfzeile(input: DatevExportInput, jetzt: Date): string {
  const { jahr, settings, issuer } = input;
  const wjBeginn = `${jahr}${zwei(settings.wjBeginnMonat)}01`;
  return zeile([
    'EXTF',
    String(VERSION),
    String(KATEGORIE),
    FORMATNAME,
    String(FORMATVERSION),
    kopfZeitstempel(jetzt),
    '',                                  // importiert — bleibt leer
    'RE',                                // Herkunft: Rechnungsschreibung
    buchungstext(issuer.name),
    '',                                  // importiert von — bleibt leer
    settings.beraterNr,
    settings.mandantenNr,
    wjBeginn,
    String(settings.sachkontenlaenge),
    `${jahr}0101`,
    `${jahr}1231`,
    `Kavoma Time ${jahr}`,
    '',                                  // Diktatkürzel
    '1',                                 // Buchungstyp: Finanzbuchführung
    '',                                  // Rechnungslegungszweck
    settings.festschreibung ? '1' : '0',
    'EUR',
    '',                                  // Derivatskennzeichen
    '', '',                              // reserviert
    `SKR${settings.kontenrahmen}`,
    '',                                  // Branchenlösung-Id
    '', '',                              // reserviert
    '',                                  // Anwendungsinformation
  ]);
}

function buchungszeile(b: DatevBuchung, settings: DatevSettings): string {
  const werte = new Array<string>(BUCHUNGSSTAPEL_SPALTEN.length).fill('');
  werte[SP.umsatz] = datevBetrag(b.umsatz);
  werte[SP.sollHaben] = b.sollHaben;
  werte[SP.wkz] = 'EUR';
  werte[SP.konto] = b.konto;
  werte[SP.gegenkonto] = b.gegenkonto;
  werte[SP.buSchluessel] = '';           // Automatikkonto trägt die Steuer
  werte[SP.belegdatum] = ttmm(b.belegdatum);
  werte[SP.belegfeld1] = b.belegfeld1;
  werte[SP.belegfeld2] = '';
  werte[SP.buchungstext] = b.buchungstext;
  werte[SP.festschreibung] = settings.festschreibung ? '1' : '0';
  if (b.leistungsdatum) werte[SP.leistungsdatum] = ttmmjjjj(b.leistungsdatum);
  if (b.faelligkeit) werte[SP.faelligkeit] = ttmmjjjj(b.faelligkeit);
  return zeile(werte);
}

export function buildDatevExport(input: DatevExportInput): DatevExportResult {
  const jetzt = input.jetzt ?? new Date();
  const { buchungen, uebersprungen } = buildBuchungen(input);

  const zeilen = [
    kopfzeile(input, jetzt),
    zeile(BUCHUNGSSTAPEL_SPALTEN),
    ...buchungen.map((b) => buchungszeile(b, input.settings)),
  ];
  // DATEV erwartet CRLF und einen Zeilenumbruch am Ende.
  const csv = zeilen.join('\r\n') + '\r\n';

  return { csv, bytes: toWindows1252(csv), buchungen: buchungen.length, uebersprungen };
}

/** Dateiname nach DATEV-Empfehlung: EXTF_ plus sprechender Rest. */
export function datevDateiname(jahr: number): string {
  return `EXTF_Buchungsstapel_${jahr}.csv`;
}
