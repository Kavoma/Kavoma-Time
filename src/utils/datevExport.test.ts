// Der DATEV-Stapel wird von einer fremden Software gelesen, die ihn beim
// kleinsten Formfehler ganz abweist — und zwar in der Kanzlei, nicht hier.
// Getestet wird deshalb die Form (Spaltenzahl, Trennzeichen, Kodierung) genau
// so streng wie der Inhalt.

import { describe, expect, it } from 'vitest';
import {
  BUCHUNGSSTAPEL_SPALTEN,
  DATEV_VORGABEN,
  KONTEN_VORGABEN,
  belegfeld,
  buildBuchungen,
  buildDatevExport,
  datevBetrag,
  toWindows1252,
  type DatevExportInput,
  type DatevSettings,
} from './datevExport';
import type { Customer, Invoice, Issuer, VendorInvoice } from '../types';

const tag = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const issuer: Issuer = {
  name: 'Kavoma', street: 'Beispielweg 3', zip: '20095', city: 'Hamburg', country: 'DE',
  email: '', phone: '', iban: '', bic: '', bank: '', taxId: '22/333/44444',
  smallBusiness: false, vatRate: 19,
};

const kunde = {
  id: 1, name: 'Bürostühle GmbH', debtorNumber: '10001',
  street: 'Marktplatz 5', zip: '50667', city: 'Köln', country: 'DE',
} as unknown as Customer;

const ohneNummer = { id: 2, name: 'Namenlos KG' } as unknown as Customer;

function rechnung(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1', number: '2026-0001', customerId: 1, projectId: null, mode: 'fixed',
    periodFrom: tag(2026, 3, 1), periodTo: tag(2026, 3, 31),
    createdAt: tag(2026, 4, 5), dueDate: tag(2026, 4, 19),
    items: [], entryIds: [], subtotal: 1000, vatRate: 19, vatAmount: 190, total: 1190,
    notes: '', paid: false, status: 'active', reminders: [],
    ...over,
  } as Invoice;
}

function beleg(over: Partial<VendorInvoice> = {}): VendorInvoice {
  return {
    id: 1, attachmentId: 'a1', vendorName: 'Papier & Co',
    invoiceNumber: 'R-77', invoiceDate: tag(2026, 5, 12),
    amountGross: 119, vatAmount: 19, category: 'office', createdAt: 0,
    ...over,
  } as VendorInvoice;
}

const settings: DatevSettings = {
  ...DATEV_VORGABEN,
  beraterNr: '1234567',
  mandantenNr: '4711',
};

function input(over: Partial<DatevExportInput> = {}): DatevExportInput {
  return {
    jahr: 2026,
    invoices: [rechnung()],
    vendorInvoices: [beleg()],
    customers: [kunde],
    issuer,
    settings,
    jetzt: new Date(2026, 8, 3, 14, 30, 5, 7),
    ...over,
  };
}

const zeilen = (csv: string) => csv.split('\r\n').filter((z) => z !== '');
const felder = (zeile: string) => zeile.split(';');

describe('Form der Datei', () => {
  const { csv } = buildDatevExport(input());
  const z = zeilen(csv);

  it('beginnt mit dem EXTF-Kopf in der Fassung 700', () => {
    const kopf = felder(z[0]);
    expect(kopf[0]).toBe('"EXTF"');
    expect(kopf[1]).toBe('700');
    expect(kopf[2]).toBe('21');
    expect(kopf[3]).toBe('"Buchungsstapel"');
    expect(kopf[4]).toBe('13');
  });

  it('trägt Berater, Mandant und Wirtschaftsjahr in den Kopf', () => {
    const kopf = felder(z[0]);
    expect(kopf[10]).toBe('1234567');
    expect(kopf[11]).toBe('4711');
    expect(kopf[12]).toBe('20260101');
    expect(kopf[14]).toBe('20260101');
    expect(kopf[15]).toBe('20261231');
    expect(kopf[21]).toBe('"EUR"');
  });

  it('hat in der zweiten Zeile 125 Spaltenüberschriften', () => {
    // Die Zahl ist keine Schönheit, sondern Vertrag: DATEV zählt mit, und eine
    // ausgelassene Spalte verschiebt alles danach um eins.
    expect(BUCHUNGSSTAPEL_SPALTEN).toHaveLength(125);
    expect(felder(z[1])).toHaveLength(125);
    expect(felder(z[1])[0]).toBe('"Umsatz (ohne Soll/Haben-Kz)"');
    expect(felder(z[1])[113]).toBe('"Festschreibung"');
  });

  it('gibt jeder Buchungszeile ebenfalls 125 Felder', () => {
    for (const zeile of z.slice(2)) expect(felder(zeile)).toHaveLength(125);
  });

  it('endet mit CRLF und benutzt CRLF als Satztrenner', () => {
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.includes('\n\n')).toBe(false);
  });

  it('rahmt Text ein, Zahlen aber nicht', () => {
    // Ein eingerahmtes „1190,00" liest DATEV als Text und weist den Satz ab.
    const buchung = felder(z[2]);
    expect(buchung[0]).toBe('1190,00');
    expect(buchung[1]).toBe('"S"');
    expect(buchung[6]).toBe('10001');
  });
});

