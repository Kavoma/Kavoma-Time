// @vitest-environment happy-dom
//
// Der Z3-Export geht an einen Betriebsprüfer und wird in dessen Software
// geöffnet. Geht er dort nicht auf, bleibt der Ausdruck — und dann darf
// geschätzt werden. Getestet wird deshalb, dass die `index.xml` gültiges XML
// ist und dass sie beschreibt, was in den CSV-Dateien tatsächlich steht: Die
// Spaltenzahl der Beschreibung und die der Daten müssen übereinstimmen, sonst
// liest der Prüfer den Bruttobetrag als Steuersatz.

import { describe, expect, it } from 'vitest';
import { DTD_DATEINAME, buildIndexXml, buildZ3Export, z3Datum, type Z3ExportInput } from './z3Export';
import type { Customer, Invoice, Issuer, Project, TimeEntry, VendorInvoice } from '../types';

const tag = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

const issuer: Issuer = {
  name: 'Kavoma & Söhne', street: 'Beispielweg 3', zip: '20095', city: 'Hamburg',
  country: 'DE', email: '', phone: '', iban: '', bic: '', bank: '',
  taxId: '22/333/44444', smallBusiness: false, vatRate: 19,
};

const kunden = [
  { id: 1, name: 'Bürostühle GmbH', debtorNumber: '10001', street: 'Marktplatz 5',
    zip: '50667', city: 'Köln', country: 'DE', vatId: 'DE987654321' },
  { id: 2, name: 'Ohne Umsatz AG', debtorNumber: '10002' },
] as unknown as Customer[];

const projekte = [{ id: 5, customerId: 1, name: 'Möbelrollout' }] as unknown as Project[];

const zeiten = [
  { id: 100, customerId: 1, projectId: 5, description: 'Aufbau',
    startedAt: tag(2026, 3, 4, 8, 15), endedAt: tag(2026, 3, 4, 12, 45), durationSeconds: 16200 },
  { id: 101, customerId: 1, projectId: 5, description: 'Nicht beendet',
    startedAt: tag(2026, 3, 5, 9), endedAt: null, durationSeconds: 0 },
] as unknown as TimeEntry[];

const rechnungen = [
  { id: 'i1', number: '2026-0001', customerId: 1, projectId: 5, mode: 'hourly',
    periodFrom: tag(2026, 3, 1), periodTo: tag(2026, 3, 31),
    createdAt: tag(2026, 4, 5), dueDate: tag(2026, 4, 19),
    items: [{ description: 'Aufbau', quantity: 4.5, unit: 'h', unitPrice: 100, total: 450 }],
    entryIds: [100], subtotal: 450, vatRate: 19, vatAmount: 85.5, total: 535.5,
    notes: '', paid: true, paidAt: tag(2026, 4, 12), status: 'active', reminders: [],
    payments: [
      { id: 'p1', amount: 200, paidAt: tag(2026, 4, 8), method: 'transfer', source: 'manual', createdAt: 0 },
      { id: 'p2', amount: 335.5, paidAt: tag(2026, 4, 12), method: 'cash', source: 'switch', createdAt: 0 },
    ] },
  { id: 'i9', number: '', customerId: 1, projectId: null, mode: 'fixed',
    periodFrom: tag(2026, 5, 1), periodTo: tag(2026, 5, 31),
    createdAt: tag(2026, 6, 1), dueDate: tag(2026, 6, 15),
    items: [], entryIds: [], subtotal: 99, vatRate: 19, vatAmount: 18.81, total: 117.81,
    notes: '', paid: false, status: 'draft', reminders: [] },
] as unknown as Invoice[];

const belege = [
  { id: 1, attachmentId: 'a1', vendorName: 'Papier & Co', invoiceNumber: 'R-77',
    invoiceDate: tag(2026, 5, 12), amountGross: 119, vatAmount: 19,
    category: 'office', createdAt: 0, eInvoice: { syntax: 'cii', source: 'embedded' } },
] as unknown as VendorInvoice[];

function input(over: Partial<Z3ExportInput> = {}): Z3ExportInput {
  return {
    jahr: 2026, issuer, customers: kunden, projects: projekte, entries: zeiten,
    invoices: rechnungen, vendorInvoices: belege, ...over,
  };
}

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

function tabelleAus(doc: Document, datei: string): Element {
  const t = [...doc.getElementsByTagName('Table')].find(
    (el) => el.getElementsByTagName('URL')[0]?.textContent === datei,
  );
  if (!t) throw new Error(`Tabelle ${datei} fehlt in der index.xml`);
  return t;
}

