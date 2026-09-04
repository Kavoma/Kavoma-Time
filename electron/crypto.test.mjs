import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import c from './crypto.cjs';

// Die echten Parameter brauchen rund eine Sekunde pro Ableitung. Für die
// Regeln, die hier geprüft werden, ist das egal — nur der Test „echte
// Parameter laufen durch" verwendet sie absichtlich.
const SCHNELL = { N: 1 << 12, r: 8, p: 1 };

describe('Umschläge', () => {
  it('verschlüsselt und entschlüsselt verlustfrei', () => {
    const dek = c.generateDek();
    const text = JSON.stringify({ kunde: 'Müller GmbH', betrag: 1234.56, note: 'Größe: 3m²' });
    expect(c.open(dek, c.seal(dek, text))).toBe(text);
  });

  it('erzeugt bei gleichem Klartext verschiedene Chiffrate', () => {
    const dek = c.generateDek();
    expect(c.seal(dek, 'gleich')).not.toBe(c.seal(dek, 'gleich'));
  });

  it('verweigert einen fremden Schlüssel', () => {
    const payload = c.seal(c.generateDek(), 'geheim');
    expect(() => c.open(c.generateDek(), payload)).toThrow();
  });

  it('merkt, wenn am Chiffrat gedreht wurde', () => {
    const dek = c.generateDek();
    const blob = Buffer.from(c.seal(dek, 'unverfälscht'), 'base64');
    blob[blob.length - 1] ^= 0xff;
    expect(() => c.open(dek, blob.toString('base64'))).toThrow();
  });

  it('bindet den Umschlag an seinen Platz', () => {
    const dek = c.generateDek();
    const payload = c.seal(dek, 'Zeile A', 'user-1:op-A');
    // Dasselbe Chiffrat in eine andere Zeile verschoben lässt sich nicht öffnen.
    expect(() => c.open(dek, payload, 'user-1:op-B')).toThrow();
    expect(c.open(dek, payload, 'user-1:op-A')).toBe('Zeile A');
  });

  it('weist einen zu kurzen Umschlag mit klarer Meldung ab', () => {
    expect(() => c.open(c.generateDek(), Buffer.alloc(4).toString('base64')))
      .toThrow(/beschädigt/);
  });
});

describe('Datenschlüssel', () => {
  it('lässt sich mit der richtigen Passphrase wieder öffnen', () => {
    const dek = c.generateDek();
    const { kdf, wrapped } = c.wrapDek(dek, 'ein gutes Passwort', SCHNELL);
    expect(c.unwrapDek(wrapped, kdf, 'ein gutes Passwort').equals(dek)).toBe(true);
  });

  it('wirft bei falscher Passphrase — und verrät nichts', () => {
    const { kdf, wrapped } = c.wrapDek(c.generateDek(), 'richtig', SCHNELL);
    expect(() => c.unwrapDek(wrapped, kdf, 'falsch')).toThrow(/falsch/);
  });

  it('trägt denselben Schlüssel in zwei Umschlägen — Passphrase und Notfallcode', () => {
    const dek = c.generateDek();
    const code = c.generateRecoveryCode();
    const viaPass = c.wrapDek(dek, 'Passphrase', SCHNELL);
    const viaCode = c.wrapDek(dek, c.normalizeRecoveryCode(code), SCHNELL);

    // Beide Wege führen zum selben Datenschlüssel — genau das rettet den
    // Bestand, wenn die Passphrase verloren geht.
    expect(c.unwrapDek(viaPass.wrapped, viaPass.kdf, 'Passphrase').equals(dek)).toBe(true);
    expect(c.unwrapDek(viaCode.wrapped, viaCode.kdf, c.normalizeRecoveryCode(code)).equals(dek)).toBe(true);
  });

  it('benutzt für jeden Umschlag ein eigenes Salz', () => {
    const dek = c.generateDek();
    const a = c.wrapDek(dek, 'gleich', SCHNELL);
    const b = c.wrapDek(dek, 'gleich', SCHNELL);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.wrapped).not.toBe(b.wrapped);
  });

  it('ein Passphrase-Wechsel lässt die Daten unberührt', () => {
    const dek = c.generateDek();
    const daten = c.seal(dek, 'ein Jahr Buchhaltung');

    const alt = c.wrapDek(dek, 'alt', SCHNELL);
    const wieder = c.unwrapDek(alt.wrapped, alt.kdf, 'alt');
    const neu = c.wrapDek(wieder, 'neu', SCHNELL);

    // Nur der Umschlag wurde neu geschrieben, nicht der Bestand.
    expect(c.open(c.unwrapDek(neu.wrapped, neu.kdf, 'neu'), daten)).toBe('ein Jahr Buchhaltung');
  });
});

describe('Wiederherstellungscode', () => {
  it('ist acht Vierergruppen ohne verwechselbare Zeichen', () => {
    const code = c.generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
  });

  it('verzeiht die typischen Abtippfehler', () => {
    const roh = 'O1IL-U234-5678-9ABC-DEFG-HJKM-NPQR-STVW';
    expect(c.normalizeRecoveryCode(roh)).toBe(c.normalizeRecoveryCode(roh.toLowerCase()));
    expect(c.normalizeRecoveryCode('o1il')).toBe('0111');
    expect(c.normalizeRecoveryCode('  ABCD - EFGH  ')).toBe('ABCDEFGH');
  });

  it('wiederholt sich nicht', () => {
    const codes = new Set(Array.from({ length: 50 }, () => c.generateRecoveryCode()));
    expect(codes.size).toBe(50);
  });
});

describe('Echte Parameter', () => {
  // Der wichtigste Test dieser Datei: N=2^17 braucht rund 128 MB, Node deckelt
  // scrypt aber standardmäßig bei 32 MB. Ohne das hochgesetzte `maxmem` würde
  // die Einrichtung auf jedem Gerät scheitern — und zwar erst beim Nutzer.
  it('läuft mit den ausgelieferten Parametern durch', () => {
    const dek = c.generateDek();
    const { kdf, wrapped } = c.wrapDek(dek, 'Produktiv-Passphrase');
    expect(kdf.N).toBe(1 << 17);
    expect(c.unwrapDek(wrapped, kdf, 'Produktiv-Passphrase').equals(dek)).toBe(true);
  }, 30_000);
});
