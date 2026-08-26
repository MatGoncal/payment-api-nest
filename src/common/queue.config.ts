import { JobsOptions } from 'bullmq';

/**
 * Defaults for the queues that move money.
 *
 * Every money job is idempotent — the ledger's unique reference and the payment
 * state machine make a replay a no-op — so retrying a transient database or
 * provider failure is always safe, and giving up silently is not: failed jobs
 * are kept for inspection and replay.
 */
export const MONEY_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: false,
};
