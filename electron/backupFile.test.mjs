import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import bf from './backupFile.cjs';
import bk from './backupKey.cjs';

let dir;
const SCHLUESSEL = nodeCrypto.randomBytes(32).toString('hex');
const FREMD = nodeCrypto.randomBytes(32).toString('hex');

const sha = (b) => nodeCrypto.createHash('sha256').update(b).digest('hex');

/** Ein Bestand, der die Umlaute mitnimmt — genau daran scheitert falsche Kodierung. */
const BESTAND = JSON.stringify({
  customers: [{ id: 'k1', name: 'Müller & Söhne GmbH' }],
  entries: [{ id: 'e1', description: 'Größe prüfen, 3 m²' }],
});

const beleg = (text) => Buffer.from(text, 'utf8');

function datei(name = 'sicherung.kvbak') {
  return path.join(dir, name);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-backupfile-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Sicherung schreiben und lesen', () => {
  it('gibt den Datenbestand unverändert zurück', async () => {
    const file = datei();
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND });
    const header = bf.readHeader(file);
    expect(bf.openState(file, header, SCHLUESSEL)).toBe(BESTAND);
  });

  it('schreibt nichts im Klartext auf die Platte', async () => {
    const file = datei();
    await bf.writeBackup({
      file, keyHex: SCHLUESSEL, stateJson: BESTAND,
      attachments: [{ id: 'a1', filename: 'r.pdf', sha256: sha(beleg('%PDF-geheim')) }],
      readAttachment: async () => beleg('%PDF-geheim'),
    });
    const roh = fs.readFileSync(file).toString('latin1');
    expect(roh).not.toContain('Müller');
    expect(roh).not.toContain('geheim');
    expect(roh).not.toContain(SCHLUESSEL);
  });

  it('nimmt die Belege mit und stellt sie wieder her', async () => {
    const file = datei();
    const inhalte = { a1: beleg('%PDF-eins'), a2: beleg('%PDF-zwei') };
    await bf.writeBackup({
      file, keyHex: SCHLUESSEL, stateJson: BESTAND,
      attachments: Object.keys(inhalte).map((id) => ({ id, filename: `${id}.pdf`, sha256: sha(inhalte[id]) })),
      readAttachment: async (id) => inhalte[id],
    });

    const header = bf.readHeader(file);
    expect(header.attachments).toHaveLength(2);

    const geschrieben = {};
    const ergebnis = await bf.extractAttachments(file, header, SCHLUESSEL, async (id, plain) => {
      geschrieben[id] = plain;
    });
    expect(ergebnis.restored).toBe(2);
    expect(ergebnis.failed).toEqual([]);
    expect(geschrieben.a1.equals(inhalte.a1)).toBe(true);
    expect(geschrieben.a2.equals(inhalte.a2)).toBe(true);
  });

  it('überspringt fehlende Belege und meldet sie, statt sie zu verschweigen', async () => {
    const file = datei();
    const ergebnis = await bf.writeBackup({
      file, keyHex: SCHLUESSEL, stateJson: BESTAND,
      attachments: [
        { id: 'da', filename: 'da.pdf' },
        { id: 'weg', filename: 'weg.pdf' },
      ],
      readAttachment: async (id) => {
        if (id === 'weg') throw new Error('Anhang nicht gefunden.');
        return beleg('%PDF-da');
      },
    });
    expect(ergebnis.attachmentCount).toBe(1);
    expect(ergebnis.skippedAttachments).toHaveLength(1);
    expect(ergebnis.skippedAttachments[0].id).toBe('weg');
    // Auch die Datei selbst muss das sagen, nicht nur der Rückgabewert.
    expect(bf.readHeader(file).skippedAttachments[0].id).toBe('weg');
  });

  it('deckt einen verfälschten Beleg über die Prüfsumme auf', async () => {
    const file = datei();
    const echt = beleg('%PDF-echt');
    await bf.writeBackup({
      file, keyHex: SCHLUESSEL, stateJson: BESTAND,
      // Prüfsumme absichtlich falsch — so, als wäre der Beleg vertauscht worden.
      attachments: [{ id: 'a1', filename: 'a.pdf', sha256: sha(beleg('%PDF-anders')) }],
      readAttachment: async () => echt,
    });
    const header = bf.readHeader(file);
    const ergebnis = await bf.extractAttachments(file, header, SCHLUESSEL, async () => {});
    expect(ergebnis.restored).toBe(0);
    expect(ergebnis.failed[0].grund).toMatch(/Prüfsumme/);
  });

  it('verweigert einen fremden Schlüssel', async () => {
    const file = datei();
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND });
    const header = bf.readHeader(file);
    expect(() => bf.openState(file, header, FREMD)).toThrow();
  });

  it('merkt, wenn am Rumpf gedreht wurde', async () => {
    const file = datei();
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND });
    const header = bf.readHeader(file);
    const roh = fs.readFileSync(file);
    roh[roh.length - 1] ^= 0xff;
    fs.writeFileSync(file, roh);
    expect(() => bf.openState(file, header, SCHLUESSEL)).toThrow();
  });

  it('trägt den Wiederherstellungs-Umschlag mit sich', async () => {
    const file = datei();
    const umschlag = { version: 1, kdf: { algo: 'scrypt', salt: 'AAAA' }, wrapped: 'xyz' };
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND, recoveryEnvelope: umschlag });
    expect(bf.readHeader(file).recovery).toEqual(umschlag);
  });

  it('lässt sich ohne Schlüssel begutachten', async () => {
    const file = datei();
    await bf.writeBackup({
      file, keyHex: SCHLUESSEL, stateJson: BESTAND, appVersion: '1.2.0',
      attachments: [{ id: 'a1', sha256: sha(beleg('x')) }],
      readAttachment: async () => beleg('x'),
    });
    const header = bf.readHeader(file);
    expect(header.appVersion).toBe('1.2.0');
    expect(header.attachments).toHaveLength(1);
    expect(header.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('bricht ohne Schlüssel ab, statt Klartext zu schreiben', async () => {
    const file = datei();
    await expect(bf.writeBackup({ file, keyHex: null, stateJson: BESTAND })).rejects.toThrow(/abgebrochen/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('lässt keine halbe Sicherung zurück, wenn das Schreiben scheitert', async () => {
    // Eine Sicherung, die abbricht und trotzdem eine Datei hinterlässt, ist
    // schlimmer als keine: Sie sieht aus wie eine.
    const file = datei();
    // Der Rumpf lässt sich schreiben, das Ziel nicht: `file` ist ein
    // Verzeichnis, `openSync(file, 'w')` scheitert daran.
    fs.mkdirSync(file);
    await expect(bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND }))
      .rejects.toThrow();
    expect(fs.existsSync(`${file}.part`)).toBe(false);
    fs.rmdirSync(file);
  });

  it('räumt die Beidatei auch im Erfolgsfall weg', async () => {
    const file = datei();
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND });
    expect(fs.existsSync(`${file}.part`)).toBe(false);
  });
});

