// JSON escaping takes up to six bytes per UTF-16 code unit. These ceilings
// cover the discovery contract, not just the source text (8,000 characters).
// Sessions also have an aggregate cap: cache entries cannot all be filled to
// every individual maximum simultaneously.
export const SOLVE_BODY_BYTES = {
  prompt: 60_000,
  guided: 260_000,
  promptWithFigure: 4_600_000,
  guidedWithFigure: 4_800_000,
  ask: 100_000,
  guidedAsk: 180_000,
  session: 2_000_000,
} as const;

// Two provider calls (initial output + at most one format repair) share this
// budget. Other AI workflows keep their existing provider timeout.
export const SOLVE_AI_CALL_TIMEOUT_MS = 75_000;
export const SOLVE_AI_OPERATION_TIMEOUT_MS = 155_000;
