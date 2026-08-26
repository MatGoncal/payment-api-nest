# payouts

Async payouts — debit on confirm, not create.

- `POST /v1/payouts` → `202` + `QUEUED`
- `ProcessPayoutProcessor` debits balance; insufficient → **1027**
- Spec: `Docs/specs/fase-4-payouts-splits.md`