describe('Format erkennen', () => {
  it('erkennt eine Sicherung im Format 2 an der Magie', async () => {
    const file = datei();
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND });
    expect(bf.isContainer(file)).toBe(true);
  });

  it('hält eine alte JSON-Sicherung nicht für einen Container', () => {
    const file = datei('alt.kvbak');
    fs.writeFileSync(file, JSON.stringify({ kavoma: 'backup', version: 1, encrypted: true }), 'utf8');
    expect(bf.isContainer(file)).toBe(false);
  });

  it('weist Datenmüll mit einer verständlichen Meldung ab', () => {
    const file = datei('muell.kvbak');
    fs.writeFileSync(file, 'KVBAK2\0\0' + '\xff\xff\xff\xff', 'latin1');
    expect(() => bf.readHeader(file)).toThrow(/unglaubwürdige Kopflänge/);
  });

  it('merkt, wenn die Datei abgeschnitten wurde', async () => {
    const file = datei();
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND });
    const roh = fs.readFileSync(file);
    fs.writeFileSync(file, roh.subarray(0, roh.length - 10));
    expect(() => bf.readHeader(file)).toThrow(/abgeschnitten/);
  });
});

describe('Format 1 bleibt lesbar', () => {
  it('öffnet eine alte verschlüsselte Sicherung', () => {
    // Genau so, wie `encryptBackupPayload` sie in Version 1 geschrieben hat.
    const iv = nodeCrypto.randomBytes(12);
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', Buffer.from(SCHLUESSEL, 'hex'), iv);
    const enc = Buffer.concat([cipher.update(BESTAND, 'utf8'), cipher.final()]);
    const payload = {
      kavoma: 'backup', version: 1, encrypted: true, algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      data: enc.toString('base64'),
    };
    const file = datei('alt.kvbak');
    fs.writeFileSync(file, JSON.stringify(payload), 'utf8');

    const gelesen = bf.readLegacy(file);
    expect(gelesen.kind).toBe('encrypted-v1');
    expect(bf.openLegacyEncrypted(gelesen.payload, SCHLUESSEL)).toBe(BESTAND);
  });

  it('erkennt den portablen Klartext-Export', () => {
    const file = datei('export.json');
    fs.writeFileSync(file, JSON.stringify({
      kavoma: 'portable-export', version: 1, data: JSON.parse(BESTAND),
    }), 'utf8');
    const gelesen = bf.readLegacy(file);
    expect(gelesen.kind).toBe('portable');
    expect(gelesen.payload.customers[0].name).toBe('Müller & Söhne GmbH');
  });

  it('erkennt einen nackten Datenbestand', () => {
    const file = datei('nackt.json');
    fs.writeFileSync(file, BESTAND, 'utf8');
    expect(bf.readLegacy(file).kind).toBe('plain');
  });

  it('weist Unbekanntes ab', () => {
    const file = datei('fremd.json');
    fs.writeFileSync(file, JSON.stringify({ irgendwas: true }), 'utf8');
    expect(() => bf.readLegacy(file)).toThrow(/Unbekanntes Dateiformat/);
  });
});