const spaltenNamen = (t: Element) =>
  [...t.getElementsByTagName('VariableLength')[0].children]
    .filter((el) => el.tagName === 'VariablePrimaryKey' || el.tagName === 'VariableColumn')
    .map((el) => el.getElementsByTagName('Name')[0].textContent);

function csvAus(ergebnis: ReturnType<typeof buildZ3Export>, name: string): string[][] {
  const datei = ergebnis.dateien.find((d) => d.name === name);
  if (!datei) throw new Error(`Datei ${name} fehlt`);
  // Zurück nach Text: Die CSV-Dateien liegen in Windows-1252, und genau dieser
  // Weg prüft nebenbei, dass die Umlaute unterwegs heil bleiben.
  const text = new TextDecoder('windows-1252').decode(datei.bytes);
  return text
    .split('\r\n')
    .filter((z) => z !== '')
    .map((z) => z.slice(1, -1).split('";"').map((f) => f.replace(/""/g, '"')));
}

describe('index.xml', () => {
  const xml = buildIndexXml(input());
  const doc = parse(xml);

  it('ist gültiges XML', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.tagName).toBe('DataSet');
  });

  it('verweist auf die mitgelieferte DTD', () => {
    expect(xml).toContain(`<!DOCTYPE DataSet SYSTEM "${DTD_DATEINAME}">`);
  });

  it('nennt den Datenlieferanten und maskiert Sonderzeichen', () => {
    // „Kavoma & Söhne" — ein rohes Kaufmanns-Und macht das XML ungültig.
    expect(xml).toContain('Kavoma &amp; Söhne');
    expect(doc.getElementsByTagName('Name')[0].textContent).toBe('Kavoma & Söhne');
  });

  it('kündigt Trennzeichen und Einrahmung so an, wie geschrieben wird', () => {
    const t = tabelleAus(doc, 'rechnungen.csv');
    expect(t.getElementsByTagName('ColumnDelimiter')[0].textContent).toBe(';');
    expect(t.getElementsByTagName('RecordDelimiter')[0].textContent).toBe('\r\n');
    expect(t.getElementsByTagName('TextEncapsulator')[0].textContent).toBe('"');
    expect(t.getElementsByTagName('DecimalSymbol')[0].textContent).toBe(',');
  });

  it('grenzt den Zeitraum auf das geprüfte Jahr ein', () => {
    const t = tabelleAus(doc, 'rechnungen.csv');
    expect(t.getElementsByTagName('From')[0].textContent).toBe('2026-01-01');
    expect(t.getElementsByTagName('To')[0].textContent).toBe('2026-12-31');
  });

  it('stellt den Primärschlüssel voran', () => {
    const t = tabelleAus(doc, 'rechnungen.csv');
    expect(t.getElementsByTagName('VariableLength')[0].children[3].tagName)
      .toBe('VariablePrimaryKey');
  });
});

describe('Beschreibung und Daten passen zusammen', () => {
  const ergebnis = buildZ3Export(input());
  const doc = parse(new TextDecoder('utf-8').decode(
    ergebnis.dateien.find((d) => d.name === 'index.xml')!.bytes,
  ));

  for (const datei of ['rechnungen.csv', 'rechnungspositionen.csv', 'zahlungen.csv',
                       'eingangsrechnungen.csv', 'kunden.csv', 'zeiterfassung.csv']) {
    it(`${datei}: jede Zeile hat so viele Felder, wie die index.xml Spalten nennt`, () => {
      // Das ist der Fehler, der stillschweigend passiert und alles verschiebt.
      const erwartet = spaltenNamen(tabelleAus(doc, datei)).length;
      const zeilen = csvAus(ergebnis, datei);
      expect(zeilen.length).toBeGreaterThan(0);
      for (const z of zeilen) expect(z).toHaveLength(erwartet);
    });
  }

  it('schreibt keine Kopfzeile — die Spaltennamen stehen in der index.xml', () => {
    // Eine unangekündigte Überschrift läse der Prüfer als ersten Datensatz.
    expect(csvAus(ergebnis, 'rechnungen.csv')[0][0]).toBe('2026-0001');
  });

  it('liefert die DTD mit', () => {
    const dtd = ergebnis.dateien.find((d) => d.name === DTD_DATEINAME);
    expect(dtd).toBeDefined();
    expect(new TextDecoder().decode(dtd!.bytes)).toContain('<!ELEMENT DataSet');
  });
});

