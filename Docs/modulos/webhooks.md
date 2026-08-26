# webhooks

Idempotent provider events on `(provider, event_id)`.

- `POST /v1/webhooks/payment` — HMAC `X-AcmePay-Signature: sha256=<hex>`
- Duplicate replay → HTTP 200 + code **1042**
- Side effects: `ProcessPaymentWebhookProcessor` (BullMQ)

## Guards on the settlement path

- `data.amount` + `data.currency` are required for `payment.paid` (missing → `422`)
- `PaymentStateMachine` (`src/common/payment-state-machine.ts`) — only `PENDING`
  is open, so a late `payment.paid` never reopens an `EXPIRED`/`FAILED`/
  `CANCELLED` charge
- Payload amount/currency must match the stored charge; a divergence is logged
  as `1015`, is not credited, and leaves the payment `PENDING` for a corrected
  event

## Job resilience

The queue is registered with `MONEY_JOB_OPTIONS` (`src/common/queue.config.ts`):
5 attempts, exponential backoff from 5s, and failed jobs kept for inspection.
Retrying is safe — the ledger's unique reference makes a replayed credit a
no-op.

- Spec: `Docs/specs/fase-2-webhooks.md`
