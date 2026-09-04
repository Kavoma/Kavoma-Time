// Ein sRGB-ICC-Profil, gebaut aus den Normwerten.
//
// PDF/A verlangt eine **Ausgabebedingung**: Das PDF muss sagen, in welchem
// Farbraum seine Farben gemeint sind, und das Profil dazu mitliefern. Ohne das
// scheitert jede Prüfung, auch wenn das Dokument nur schwarzen Text enthält.
//
// **Warum gebaut und nicht mitgeliefert.** Die Profildateien, die auf einem
// Rechner herumliegen, gehören jemandem — die unter macOS Apple, die in
// Grafikprogrammen deren Herstellern. Die *Zahlen* dagegen stehen in
// IEC 61966-2-1 und sind Normtext, kein Werk. Aus ihnen ein Profil zu bauen
// ist der einzige Weg, der ohne fremde Datei auskommt.
//
// Gebaut wird ein ICC-v2-Matrix-Shaper-Profil — das kleinste, was ein
// Anzeigeprofil sein darf: Weisspunkt, drei Primärvalenzen, drei Tonwertkurven,
// Beschreibung, Copyright. Rund 600 Byte.

/** 16.16-Festkommazahl, wie ICC sie für XYZ-Werte benutzt. */
function s15Fixed16(value: number): number {
  return Math.round(value * 65536);
}

function schreibeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false); // ICC ist durchgehend Big-Endian
}

/** Vier ASCII-Zeichen als uint32 — ICC-Signaturen sind genau das. */
function sig(text: string): number {
  return (
    (text.charCodeAt(0) << 24) | (text.charCodeAt(1) << 16) |
    (text.charCodeAt(2) << 8) | text.charCodeAt(3)
  ) >>> 0;
}

/** XYZType: Signatur, Füllbytes, drei s15Fixed16-Werte. */
function xyzTag(x: number, y: number, z: number): Uint8Array {
  const buf = new ArrayBuffer(20);
  const v = new DataView(buf);
  schreibeUint32(v, 0, sig('XYZ '));
  schreibeUint32(v, 4, 0);
  v.setInt32(8, s15Fixed16(x), false);
  v.setInt32(12, s15Fixed16(y), false);
  v.setInt32(16, s15Fixed16(z), false);
  return new Uint8Array(buf);
}

/**
 * curveType mit einem einzigen Wert: der Gamma-Exponent als u8Fixed8.
 *
 * Die sRGB-Übertragungsfunktion ist genau genommen stückweise definiert (ein
 * linearer Fuss, dann eine Potenz mit 2,4). Als **eine** Zahl ausgedrückt
 * entspricht sie 2,2 — genau das, was auch die Norm als Gesamtgamma nennt. Die
 * exakte Form bräuchte einen `para`-Tag aus ICC v4; für die Ausgabebedingung
 * eines Textdokuments ist der Unterschied ohne Wirkung, und v2 wird von mehr
 * Prüfprogrammen ohne Murren gelesen.
 */
function gammaTag(gamma = 2.2): Uint8Array {
  const buf = new ArrayBuffer(14);
  const v = new DataView(buf);
  schreibeUint32(v, 0, sig('curv'));
  schreibeUint32(v, 4, 0);
  schreibeUint32(v, 8, 1);                       // ein Stützwert = Gamma
  v.setUint16(12, Math.round(gamma * 256), false);
  return new Uint8Array(buf);
}

/**
 * textDescriptionType (ICC v2). Trägt die ASCII-Fassung; die Unicode- und
 * ScriptCode-Felder bleiben leer, was zulässig ist.
 */
function descTag(text: string): Uint8Array {
  const ascii = new TextEncoder().encode(text + '\0');
  const laenge = 12 + 4 + ascii.length + 4 + 4 + 2 + 1 + 67;
  const buf = new ArrayBuffer(laenge);
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  schreibeUint32(v, 0, sig('desc'));
  schreibeUint32(v, 4, 0);
  schreibeUint32(v, 8, ascii.length);
  bytes.set(ascii, 12);
  // Danach: Unicode-Sprachcode (0), Unicode-Länge (0), ScriptCode-Code (0),
  // ScriptCode-Länge (0) und 67 Byte ScriptCode-Text — alles Nullen.
  return bytes;
}

/** multiLocalizedUnicode wäre v4; in v2 ist auch der Copyright-Tag ein Text. */
function textTag(text: string): Uint8Array {
  const ascii = new TextEncoder().encode(text + '\0');
  const buf = new ArrayBuffer(8 + ascii.length);
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  schreibeUint32(v, 0, sig('text'));
  schreibeUint32(v, 4, 0);
  bytes.set(ascii, 8);
  return bytes;
}