// ============================================================
// Der Fall, um den es geht
// ============================================================
// Die beiden Module greifen erst zusammen ineinander: Der Umschlag aus
// `backupKey` wandert in den Kopf, den `backupFile` schreibt. Getrennt getestet
// beweist keines von beiden, dass eine Sicherung einen Rechnerwechsel
// übersteht — und genau das ist die Behauptung.

// Auch hier laufen echte scrypt-Ableitungen (rund eine Sekunde je Umschlag) —
// Vitests voreingestellte fünf Sekunden sind dafür zu knapp.
describe('Rechnerwechsel', { timeout: 60_000 }, () => {
  it('öffnet eine fremde Sicherung allein mit dem Code', async () => {
    // --- Rechner A ---------------------------------------------------------
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-rechnerA-'));
    const schluesselA = nodeCrypto.randomBytes(32).toString('hex');
    const { recoveryCode } = bk.createEnvelope(dirA, schluesselA);

    const belegA = beleg('%PDF-die Eingangsrechnung von 2026');
    const file = path.join(dirA, 'sicherung.kvbak');
    await bf.writeBackup({
      file,
      keyHex: schluesselA,
      stateJson: BESTAND,
      recoveryEnvelope: bk.readEnvelope(dirA),
      attachments: [{ id: 'beleg-1', filename: 'ER-2026-001.pdf', sha256: sha(belegA) }],
      readAttachment: async () => belegA,
    });

    // --- Rechner B ---------------------------------------------------------
    // Anderer Schlüsselbund, anderer Zufallsschlüssel, kein Umschlag auf der
    // Platte. Genau die Lage nach einer Systemneuinstallation.
    const schluesselB = nodeCrypto.randomBytes(32).toString('hex');
    const header = bf.readHeader(file);

    // Der lokale Weg muss hier scheitern — sonst würde der Test nichts zeigen.
    expect(() => bf.openState(file, header, schluesselB)).toThrow();

    // Der Code öffnet den mitgereisten Umschlag und gibt den Schlüssel von
    // Rechner A heraus.
    const geborgen = bk.openEnvelope(header.recovery, recoveryCode);
    expect(geborgen).toBe(schluesselA);

    expect(bf.openState(file, header, geborgen)).toBe(BESTAND);

    const wiederhergestellt = {};
    const ergebnis = await bf.extractAttachments(file, header, geborgen, async (id, plain) => {
      wiederhergestellt[id] = plain;
    });
    expect(ergebnis.restored).toBe(1);
    expect(wiederhergestellt['beleg-1'].equals(belegA)).toBe(true);

    fs.rmSync(dirA, { recursive: true, force: true });
  });

  it('bleibt ohne den richtigen Code verschlossen', async () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-rechnerA-'));
    const schluesselA = nodeCrypto.randomBytes(32).toString('hex');
    bk.createEnvelope(dirA, schluesselA);

    const file = path.join(dirA, 'sicherung.kvbak');
    await bf.writeBackup({
      file, keyHex: schluesselA, stateJson: BESTAND,
      recoveryEnvelope: bk.readEnvelope(dirA),
    });

    const header = bf.readHeader(file);
    expect(() => bk.openEnvelope(header.recovery, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ'))
      .toThrow(/falsch/);

    fs.rmSync(dirA, { recursive: true, force: true });
  });

  it('sagt deutlich, wenn eine Sicherung gar keinen Umschlag trägt', async () => {
    // Eine Sicherung, die entstand, bevor ein Code angelegt wurde. Sie ist der
    // Altbestand, den es weiterhin gibt — und der Fall, in dem die Oberfläche
    // nicht nach einem Code fragen darf, den es nicht gibt.
    const file = datei();
    await bf.writeBackup({ file, keyHex: SCHLUESSEL, stateJson: BESTAND });
    const header = bf.readHeader(file);
    expect(header.recovery).toBeNull();
    expect(() => bk.openEnvelope(header.recovery, 'egal'))
      .toThrow(/keinen Wiederherstellungs-Umschlag/);
  });
});
