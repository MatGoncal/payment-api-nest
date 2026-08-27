# payouts

Async payouts — reserve on create, ledger debit on confirm.

- `POST /v1/payouts` → `202` + `QUEUED` + `available → pending`
- Insufficient `available` at create → **1027**, no row
- `ProcessPayoutProcessor` confirms by debiting `pending` + ledger; domain
  failure releases the hold
- Enqueued under a deterministic job id (`payout-<id>`), so a redelivered create
  collapses into the job that already exists
- Queue defaults from `MONEY_JOB_OPTIONS`: 5 attempts, exponential backoff from
  5s, failed jobs kept. The payout only leaves `QUEUED` inside the transaction
  that confirms or releases the hold. See `Docs/runbooks/incidents.md`.
- Specs: `Docs/specs/fase-4-payouts-splits.md`, `Docs/specs/fase-7-pending-payout.md`
