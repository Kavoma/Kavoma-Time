import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bk from './backupKey.cjs';

// Der Umschlag benutzt die echten scrypt-Parameter (N=2^17, rund eine Sekunde
// pro Ableitung). Das ist Absicht und wird hier nicht weggedreht: Was die
// Wiederherstellung schützt, soll genau so getestet werden, wie es läuft.
//
// Deshalb die grosszügige Frist. Vitests Voreinstellung von fünf Sekunden
// reicht nicht: Ein Test, der zweimal einen Umschlag anlegt und zweimal
// öffnet, braucht allein vier Sekunden Rechenzeit — unter Last kippt er dann
// über die Grenze und meldet einen Fehler, den es nicht gibt.
const FRIST = { timeout: 60_000 };

let dir;
const SCHLUESSEL = 'a'.repeat(64);   // 32 Byte als Hex

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-backupkey-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Wiederherstellungs-Umschlag', FRIST, () => {
  it('gibt den Schlüssel gegen den richtigen Code wieder heraus', () => {
    const { recoveryCode } = bk.createEnvelope(dir, SCHLUESSEL);
    expect(bk.openEnvelope(bk.readEnvelope(dir), recoveryCode)).toBe(SCHLUESSEL);
  });

  it('legt den Code nirgends ab — auf der Platte steht nur der Umschlag', () => {
    const { recoveryCode } = bk.createEnvelope(dir, SCHLUESSEL);
    const roh = fs.readFileSync(bk.envelopePath(dir), 'utf8');
    expect(roh).not.toContain(recoveryCode);
    expect(roh).not.toContain(recoveryCode.replace(/-/g, ''));
    // Und der Schlüssel selbst erst recht nicht.
    expect(roh).not.toContain(SCHLUESSEL);
  });

  it('verweigert einen falschen Code', () => {
    bk.createEnvelope(dir, SCHLUESSEL);
    expect(() => bk.openEnvelope(bk.readEnvelope(dir), 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ'))
      .toThrow(/falsch/);
  });

  it('ist bei der Schreibweise nachsichtig', () => {
    const { recoveryCode } = bk.createEnvelope(dir, SCHLUESSEL);
    const geschludert = recoveryCode.toLowerCase().replace(/-/g, ' ');
    expect(bk.openEnvelope(bk.readEnvelope(dir), geschludert)).toBe(SCHLUESSEL);
  });

  it('legt nicht versehentlich einen zweiten an', () => {
    bk.createEnvelope(dir, SCHLUESSEL);
    expect(() => bk.createEnvelope(dir, SCHLUESSEL)).toThrow(/bereits/);
  });

  it('ersetzt den Umschlag nur, wenn es ausdrücklich verlangt wird', () => {
    const erster = bk.createEnvelope(dir, SCHLUESSEL).recoveryCode;
    const zweiter = bk.createEnvelope(dir, SCHLUESSEL, { force: true }).recoveryCode;
    expect(zweiter).not.toBe(erster);
    // Der alte Code öffnet den neuen Umschlag nicht mehr. Alte Sicherungen
    // tragen ihren eigenen Umschlag bei sich und bleiben mit dem alten Code
    // lesbar — genau das muss die Oberfläche sagen.
    expect(() => bk.openEnvelope(bk.readEnvelope(dir), erster)).toThrow();
    expect(bk.openEnvelope(bk.readEnvelope(dir), zweiter)).toBe(SCHLUESSEL);
  });

  it('meldet ohne Umschlag ehrlich nichts', () => {
    expect(bk.hasEnvelope(dir)).toBe(false);
    expect(bk.readEnvelope(dir)).toBeNull();
    expect(bk.verifyCode(dir, 'irgendwas')).toBe(false);
  });

  it('prüft einen Code, ohne am Umschlag selbst zu rühren', () => {
    const { recoveryCode } = bk.createEnvelope(dir, SCHLUESSEL);
    const vorher = bk.readEnvelope(dir);
    expect(bk.verifyCode(dir, recoveryCode)).toBe(true);
    expect(bk.verifyCode(dir, 'ZZZZ-ZZZZ')).toBe(false);
    const nachher = bk.readEnvelope(dir);
    expect(nachher.wrapped).toBe(vorher.wrapped);
    expect(nachher.kdf).toEqual(vorher.kdf);
  });

  it('hält fest, dass der Code einmal richtig abgetippt wurde', () => {
    // Einen Umschlag anzulegen ist ein Klick; den Code zu besitzen ist etwas
    // anderes. Nur das zweite zählt.
    const { recoveryCode } = bk.createEnvelope(dir, SCHLUESSEL);
    expect(bk.readEnvelope(dir).confirmedAt).toBeUndefined();

    expect(bk.verifyCode(dir, 'ZZZZ-ZZZZ')).toBe(false);
    expect(bk.readEnvelope(dir).confirmedAt).toBeUndefined();

    expect(bk.verifyCode(dir, recoveryCode)).toBe(true);
    expect(bk.readEnvelope(dir).confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('setzt die Bestätigung mit einem neuen Code zurück', () => {
    const { recoveryCode } = bk.createEnvelope(dir, SCHLUESSEL);
    bk.verifyCode(dir, recoveryCode);
    bk.createEnvelope(dir, SCHLUESSEL, { force: true });
    expect(bk.readEnvelope(dir).confirmedAt).toBeUndefined();
  });

  it('legt ohne Schlüssel keinen Umschlag an', () => {
    expect(() => bk.createEnvelope(dir, null)).toThrow(/ohne Verschlüsselungsschlüssel/i);
    expect(fs.existsSync(bk.envelopePath(dir))).toBe(false);
  });

  it('behandelt einen kaputten Umschlag wie keinen', () => {
    bk.createEnvelope(dir, SCHLUESSEL);
    fs.writeFileSync(bk.envelopePath(dir), '{ das ist kein JSON', 'utf8');
    expect(bk.readEnvelope(dir)).toBeNull();
    expect(bk.hasEnvelope(dir)).toBe(false);
  });
});
