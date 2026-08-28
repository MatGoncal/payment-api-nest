# AcmePay payment-api-nest

NestJS 11 implementation of the shared [AcmePay v1 API](Docs/specs/API_CONTRACT.md) — PIX cash-in, idempotent webhooks, FX quotes, balances, async payouts, and payment splits.

Fictional portfolio project. Synthetic data only. No real PSP.

## Architecture

```mermaid
flowchart TB
  subgraph clients [Clients]
    Next["checkout-portal-next"]
    Go["fake-pix-provider"]
  end

  Next -->|"API key /v1/*"| API["NestJS API :3001"]
  API -->|"POST /v1/charges"| Go
  Go -->|"HMAC webhook simulate"| API

  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis / BullMQ)]

  Redis --> WH["ProcessPaymentWebhook"]
  Redis --> PO["ProcessPayout"]

  WH --> PG
  PO --> PG
  API --> Swagger[/docs]
```

`POST /v1/payments` calls Go for the QR. The signed webhook is Go `simulate`
(HMAC `t,v1`) posting to `/v1/webhooks/payment` — the Next
`POST /api/simulator/fire` path is a parallel demo, not the PSP flow.

## Quickstart (one command infra + manual migrate)

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev
```

- API: `http://localhost:3001/v1`
- Swagger: `http://localhost:3001/docs`
- Demo API key: `demo-partner-key`
- Webhook secret: `dev-webhook-secret`
- `docker compose up -d` starts postgres, redis, and **fake-pix** (`:8080`). Host Node uses `.env.example` (`127.0.0.1:8080` → published port; callback `host.docker.internal:3001` so the Go container can reach the API). `--profile full` uses `http://fake-pix:8080` and callback `http://api:3001/v1/webhooks/payment`.

## Laravel vs Nest (portfolio comparison)

| Topic | pix-wallet-api (Laravel) | payment-api-nest (Nest) |
|-------|--------------------------|-------------------------|
| Runtime | PHP 8.3 in Sail only | Node 20 on host or Docker |
| ORM | Eloquent | Prisma |
| Validation | FormRequest | class-validator DTOs |
| Async jobs | Laravel Queue + Redis | BullMQ processors in-process |
| Auth | Middleware | Guards (`ApiKeyGuard`) |
| API docs | Optional | Swagger `/docs` built-in |
| Default port | 80 (Sail) | 3001 |

Both repos share the same OpenAPI contract, error codes, and integer minor-unit money rules.

## Demo PIX with fake-pix-provider

QR comes from the `fake-pix` container (`docker compose up -d`, published
`:8080`). Nest on the host reaches it via `http://127.0.0.1:8080`. BullMQ
processors run in-process with the API, so the signed webhook from `simulate`
can mark the payment `PAID` without a separate worker.

No `go run` on the host. Smoke 502 = `docker compose stop fake-pix`.

```bash
# Create (copy `id` from the 201)
curl -s -X POST http://localhost:3001/v1/payments \
  -H "Authorization: Bearer demo-partner-key" \
  -H "Content-Type: application/json" \
  -d '{"amount":1500,"currency":"BRL","external_id":"demo-1"}'

# Lookup charge id without scraping logs
curl -s http://localhost:8080/v1/charges/by-payment/<payment_id> \
  -H "Authorization: Bearer fake-pix-demo"

# Simulate paid — Go POSTs HMAC t,v1 to FAKE_PIX_CALLBACK_URL
curl -s -X POST http://localhost:8080/v1/charges/<charge_id>/simulate \
  -H "Authorization: Bearer fake-pix-demo" \
  -H "Content-Type: application/json" \
  -d '{"type":"payment.paid"}'
```

If Go is down, `POST /v1/payments` returns **502**. Retry the same
`Idempotency-Key` after Go is up: the API keeps the key, reuses the same
payment UUID, Go `CreateOrGet` returns the same charge, and you still get
`201 PENDING`. Then simulate as above so the webhook marks it `PAID`.
Without the header, create stays non-idempotent (new UUID). USD is still
the existing `validation_error` (fase 9). The Next webhook simulator remains
a parallel path and is not required to prove Go → API.

```bash
# 1. Stop the PSP → 502; key is retained
docker compose stop fake-pix
curl -s -X POST http://localhost:3001/v1/payments \
  -H "Authorization: Bearer demo-partner-key" \
  -H "Idempotency-Key: demo-retry-1" \
  -H "Content-Type: application/json" \
  -d '{"amount":1500,"currency":"BRL","external_id":"demo-retry-1"}'

# 2. Start the PSP, then retry the same key → 201 (same payment id)
docker compose start fake-pix
curl -s -X POST http://localhost:3001/v1/payments \
  -H "Authorization: Bearer demo-partner-key" \
  -H "Idempotency-Key: demo-retry-1" \
  -H "Content-Type: application/json" \
  -d '{"amount":1500,"currency":"BRL","external_id":"demo-retry-1"}'
```

Read-only wallet vs ledger check:

```bash
npm run reconcile
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Dev server with watch |
| `npm test` | Unit tests |
| `npm run test:e2e` | Smoke e2e |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run db:seed` | Seed demo partner |
| `npm run reconcile` | Compare `available+pending` to the ledger (exit 1 on drift) |

## Docs

See [AGENTS.md](AGENTS.md) for the full module map and agent workflow.
