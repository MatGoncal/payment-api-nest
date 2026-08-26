# balances

Multi-currency partner wallet + append-only ledger.

- `GET /v1/balances`
- Credit on `payment.paid` settlement (once per payment)
- Debit on payout confirm
- Spec: `Docs/specs/fase-3-balances-fx.md`

## Invariants

- **Callers own the transaction.** `creditPayment` and `debit` take a
  `Prisma.TransactionClient`. Opening a nested `$transaction` would commit the
  ledger entry independently of the payment or payout that justifies it.
- **Idempotency is a constraint, not a check.** `balance_ledger` carries
  `UNIQUE (reference_type, reference_id, direction)`. `apply()` claims the
  reference with `INSERT ... ON CONFLICT DO NOTHING` before touching money, so
  a replayed settlement is a no-op with nothing to undo. Direction is part of
  the key, so a refund of a payment is a distinct entry.
- **Money moves in one statement.** A debit is
  `UPDATE partner_balances SET available = available - $amount WHERE ... AND available >= $amount RETURNING available`.
  No rows returned means error `1027`, and the claim is released before throwing
  so the caller can record the failure and still commit.

## Entry points

- `src/balances/balances.service.ts`
- Tests: `test/integration/ledger-idempotency.int-spec.ts`,
  `test/integration/balance-concurrency.int-spec.ts`,
  `test/integration/balances-atomicity.int-spec.ts`