/**
 * Die sRGB-Primärvalenzen, **an D50 angepasst**.
 *
 * ICC rechnet seinen Verbindungsfarbraum grundsätzlich auf D50, sRGB ist aber
 * auf D65 definiert. Die Zahlen unten sind die bereits umgerechneten Werte —
 * dieselben, die in jedem sRGB-Profil stehen. Wer hier die D65-Werte einsetzt,
 * bekommt ein Profil, das lädt und trotzdem falsch ist.
 */
const PRIMAER = {
  r: [0.4360, 0.2225, 0.0139],
  g: [0.3851, 0.7169, 0.0971],
  b: [0.1431, 0.0606, 0.7139],
} as const;

/** D50, der ICC-Verbindungsweisspunkt. */
const D50 = [0.9642, 1.0000, 0.8249] as const;

/** Nach ICC muss jeder Tag an einer durch vier teilbaren Stelle beginnen. */
const aufVier = (n: number) => (n + 3) & ~3;

export function buildSrgbProfile(): Uint8Array {
  const tags: { name: string; data: Uint8Array }[] = [
    { name: 'desc', data: descTag('sRGB IEC61966-2.1') },
    { name: 'wtpt', data: xyzTag(D50[0], D50[1], D50[2]) },
    { name: 'rXYZ', data: xyzTag(...PRIMAER.r) },
    { name: 'gXYZ', data: xyzTag(...PRIMAER.g) },
    { name: 'bXYZ', data: xyzTag(...PRIMAER.b) },
    { name: 'rTRC', data: gammaTag() },
    { name: 'gTRC', data: gammaTag() },
    { name: 'bTRC', data: gammaTag() },
    { name: 'cprt', data: textTag('Public Domain — Werte nach IEC 61966-2-1') },
  ];

  const HEADER = 128;
  const tabelle = 4 + tags.length * 12;
  let offset = aufVier(HEADER + tabelle);

  const platzierung = tags.map((t) => {
    const eintrag = { ...t, offset, size: t.data.length };
    offset = aufVier(offset + t.data.length);
    return eintrag;
  });

  const gesamt = offset;
  const buf = new ArrayBuffer(gesamt);
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // === Kopf ===
  schreibeUint32(v, 0, gesamt);
  schreibeUint32(v, 4, 0);                    // bevorzugtes CMM: keins
  schreibeUint32(v, 8, 0x02100000);           // Version 2.1.0
  schreibeUint32(v, 12, sig('mntr'));         // Geräteklasse: Anzeige
  schreibeUint32(v, 16, sig('RGB '));
  schreibeUint32(v, 20, sig('XYZ '));         // Verbindungsfarbraum
  // Erstellungsdatum: fest, damit dasselbe Profil immer dieselben Bytes ergibt
  // — ein wechselnder Zeitstempel machte jedes PDF byteweise verschieden und
  // damit unvergleichbar.
  v.setUint16(24, 2026, false); v.setUint16(26, 1, false); v.setUint16(28, 1, false);
  v.setUint16(30, 0, false); v.setUint16(32, 0, false); v.setUint16(34, 0, false);
  schreibeUint32(v, 36, sig('acsp'));         // Pflicht-Signatur
  schreibeUint32(v, 40, 0);                   // Plattform: keine
  schreibeUint32(v, 44, 0);                   // Flags
  schreibeUint32(v, 48, 0);                   // Hersteller
  schreibeUint32(v, 52, 0);                   // Modell
  schreibeUint32(v, 56, 0); schreibeUint32(v, 60, 0);  // Geräteattribute
  schreibeUint32(v, 64, 0);                   // Rendering Intent: perzeptiv
  v.setInt32(68, s15Fixed16(D50[0]), false);
  v.setInt32(72, s15Fixed16(D50[1]), false);
  v.setInt32(76, s15Fixed16(D50[2]), false);
  schreibeUint32(v, 80, 0);                   // Erzeuger
  // 84..127 bleiben Null (Profil-ID und Reserve).

  // === Tag-Tabelle ===
  schreibeUint32(v, HEADER, tags.length);
  platzierung.forEach((t, i) => {
    const p = HEADER + 4 + i * 12;
    schreibeUint32(v, p, sig(t.name));
    schreibeUint32(v, p + 4, t.offset);
    schreibeUint32(v, p + 8, t.size);
  });

  for (const t of platzierung) bytes.set(t.data, t.offset);
  return bytes;
}

/** Wie viele Farbkanäle das Profil beschreibt — das PDF muss es als `/N` nennen. */
export const SRGB_KANAELE = 3;
export const SRGB_KENNUNG = 'sRGB IEC61966-2.1';