describe('Inhalt der Tabellen', () => {
  const ergebnis = buildZ3Export(input());

  it('nimmt Entwürfe nicht auf', () => {
    // Ein Entwurf trägt keine Nummer und wäre in einer Prüfung ein Umsatz,
    // den es nie gab.
    const zeilen = csvAus(ergebnis, 'rechnungen.csv');
    expect(zeilen).toHaveLength(1);
    expect(zeilen.map((z) => z[0])).not.toContain('');
  });

  it('macht die Storno-Spur in beide Richtungen lesbar', () => {
    const original = { ...rechnungen[0], status: 'cancelled', cancelledAt: tag(2026, 4, 20),
      cancelledByInvoiceId: 'i2' } as unknown as Invoice;
    const storno = { ...rechnungen[0], id: 'i2', number: '2026-0002', total: -535.5,
      subtotal: -450, vatAmount: -85.5, createdAt: tag(2026, 4, 20),
      cancelsInvoiceId: 'i1', entryIds: [] } as unknown as Invoice;
    const z = csvAus(buildZ3Export(input({ invoices: [original, storno] })), 'rechnungen.csv');
    expect(z[0][11]).toBe('storniert');
    expect(z[0][13]).toBe('2026-0002');   // storniert durch
    expect(z[0][14]).toBe('');
    expect(z[1][13]).toBe('');
    expect(z[1][14]).toBe('2026-0001');   // Storno zu
  });

  it('führt Beträge deutsch mit zwei Nachkommastellen', () => {
    const [z] = csvAus(ergebnis, 'rechnungen.csv');
    expect(z[7]).toBe('450,00');
    expect(z[9]).toBe('85,50');
    expect(z[10]).toBe('535,50');
  });

  it('verbindet den Zeiteintrag mit der Rechnung, in der er abgerechnet wurde', () => {
    // Ohne diese Brücke steht in der Rechnung eine Stundenzahl, die durch
    // nichts belegt ist — und genau danach wird gefragt.
    const [z] = csvAus(ergebnis, 'zeiterfassung.csv');
    expect(z[0]).toBe('100');
    expect(z[2]).toBe('08:15');
    expect(z[4]).toBe('4,50');
    expect(z[6]).toBe('Möbelrollout');
    expect(z[8]).toBe('2026-0001');
  });

  it('lässt den laufenden Eintrag weg', () => {
    expect(csvAus(ergebnis, 'zeiterfassung.csv')).toHaveLength(1);
  });

  it('gibt nur Kunden heraus, die im Jahr Umsatz hatten', () => {
    // Personenbezogene Daten gibt man nicht großzügiger heraus, als man muss.
    const zeilen = csvAus(ergebnis, 'kunden.csv');
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0][1]).toBe('Bürostühle GmbH');
  });

  it('führt jede Zahlung einzeln mit ihrem Umsatzsteueranteil', () => {
    const z = csvAus(ergebnis, 'zahlungen.csv');
    expect(z).toHaveLength(2);
    expect(z[0][1]).toBe('2026-0001');
    expect(z[0][2]).toBe('2026-04-08');
    expect(z[0][3]).toBe('200,00');
    // 200 von 535,50 brutto — anteilig 85,50 € Steuer.
    expect(z[0][4]).toBe('31,93');
    expect(z[0][5]).toBe('Ueberweisung');
  });

  it('sagt, welche Zahlung nur erschlossen ist', () => {
    // Aus dem früheren Ja/Nein-Schalter übernommen — das darf eine Prüfung
    // nicht für eine erfasste Buchung halten.
    const z = csvAus(ergebnis, 'zahlungen.csv');
    expect(z[0][6]).toBe('erfasst');
    expect(z[1][6]).toBe('erschlossen');
  });

  it('vermerkt die Herkunft eines Belegs', () => {
    expect(csvAus(ergebnis, 'eingangsrechnungen.csv')[0][8]).toBe('E-Rechnung (CII)');
  });

  it('rechnet den Nettobetrag eines Belegs aus dem Brutto zurück', () => {
    const [z] = csvAus(ergebnis, 'eingangsrechnungen.csv');
    expect(z[5]).toBe('100,00');
    expect(z[7]).toBe('119,00');
  });

  it('lässt leere Tabellen ganz weg', () => {
    const leer = buildZ3Export(input({ vendorInvoices: [], entries: [] }));
    const namen = leer.dateien.map((d) => d.name);
    expect(namen).not.toContain('eingangsrechnungen.csv');
    expect(namen).not.toContain('zeiterfassung.csv');
    expect(namen).toContain('rechnungen.csv');
  });
});

describe('Datumsangaben', () => {
  it('nimmt die Kalenderfelder, nicht die UTC-Zeit', () => {
    // `toISOString()` verschöbe einen Beleg vom 1. Januar 00:30 ins Vorjahr —
    // und damit aus der geprüften Periode heraus.
    expect(z3Datum(new Date(2026, 0, 1, 0, 30).getTime())).toBe('2026-01-01');
    expect(z3Datum(new Date(2026, 11, 31, 23, 30).getTime())).toBe('2026-12-31');
  });
});
