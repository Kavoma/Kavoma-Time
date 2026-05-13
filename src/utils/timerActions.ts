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

export function runTimerCommand(state: AppState, command: TimerCommand, now = Date.now()): AppState {
  if (command === 'start') return startTimer(state, now);
  if (command === 'pause') return pauseTimer(state, now);
  if (command === 'stop') return stopTimer(state, now);

  return state.isRunning ? pauseTimer(state, now) : startTimer(state, now);
}
