# payments

PIX cash-in via `FakePixProvider` (HTTP client of `fake-pix-provider`).

- `POST /v1/payments` → Go `POST /v1/charges` → `PENDING` + QR + copia-e-cola
- `GET /v1/payments/{id}` → status (scoped to partner)
- Amounts: BigInt minor units; JSON integers; currency `BRL` in v1 (`currency ≠ BRL` → `validation_error` 422, Go is not called)
- Go down / timeout / neither 200 nor 201 → HTTP 502 (no domain code, not `1015`)
- `providerChargeId` stores the Go charge `id` (not exposed on partner JSON); `providerTxId` stays null until `payment.paid`
- With `Idempotency-Key`, create inserts the key already carrying a stable `resource_id` UUID, keeps the key on throw, and resumes that UUID on retry so Go CreateOrGet returns the same charge (see fase 10)
- Without the header, create stays non-idempotent (new UUID)
- Service: `PaymentsService`; enum: `PaymentStatus`
- Spec: `Docs/specs/fase-1-payments-auth.md`, `Docs/specs/fase-9-fake-pix-http.md`, `Docs/specs/fase-10-charge-retry.md`
