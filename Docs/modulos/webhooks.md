# webhooks

Idempotent provider events on `(provider, event_id)`.

- `POST /v1/webhooks/payment` — HMAC `X-AcmePay-Signature: sha256=<hex>`
- Duplicate replay → HTTP 200 + code **1042**
- Side effects: `ProcessPaymentWebhookProcessor` (BullMQ)
- Spec: `Docs/specs/fase-2-webhooks.md`
