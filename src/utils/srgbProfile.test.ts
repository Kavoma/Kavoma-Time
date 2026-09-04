// Das ICC-Profil wird von fremder Software gelesen — von jedem Prüfprogramm,
// das die Ausgabebedingung nachrechnet, und von jedem Betrachter, der die
// Farben richtig darstellen will. Ein Byte an der falschen Stelle, und das
// PDF fällt durch, ohne dass man beim Ansehen etwas merkt.

import { describe, expect, it } from 'vitest';
import { SRGB_KANAELE, buildSrgbProfile } from './srgbProfile';

const profil = buildSrgbProfile();
const view = new DataView(profil.buffer, profil.byteOffset, profil.byteLength);
const sig = (offset: number) =>
  String.fromCharCode(...profil.slice(offset, offset + 4));

describe('Kopf', () => {
  it('nennt die eigene Länge korrekt', () => {
    // Ein Profil, dessen Kopf eine andere Länge angibt als die Datei hat,
    // wird von manchen Lesern stillschweigend abgeschnitten.
    expect(view.getUint32(0, false)).toBe(profil.length);
  });

  it('trägt die Pflicht-Signatur „acsp“ an Byte 36', () => {
    // Daran erkennt ein Leser überhaupt erst, dass es ein ICC-Profil ist.
    expect(sig(36)).toBe('acsp');
  });

  it('ist ein RGB-Anzeigeprofil mit XYZ als Verbindungsfarbraum', () => {
    expect(sig(12)).toBe('mntr');
    expect(sig(16)).toBe('RGB ');
    expect(sig(20)).toBe('XYZ ');
  });

  it('meldet Version 2.1', () => {
    expect(view.getUint32(8, false)).toBe(0x02100000);
  });

  it('trägt D50 als Verbindungsweisspunkt', () => {
    // ICC rechnet grundsätzlich auf D50 — hier stünde sonst der Wert, gegen
    // den alle Farben verschoben wären.
    const x = view.getInt32(68, false) / 65536;
    const y = view.getInt32(72, false) / 65536;
    const z = view.getInt32(76, false) / 65536;
    expect(x).toBeCloseTo(0.9642, 3);
    expect(y).toBeCloseTo(1.0, 3);
    expect(z).toBeCloseTo(0.8249, 3);
  });

  it('bleibt zwischen zwei Aufrufen byteweise gleich', () => {
    // Ein wechselnder Zeitstempel machte jede Rechnung binär verschieden und
    // damit unvergleichbar.
    expect(Array.from(buildSrgbProfile())).toEqual(Array.from(profil));
  });
});

describe('Tag-Tabelle', () => {
  const anzahl = view.getUint32(128, false);
  const tags = new Map<string, { offset: number; size: number }>();
  for (let i = 0; i < anzahl; i++) {
    const p = 132 + i * 12;
    tags.set(sig(p), { offset: view.getUint32(p + 4, false), size: view.getUint32(p + 8, false) });
  }

  it('enthält alle für ein Matrix-Shaper-Profil vorgeschriebenen Tags', () => {
    // Fehlt einer davon, ist das Profil unvollständig — und die
    // Ausgabebedingung damit ungültig.
    for (const pflicht of ['desc', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC', 'cprt']) {
      expect(tags.has(pflicht), `Tag ${pflicht} fehlt`).toBe(true);
    }
  });

  it('legt jeden Tag an eine durch vier teilbare Stelle', () => {
    // Das verlangt die ICC-Spezifikation ausdrücklich.
    for (const [name, t] of tags) {
      expect(t.offset % 4, `${name} liegt schief`).toBe(0);
    }
  });

  it('lässt keinen Tag über das Dateiende hinausragen', () => {
    for (const [name, t] of tags) {
      expect(t.offset + t.size, `${name} ragt hinaus`).toBeLessThanOrEqual(profil.length);
    }
  });

  it('gibt den Primärvalenzen die an D50 angepassten sRGB-Werte', () => {
    // Wer hier die D65-Werte einsetzt, bekommt ein Profil, das lädt und
    // trotzdem falsche Farben beschreibt.
    const rot = tags.get('rXYZ')!;
    expect(sig(rot.offset)).toBe('XYZ ');
    expect(view.getInt32(rot.offset + 8, false) / 65536).toBeCloseTo(0.4360, 3);
    const gruen = tags.get('gXYZ')!;
    expect(view.getInt32(gruen.offset + 12, false) / 65536).toBeCloseTo(0.7169, 3);
    const blau = tags.get('bXYZ')!;
    expect(view.getInt32(blau.offset + 16, false) / 65536).toBeCloseTo(0.7139, 3);
  });

  it('beschreibt die Tonwertkurven als Gamma 2,2', () => {
    for (const name of ['rTRC', 'gTRC', 'bTRC']) {
      const t = tags.get(name)!;
      expect(sig(t.offset)).toBe('curv');
      expect(view.getUint32(t.offset + 8, false)).toBe(1);   // ein Stützwert
      expect(view.getUint16(t.offset + 12, false) / 256).toBeCloseTo(2.2, 2);
    }
  });

  it('trägt eine lesbare Bezeichnung', () => {
    const t = tags.get('desc')!;
    expect(sig(t.offset)).toBe('desc');
    const laenge = view.getUint32(t.offset + 8, false);
    const text = new TextDecoder().decode(profil.slice(t.offset + 12, t.offset + 12 + laenge - 1));
    expect(text).toBe('sRGB IEC61966-2.1');
  });
});

describe('Umfang', () => {
  it('bleibt klein genug, um in jede Rechnung zu passen', () => {
    // Das Profil liegt in **jedem** erzeugten PDF. Ein Megabyte-Profil wäre
    // hier ein täglicher Preis für etwas, das niemand ansieht.
    expect(profil.length).toBeLessThan(2048);
    expect(SRGB_KANAELE).toBe(3);
  });
});
