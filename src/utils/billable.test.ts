// Die Vorgabe ist hier der ganze Punkt: Ein Bestand ohne das Feld muss
// unverändert weiterzählen. Wäre die Vorgabe „nicht abrechenbar", fiele der
// Umsatz jeder alten Statistik über Nacht auf null.

import { describe, expect, it } from 'vitest';
import {
  abrechenbareSekunden, abrechenbarerAnteil, interneSekunden,
  istAbrechenbar, mitAbrechenbarkeit,
} from './billable';
import type { TimeEntry } from '../types';

const eintrag = (id: number, sekunden: number, billable?: boolean): TimeEntry => ({
  id, customerId: 1, projectId: 1, description: 'x',
  startedAt: 0, endedAt: sekunden * 1000, durationSeconds: sekunden,
  ...(billable === undefined ? {} : { billable }),
});

describe('Die Vorgabe', () => {
  it('hält einen Eintrag ohne Angabe für abrechenbar', () => {
    // So waren alle Einträge gemeint, die es vor dieser Unterscheidung gab.
    expect(istAbrechenbar(eintrag(1, 3600))).toBe(true);
  });

  it('schliesst nur bei ausdrücklichem `false` aus', () => {
    expect(istAbrechenbar(eintrag(1, 3600, false))).toBe(false);
    expect(istAbrechenbar(eintrag(1, 3600, true))).toBe(true);
  });
});

describe('Summen', () => {
  const bestand = [
    eintrag(1, 3600),            // alt, ohne Angabe
    eintrag(2, 1800, true),
    eintrag(3, 1800, false),     // intern
  ];

  it('trennt bezahlte von interner Zeit', () => {
    expect(abrechenbareSekunden(bestand)).toBe(5400);
    expect(interneSekunden(bestand)).toBe(1800);
  });

  it('rechnet den Anteil in Prozent', () => {
    expect(abrechenbarerAnteil(bestand)).toBe(75);
  });

  it('meldet keinen Anteil, wenn nichts erfasst ist', () => {
    // „0 %" wäre eine Aussage über etwas, das es nicht gibt.
    expect(abrechenbarerAnteil([])).toBeNull();
    expect(abrechenbarerAnteil([eintrag(1, 0)])).toBeNull();
  });
});

describe('Umschalten', () => {
  it('setzt `false`, wenn eine Zeit intern wird', () => {
    const nachher = mitAbrechenbarkeit(eintrag(1, 3600), false);
    expect(nachher.billable).toBe(false);
  });

  it('entfernt das Feld wieder, statt `true` stehenzulassen', () => {
    // Ein stehengelassenes `true` bedeutete dasselbe wie ein fehlendes Feld,
    // sähe für den Abgleich aber anders aus — eine Dauer-Änderung, die keine
    // ist. Derselbe Grund, aus dem `paidAt` beim Zurücknehmen einer Zahlung
    // gelöscht wird.
    const intern = mitAbrechenbarkeit(eintrag(1, 3600), false);
    const zurueck = mitAbrechenbarkeit(intern, true);
    expect('billable' in zurueck).toBe(false);
    expect(istAbrechenbar(zurueck)).toBe(true);
  });

  it('lässt den Rest des Eintrags unangetastet', () => {
    const vorher = eintrag(7, 1234);
    const nachher = mitAbrechenbarkeit(vorher, false);
    expect(nachher.id).toBe(7);
    expect(nachher.durationSeconds).toBe(1234);
    // Und es bleibt eine Kopie — der ursprüngliche Eintrag im State darf sich
    // nicht unbemerkt ändern.
    expect(vorher.billable).toBeUndefined();
  });
});