describe('Kodierung', () => {
  it('schreibt Windows-1252, nicht UTF-8', () => {
    // „Bürostühle GmbH" steht im Buchungstext. In UTF-8 käme das in der
    // Kanzlei als „BÃ¼rostÃ¼hle" an — und zwar erst dort.
    const { bytes } = buildDatevExport(input());
    const ue = toWindows1252('ü');
    expect(ue).toHaveLength(1);
    expect(ue[0]).toBe(0xfc);
    expect(Array.from(bytes)).toContain(0xfc);
    // Die UTF-8-Folge für „ü" (0xC3 0xBC) darf nirgends vorkommen.
    const alsText = Array.from(bytes).join(',');
    expect(alsText).not.toContain('195,188');
  });

  it('bildet das Eurozeichen ab und ersetzt Unbekanntes sichtbar', () => {
    expect(Array.from(toWindows1252('€'))).toEqual([0x80]);
    // Ein Emoji hat in Windows-1252 keine Entsprechung. Ein Fragezeichen ist
    // ehrlicher als ein stilles Weglassen.
    expect(Array.from(toWindows1252('a中b'))).toEqual([0x61, 0x3f, 0x62]);
  });
});

describe('Buchungssätze', () => {
  it('bucht eine Ausgangsrechnung Debitor an Erlös, brutto', () => {
    const { buchungen } = buildBuchungen(input());
    const aus = buchungen.find((b) => b.belegfeld1 === '2026-0001')!;
    expect(aus.konto).toBe('10001');
    expect(aus.gegenkonto).toBe(KONTEN_VORGABEN['03'].erloese19);
    expect(aus.sollHaben).toBe('S');
    expect(aus.umsatz).toBe(1190);
  });

  it('bucht eine Eingangsrechnung Aufwand an Sammelkreditor', () => {
    const { buchungen } = buildBuchungen(input());
    const ein = buchungen.find((b) => b.belegfeld1 === 'R-77')!;
    expect(ein.konto).toBe(KONTEN_VORGABEN['03'].aufwand.office);
    expect(ein.gegenkonto).toBe(KONTEN_VORGABEN['03'].kreditorSammel);
    expect(ein.sollHaben).toBe('S');
    expect(ein.umsatz).toBe(119);
  });

  it('lässt den BU-Schlüssel leer, weil das Automatikkonto die Steuer trägt', () => {
    // Konto und BU-Schlüssel wären zwei Steuerangaben zu einem Satz.
    const { csv } = buildDatevExport(input());
    expect(felder(zeilen(csv)[2])[8]).toBe('');
  });

  it('wählt das Erlöskonto nach dem Steuersatz', () => {
    const k = KONTEN_VORGABEN['03'];
    const konto = (vatRate: number) =>
      buildBuchungen(input({ invoices: [rechnung({ vatRate })], vendorInvoices: [] }))
        .buchungen[0].gegenkonto;
    expect(konto(19)).toBe(k.erloese19);
    expect(konto(7)).toBe(k.erloese7);
    expect(konto(0)).toBe(k.erloese0);
  });

  it('dreht bei einer Storno-Rechnung die Seite statt das Vorzeichen', () => {
    // Ein negativer Betrag *und* ein Haben-Kennzeichen wären zwei Vorzeichen
    // und hüben sich in DATEV gegenseitig auf.
    const storno = rechnung({
      id: 'i2', number: '2026-0002', subtotal: -1000, vatAmount: -190, total: -1190,
      cancelsInvoiceId: 'i1',
    });
    const { buchungen } = buildBuchungen(input({ invoices: [storno], vendorInvoices: [] }));
    expect(buchungen[0].sollHaben).toBe('H');
    expect(buchungen[0].umsatz).toBe(-1190);
    expect(datevBetrag(buchungen[0].umsatz)).toBe('1190,00');
  });

  it('führt Leistungsdatum und Fälligkeit mit, aber das Belegdatum nur als TTMM', () => {
    const { csv } = buildDatevExport(input({ vendorInvoices: [] }));
    const b = felder(zeilen(csv)[2]);
    expect(b[9]).toBe('0504');        // 5. April
    expect(b[114]).toBe('31032026');  // Leistungsende
    expect(b[116]).toBe('19042026');  // Fälligkeit
  });
});

