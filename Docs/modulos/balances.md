# balances

Multi-currency partner wallet + append-only ledger.

- `GET /v1/balances`
- Credit on `payment.paid` settlement (once per payment) — PIX never writes `pending`
- Payout create reserves `available → pending` (no ledger)
- Payout confirm consumes `pending` + ledger debit
- Invariant: `available + pending == ledger net`
- Specs: `Docs/specs/fase-3-balances-fx.md`, `Docs/specs/fase-7-pending-payout.md`,
  `Docs/specs/fase-8-reconcile.md`

## Invariants

- **Callers own the transaction.** `creditPayment`, `debit`, `reserve`,
  `release`, and `confirmDebit` take a `Prisma.TransactionClient`. Opening a
  nested `$transaction` would commit independently of the payment or payout
  that justifies it.
- **Idempotency is a constraint, not a check.** `balance_ledger` carries
  `UNIQUE (reference_type, reference_id, direction)`. `apply()` / `confirmDebit`
  claim the reference with `INSERT ... ON CONFLICT DO NOTHING` before touching
  money, so a replayed settlement is a no-op with nothing to undo.
- **Money moves in one statement.** A hold is
  `UPDATE ... SET available = available - $amount, pending = pending + $amount WHERE available >= $amount`.
  No rows returned means error `1027`.

## Entry points

- `src/balances/balances.service.ts`
- `src/cli/reconcile.ts` (`npm run reconcile`)
- Tests: `test/integration/ledger-idempotency.int-spec.ts`,
  `test/integration/balance-concurrency.int-spec.ts`,
  `test/integration/balances-atomicity.int-spec.ts`,
  `test/integration/payout-pending.int-spec.ts`,
  `test/integration/reconcile.int-spec.ts`
- ADR: `Docs/adrs/004-available-vs-pending.md`
