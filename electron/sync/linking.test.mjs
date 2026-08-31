import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import l from './linking.cjs';

/** Bildet einen vollständigen Verbindungsvorgang nach. */
function verbinde() {
  const neu = l.generateLinkKeypair();      // das neue Gerät fragt an
  const alt = l.generateLinkKeypair();      // das eingerichtete antwortet
  const sharedNeu = l.deriveShared(neu.privateKey, alt.publicKey);
  const sharedAlt = l.deriveShared(alt.privateKey, neu.publicKey);
  return {
    neu, alt, sharedNeu, sharedAlt,
    codeNeu: l.deriveCode(sharedNeu, neu.publicKey, alt.publicKey),
    codeAlt: l.deriveCode(sharedAlt, alt.publicKey, neu.publicKey),
  };
}

describe('Schlüsselaustausch', () => {
  it('beide Seiten kommen auf dasselbe Geheimnis', () => {
    const v = verbinde();
    expect(v.sharedNeu.equals(v.sharedAlt)).toBe(true);
    expect(v.sharedNeu).toHaveLength(32);
  });

  it('beide Seiten zeigen dieselbe Zahl — unabhängig von der Rolle', () => {
    const v = verbinde();
    expect(v.codeNeu).toBe(v.codeAlt);
    expect(v.codeNeu).toMatch(/^\d{6}$/);
  });

  it('trägt den Datenschlüssel unverfälscht hinüber', () => {
    const v = verbinde();
    const dek = crypto.randomBytes(32);
    const paket = l.sealDek(v.sharedAlt, dek, 'link-1');
    expect(l.openDek(v.sharedNeu, paket, 'link-1').equals(dek)).toBe(true);
  });

  it('das Paket lässt sich nicht in einen anderen Vorgang verschieben', () => {
    const v = verbinde();
    const paket = l.sealDek(v.sharedAlt, crypto.randomBytes(32), 'link-1');
    expect(() => l.openDek(v.sharedNeu, paket, 'link-2')).toThrow();
  });

  it('ein Fremder mit beiden öffentlichen Schlüsseln kommt nicht heran', () => {
    const v = verbinde();
    const dek = crypto.randomBytes(32);
    const paket = l.sealDek(v.sharedAlt, dek, 'link-1');

    // Der Server sieht beide öffentlichen Hälften — mehr nicht.
    const fremd = l.generateLinkKeypair();
    const versuch = l.deriveShared(fremd.privateKey, v.neu.publicKey);
    expect(() => l.openDek(versuch, paket, 'link-1')).toThrow();
  });
});

describe('Der Zwischenmann fällt auf', () => {
  // Der wichtigste Test dieser Datei. Ohne diese Eigenschaft wäre eine
  // sechsstellige Zahl wertlos.
  it('erzeugt auf beiden Geräten verschiedene Zahlen', () => {
    const neu = l.generateLinkKeypair();
    const alt = l.generateLinkKeypair();
    // Der Angreifer schiebt beiden Seiten je einen eigenen Schlüssel unter.
    const angreiferZuNeu = l.generateLinkKeypair();
    const angreiferZuAlt = l.generateLinkKeypair();

    // Was das neue Gerät sieht und rechnet:
    const sharedNeu = l.deriveShared(neu.privateKey, angreiferZuNeu.publicKey);
    const codeNeu = l.deriveCode(sharedNeu, neu.publicKey, angreiferZuNeu.publicKey);

    // Was das alte Gerät sieht und rechnet:
    const sharedAlt = l.deriveShared(alt.privateKey, angreiferZuAlt.publicKey);
    const codeAlt = l.deriveCode(sharedAlt, alt.publicKey, angreiferZuAlt.publicKey);

    // Der Mensch tippt die eine Zahl in das andere Gerät — sie passt nicht.
    expect(codeNeu).not.toBe(codeAlt);
    expect(l.codesMatch(codeNeu, codeAlt)).toBe(false);
  });

  it('kann die Zahl nicht durch bloßes Neuwürfeln treffen', () => {
    // Grobe Abschätzung: 200 Versuche gegen eine Million Möglichkeiten.
    const alt = l.generateLinkKeypair();
    const opfer = l.generateLinkKeypair();
    const sharedOpfer = l.deriveShared(opfer.privateKey, alt.publicKey);
    const zielCode = l.deriveCode(sharedOpfer, opfer.publicKey, alt.publicKey);

    let treffer = 0;
    for (let i = 0; i < 200; i++) {
      const versuch = l.generateLinkKeypair();
      const s = l.deriveShared(versuch.privateKey, alt.publicKey);
      if (l.deriveCode(s, versuch.publicKey, alt.publicKey) === zielCode) treffer++;
    }
    expect(treffer).toBe(0);
  });
});

describe('Code-Vergleich', () => {
  it('nimmt Leerzeichen und Bindestriche hin', () => {
    expect(l.codesMatch('123456', '123 456')).toBe(true);
    expect(l.codesMatch('123456', '123-456')).toBe(true);
  });

  it('weist Abweichungen ab', () => {
    expect(l.codesMatch('123456', '123457')).toBe(false);
    expect(l.codesMatch('123456', '12345')).toBe(false);
  });

  it('weist Leeres ab, statt es durchzuwinken', () => {
    expect(l.codesMatch('', '')).toBe(false);
    expect(l.codesMatch(null, null)).toBe(false);
    expect(l.codesMatch('123456', undefined)).toBe(false);
  });
});

describe('Verteilung der Zahlen', () => {
  it('nutzt den ganzen Bereich und wiederholt sich nicht auffällig', () => {
    const codes = new Set();
    for (let i = 0; i < 300; i++) {
      const a = l.generateLinkKeypair();
      const b = l.generateLinkKeypair();
      codes.add(l.deriveCode(l.deriveShared(a.privateKey, b.publicKey), a.publicKey, b.publicKey));
    }
    // Bei einer Million Möglichkeiten wären Dubletten unter 300 Ziehungen
    // schon auffällig (Geburtstagsproblem: ~4,5 % für *irgendeine*).
    expect(codes.size).toBeGreaterThanOrEqual(299);
  });
});