describe('Was nicht gebucht wird', () => {
  it('lässt Entwürfe draußen', () => {
    const entwurf = rechnung({ id: 'i9', number: '', status: 'draft' });
    const { buchungen } = buildBuchungen(
      input({ invoices: [entwurf], vendorInvoices: [] }),
    );
    expect(buchungen).toHaveLength(0);
  });

  it('behält stornierte Rechnungen — die Storno-Rechnung hebt sie auf', () => {
    const storniert = rechnung({ status: 'cancelled', cancelledAt: tag(2026, 4, 20) });
    const { buchungen } = buildBuchungen(
      input({ invoices: [storniert], vendorInvoices: [] }),
    );
    expect(buchungen).toHaveLength(1);
  });

  it('überspringt Rechnungen ohne Debitorennummer und sagt es', () => {
    // Ein Buchungssatz auf ein Konto, das es nicht gibt, wäre schlimmer als
    // eine fehlende Zeile, von der man weiß.
    const { buchungen, uebersprungen } = buildBuchungen(
      input({
        invoices: [rechnung({ customerId: 2 })],
        vendorInvoices: [],
        customers: [ohneNummer],
      }),
    );
    expect(buchungen).toHaveLength(0);
    expect(uebersprungen).toEqual([
      { beleg: '2026-0001', grund: 'Namenlos KG hat keine Debitorennummer' },
    ]);
  });

  it('nimmt nur Belege des gewählten Jahres', () => {
    const { buchungen } = buildBuchungen(
      input({
        invoices: [rechnung(), rechnung({ id: 'i3', number: '2025-9', createdAt: tag(2025, 12, 31) })],
        vendorInvoices: [beleg({ id: 2, invoiceDate: tag(2027, 1, 1) })],
      }),
    );
    expect(buchungen).toHaveLength(1);
    expect(buchungen[0].belegfeld1).toBe('2026-0001');
  });
});

describe('Feldwerte säubern', () => {
  it('lässt eine gewöhnliche Rechnungsnummer unangetastet', () => {
    expect(belegfeld('2026-0001')).toBe('2026-0001');
  });

  it('ersetzt unerlaubte Zeichen, statt den Import scheitern zu lassen', () => {
    expect(belegfeld('RE 2026#1')).toBe('RE-2026-1');
    expect(belegfeld('a'.repeat(50))).toHaveLength(36);
  });

  it('hält den Buchungstext bei 60 Zeichen und ohne Semikolon', () => {
    const langerName = 'Ein sehr langer Kundenname; mit Semikolon und noch viel mehr Text dahinter';
    const { csv } = buildDatevExport(
      input({
        invoices: [],
        vendorInvoices: [beleg({ vendorName: langerName })],
      }),
    );
    const text = felder(zeilen(csv)[2])[13];
    expect(text).not.toContain(';');
    expect(text.replace(/^"|"$/g, '')).toHaveLength(60);
  });
});
