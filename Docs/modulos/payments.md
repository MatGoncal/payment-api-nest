# payments

PIX cash-in via `FakePixProvider`.

- `POST /v1/payments` → `PENDING` + QR + copia-e-cola
- `GET /v1/payments/{id}` → status (scoped to partner)
- Amounts: BigInt minor units; JSON integers
- Service: `PaymentsService`; enum: `PaymentStatus`
- Spec: `Docs/specs/fase-1-payments-auth.md`
