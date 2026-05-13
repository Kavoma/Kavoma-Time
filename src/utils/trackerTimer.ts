interface LiveDurationInput {
  isRunning: boolean;
  startedAt: number | null;
  elapsedBefore: number;
  now?: number;
}

export function getLiveDurationSeconds({
  isRunning,
  startedAt,
  elapsedBefore,
  now = Date.now(),
}: LiveDurationInput): number {
  if (!isRunning || !startedAt) return elapsedBefore;

  return elapsedBefore + Math.max(0, Math.floor((now - startedAt) / 1000));
}
