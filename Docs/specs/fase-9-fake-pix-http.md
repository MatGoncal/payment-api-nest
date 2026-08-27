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

Go down / connection refused / non-201 (including Go 400 for `currency ≠ BRL`)
→ HTTP **502**:

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

## Fluxo (passo a passo)

1. `PaymentsService` generates the payment UUID **before** calling the provider.
2. `FakePixProvider` `fetch` POSTs `/v1/charges` with `amount`, `currency`,
   `payment_id`, `callback_url` (timeout ~5s).
3. On 201, persist `PENDING` with QR from the Go body. Do not store charge id
   or `provider_tx_id`.
4. Partner receives 201. Demo: `GET` Go `by-payment` → `POST .../simulate`.
5. Go POSTs HMAC `t,v1` to `callback_url`. Existing job marks `PAID`.
6. This API never fires `paid` by itself. Next `POST /api/simulator/fire`
   remains a parallel path.

## Códigos de erro

| Código | Situação |
|--------|----------|
| HTTP 502 (`bad_gateway`) | Go unreachable, timeout, or non-201 (no new domain code; not `1015`) |

## Critérios de aceite

- [x] `FakePixProvider.createCharge` is `async` and uses `fetch` (no axios); no in-process EMV
- [x] Wallet UUID is generated before the POST and sent as `payment_id`
- [x] `provider_tx_id` remains null on create
- [x] Partner contract unchanged (`PENDING` + QR)
- [x] Go down / connection refused → HTTP 502, no `1015`
- [x] CI does not start Go: unit tests mock `fetch`; idempotency integration does not talk to a real Go process
- [x] Dedicated test: mock 201 with `00020126ACMEPAY.FAKE.PIX` + assert POST URL, `payment_id`, `callback_url`, integer `amount`

## Testes obrigatórios

- [x] Unit — mock `fetch` 201; create stays green
- [x] Unit — mock 201 QR prefix + assert outbound POST (URL, `payment_id`, `callback_url`, integer amount)
- [x] Unit — connection refused / fetch throw → 502
- [x] Integração de idempotency does not call a live Go process

## Migrações

None. Charge id is not stored.

## Variáveis de ambiente novas

| Var | Default (Nest on host) | Descrição |
|-----|------------------------|-----------|
| `FAKE_PIX_BASE_URL` | `http://127.0.0.1:8080` | Go on the host (`go run`, `:8080`) |
| `FAKE_PIX_API_KEY` | `fake-pix-demo` | Outbound Bearer / `X-Api-Key` |
| `FAKE_PIX_CALLBACK_URL` | `http://127.0.0.1:3001/v1/webhooks/payment` | URL the Go process can reach |

## Dependências / Rollback

- Dependências: `fake-pix-provider` on the host for local demo; tests mock `fetch`.
- Rollback: restore in-process EMV in `fake-pix.provider.ts` (not in scope).
