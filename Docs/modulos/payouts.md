# payouts

Async payouts — debit on confirm, not create.

- `POST /v1/payouts` → `202` + `QUEUED`
- `ProcessPayoutProcessor` debits balance; insufficient → **1027**
- Enqueued under a deterministic job id (`payout-<id>`), so a redelivered create
  collapses into the job that already exists
- Queue defaults from `MONEY_JOB_OPTIONS`: 5 attempts, exponential backoff from
  5s, failed jobs kept. A failed attempt moved no money — the payout only leaves
  `QUEUED` inside the transaction that debits it — and a payout already past
  `QUEUED` is skipped
- Spec: `Docs/specs/fase-4-payouts-splits.md`
