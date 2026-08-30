import type { AppState, TimeEntry } from '../types';
import { getLiveDurationSeconds } from './trackerTimer';

export type TimerCommand = 'toggle' | 'start' | 'pause' | 'stop';

export function startTimer(state: AppState, now = Date.now()): AppState {
  if (state.isRunning) return state;

  return {
    ...state,
    isRunning: true,
    startedAt: now,
    sessionStartedAt: state.sessionStartedAt || now,
  };
}

export function pauseTimer(state: AppState, now = Date.now()): AppState {
  if (!state.isRunning || !state.startedAt) return state;

  return {
    ...state,
    isRunning: false,
    startedAt: null,
    elapsedBefore: getLiveDurationSeconds({
      isRunning: state.isRunning,
      startedAt: state.startedAt,
      elapsedBefore: state.elapsedBefore,
      now,
    }),
  };
}

export function stopTimer(state: AppState, now = Date.now()): AppState {
  if (!state.isRunning && state.elapsedBefore === 0) return state;

  const totalSeconds = getLiveDurationSeconds({
    isRunning: state.isRunning,
    startedAt: state.startedAt,
    elapsedBefore: state.elapsedBefore,
    now,
  });

  const resetState = {
    ...state,
    isRunning: false,
    startedAt: null,
    sessionStartedAt: null,
    elapsedBefore: 0,
    currentDescription: '',
  };

  if (totalSeconds <= 0 || !state.sessionStartedAt) return resetState;

  const newEntry: TimeEntry = {
    id: now,
    customerId: state.currentCustomerId,
    projectId: state.currentProjectId,
    description: state.currentDescription,
    startedAt: state.sessionStartedAt,
    endedAt: now,
    durationSeconds: totalSeconds,
  };

  return {
    ...resetState,
    entries: [newEntry, ...state.entries],
  };
}

/** Kunde, Projekt und Tätigkeit eines Schnellstarts aus der Menüleiste. */
export interface QuickStartTarget {
  customerId: number;
  projectId: number;
  description: string;
}

/**
 * Startet den Timer direkt auf eine Kombination aus Kunde, Projekt und
 * Tätigkeit — der Weg aus der Menüleiste heraus, ohne die App zu öffnen.
 *
 * Läuft bereits etwas (oder steht pausierte Zeit auf der Uhr), wird das zuerst
 * als eigener Eintrag abgeschlossen. Sonst würde die bisherige Zeit unter der
 * neu gewählten Tätigkeit landen.
 */
export function startTimerWith(
  state: AppState,
  target: QuickStartTarget,
  now = Date.now(),
): AppState {
  const committed = state.isRunning || state.elapsedBefore > 0
    ? stopTimer(state, now)
    : state;

  return startTimer({
    ...committed,
    currentCustomerId: target.customerId,
    currentProjectId: target.projectId,
    currentDescription: target.description,
  }, now);
}

/** Eine erkannte Abwesenheit, über die noch entschieden werden muss. */
export interface DetectedPause {
  /** Zeitpunkt, ab dem niemand mehr am Rechner war. */
  began: number;
  /** Zeitpunkt der Rückkehr. */
  ended: number;
  reason: 'idle' | 'sleep' | 'lock';
}

/**
 * Nimmt eine erkannte Pause aus dem laufenden Eintrag heraus.
 *
 * Der bisherige Eintrag endet beim Beginn der Pause und wird gesichert. Wird
 * weitergearbeitet, entsteht ein zweiter Eintrag ab der Rückkehr — mit denselben
 * Angaben. Das entspricht der Wahrheit besser als ein Eintrag mit Loch drin und
 * hält die Auswertung sauber.
 */
export function applyPause(
  state: AppState,
  pause: DetectedPause,
  continueRunning: boolean,
  now = Date.now(),
): AppState {
  if (!state.isRunning || !state.sessionStartedAt) return state;
  // Eine Pause, die vor dem Start des Eintrags begann, gehört nicht zu ihm.
  if (pause.began <= state.sessionStartedAt) return state;

  const { currentCustomerId, currentProjectId, currentDescription } = state;
  const stopped = stopTimer(state, pause.began);
  if (!continueRunning) return stopped;

  return startTimer({
    ...stopped,
    currentCustomerId,
    currentProjectId,
    currentDescription,
  }, Math.min(pause.ended, now));
}

export function runTimerCommand(state: AppState, command: TimerCommand, now = Date.now()): AppState {
  if (command === 'start') return startTimer(state, now);
  if (command === 'pause') return pauseTimer(state, now);
  if (command === 'stop') return stopTimer(state, now);

  return state.isRunning ? pauseTimer(state, now) : startTimer(state, now);
}
