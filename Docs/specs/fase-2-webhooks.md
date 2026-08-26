# Fase 2 — Idempotent payment webhook + BullMQ job

## Contexto / Objetivo

Provider notifies payment status changes. Events are idempotent on
`(provider, event_id)`. Side effects run via `ProcessPaymentWebhookProcessor`.

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/v1/webhooks/payment` | HMAC signature | Provider event |

## Fluxo

1. Verify `X-AcmePay-Signature` = `sha256=` + HMAC-SHA256(raw body, `WEBHOOK_SECRET`).
2. Insert `webhook_events` with unique `(provider, event_id)`.
3. On unique violation → `200` `{ accepted: true, duplicate: true, error: { code: 1042, ... } }`.
4. On first insert → enqueue BullMQ job.
5. Job transitions payment status (`payment.paid` → `PAID`, etc.) once.

## Máquina de estados

`PENDING` is the only open state; `PAID`, `EXPIRED`, `FAILED` and `CANCELLED`
are terminal. `PaymentStateMachine` owns the matrix, and the processor silently
ignores any event that would move a payment out of a terminal status — the
provider gets `200` so it stops retrying.

## Validação do valor liquidado

`data.amount` and `data.currency` are required for `payment.paid` (missing →
`422`). The processor compares them against the stored charge before crediting:
a divergence is logged with code `1015`, nothing is credited, and the payment
stays `PENDING` so a corrected event can still settle it.

## Resiliência da fila

The queue is registered with `MONEY_JOB_OPTIONS`: 5 attempts, exponential
backoff from 5s, failed jobs kept for inspection. Replays are safe: the ledger's
unique `(reference_type, reference_id, direction)` makes a repeated credit a
no-op.

## Critérios de aceite

- [x] Valid signed `payment.paid` moves payment to `PAID` and sets `paid_at`
- [x] Replay of same `event_id` does not double-apply; returns duplicate + 1042
- [x] Invalid signature → 401
- [x] Unique DB constraint on `(provider, event_id)`
- [x] Jest covers idempotency unit test
- [x] `EXPIRED`/`FAILED`/`CANCELLED` payment ignores a later `payment.paid`
- [x] `payment.paid` with a divergent amount or currency credits nothing
- [x] `payment.paid` without `data.amount`/`data.currency` → 422
- [x] Queue declares attempts + exponential backoff and keeps failed jobs

## Códigos de erro

| Código | Situação |
|--------|----------|
| 1042 | duplicate_event |
| 1015 | settlement_failed (payload diverges from the charge; logged, not returned) |

## Env

| Var | Default | Descrição |
|-----|---------|-----------|
| `WEBHOOK_SECRET` | `dev-webhook-secret` | HMAC secret |
