# Fase 9 — FakePixProvider as HTTP client of fake-pix-provider

## Contexto / Objetivo

`POST /v1/payments` still returns the partner contract (`PENDING` + QR). The QR
no longer comes from an in-process EMV template. `FakePixProvider.createCharge`
becomes an HTTP client of `fake-pix-provider` (Go) via **`fetch`** (no axios).
Settlement is unchanged: the Go process POSTs the signed webhook after
`simulate`, and the BullMQ processor marks `PAID`.

No fallback EMV in-process. If Go is down, create fails with **HTTP 502**
(same envelope style as 401 — no new domain code). Do not use `1015`
(settlement).

## Endpoints (se aplicável)

Partner contract **does not change**.

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/v1/payments` | API key | Unchanged 201. Internally POSTs Go `/v1/charges`. |

Outbound (this API → Go):

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `{FAKE_PIX_BASE_URL}/v1/charges` | Bearer / `X-Api-Key` | Create charge; QR comes from 201 |

Demo lookup lives on Go (`GET /v1/charges/by-payment/{payment_id}`). Charge id
is **not** persisted here (no migration). `provider_tx_id` stays **null** on
create; `payment.paid` fills it as today.

`PaymentsService` must **`await`** `createCharge`.

## Request / Response

Outbound body (integer minor units):

```json
{
  "amount": 1500,
  "currency": "BRL",
  "payment_id": "<wallet UUID generated before the POST>",
  "callback_url": "http://127.0.0.1:3001/v1/webhooks/payment"
}
```

`FakePixProvider` still returns `{ qr_code, copy_paste, provider: "fake_pix" }`
to `PaymentsService`. Partner 201 shape is unchanged.

Partner `currency` other than `BRL` is rejected **on this API** before any Go
call. `CreatePaymentDto` `@Matches(/^BRL$/)` uses the existing class-validator
path: HTTP 400 from the pipe, envelope `validation_error` with `error.code`
422 (`domain-exception.filter.ts`). Do **not** invent a 10xx code. Go 400
`invalid_currency` still maps to 502 only as a safety net if a request
bypasses API validation.

Go down / connection refused / timeout / non-201 → HTTP **502**:

```json
{
  "error": {
    "code": 502,
    "name": "bad_gateway",
    "message": "PIX provider unavailable.",
    "details": {}
  }
}
```

On 502, `FakePixProvider` logs a short warning (HTTP status + ~200-char body
snippet, or connection/timeout class such as `connection refused` / `timeout`).
Do not log a giant body or PII. The JSON 502 envelope above does not change.

## Fluxo (passo a passo)

1. `CreatePaymentDto` rejects `currency ≠ BRL` with the existing
   `validation_error` envelope. No payments row; Go is not called.
2. `PaymentsService` generates the payment UUID **before** calling the provider.
3. `FakePixProvider` `fetch` POSTs `/v1/charges` with `amount`, `currency`,
   `payment_id`, `callback_url` (timeout ~5s).
4. On 201, persist `PENDING` with QR from the Go body. Do not store charge id
   or `provider_tx_id`.
5. Partner receives 201. Demo: `GET` Go `by-payment` → `POST .../simulate`.
6. Go POSTs HMAC `t,v1` to `callback_url`. Existing job marks `PAID`.
7. This API never fires `paid` by itself. Next `POST /api/simulator/fire`
   remains a parallel path.

## Códigos de erro

| Código | Situação |
|--------|----------|
| HTTP 400 / `error.code` 422 (`validation_error`) | `currency` is not `BRL` (rejected on the API; Go is not called; no 10xx) |
| HTTP 502 (`bad_gateway`) | Go unreachable, timeout, or non-201 (safety net includes Go 400; no new domain code; not `1015`) |

## Critérios de aceite

- [x] `FakePixProvider.createCharge` is `async` and uses `fetch` (no axios); no in-process EMV
- [x] Wallet UUID is generated before the POST and sent as `payment_id`
- [x] `provider_tx_id` remains null on create
- [x] Partner contract unchanged (`PENDING` + QR)
- [x] Go down / connection refused → HTTP 502, no `1015`
- [x] CI does not start Go: unit tests mock `fetch`; idempotency integration does not talk to a real Go process
- [x] Dedicated test: mock 201 with `00020126ACMEPAY.FAKE.PIX` + assert POST URL, `payment_id`, `callback_url`, integer `amount`
- [x] `POST /v1/payments` with `currency` other than `BRL` → `validation_error` (code 422); zero payments rows; `fetch` not called
- [x] On 502, provider logs HTTP status or error class (short; no giant body). Log text is not asserted in tests.
- [x] `BadGatewayException` through `GlobalExceptionFilter` → `{ error: { code: 502, name: 'bad_gateway', ... } }`

## Testes obrigatórios

- [x] Unit — mock `fetch` 201; create stays green
- [x] Unit — mock 201 QR prefix + assert outbound POST (URL, `payment_id`, `callback_url`, integer amount)
- [x] Unit — connection refused / fetch throw → 502
- [x] Integração de idempotency does not call a live Go process
- [x] DTO/e2e — `USD` → 422 envelope (`validation_error`); `fetch` not called
- [x] Unit — `fetch` reject `TimeoutError` / `AbortError` → `BadGatewayException`
- [x] Filter — `BadGatewayException` body is `{ error: { code: 502, name: 'bad_gateway', ... } }`

## Migrações

None. Charge id is not stored.

## Variáveis de ambiente novas

| Var | Default (Nest on host) | Default (`docker compose --profile full`) | Descrição |
|-----|------------------------|-------------------------------------------|-----------|
| `FAKE_PIX_BASE_URL` | `http://127.0.0.1:8080` | `http://host.docker.internal:8080` | Go on the host (`go run`, `:8080`). Compose `api` uses `extra_hosts: ['host.docker.internal:host-gateway']`. |
| `FAKE_PIX_API_KEY` | `fake-pix-demo` | `fake-pix-demo` | Outbound Bearer / `X-Api-Key` |
| `FAKE_PIX_CALLBACK_URL` | `http://127.0.0.1:3001/v1/webhooks/payment` | `http://localhost:3001/v1/webhooks/payment` | URL the **Go process on the host** can reach (published port) |

Compose URLs once Go is a container (fase 11):
`Docs/specs/fase-11-fake-pix-compose.md`.

## Dependências / Rollback

- Dependências: `fake-pix-provider` on the host for local demo; tests mock `fetch`.
- Rollback: restore in-process EMV in `fake-pix.provider.ts` (not in scope).
