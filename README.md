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
docker compose up -d postgres redis
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev
```

- API: `http://localhost:3001/v1`
- Swagger: `http://localhost:3001/docs`
- Demo API key: `demo-partner-key`
- Webhook secret: `dev-webhook-secret`

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

QR comes from Go on the **host** (`go run`, `:8080`). Nest reaches it via
`http://127.0.0.1:8080`. BullMQ processors run in-process with the API, so the
signed webhook from `simulate` can mark the payment `PAID` without a separate
worker.

```bash
# In portfolio/fake-pix-provider
export WEBHOOK_SECRET=dev-webhook-secret
export FAKE_PIX_API_KEY=fake-pix-demo
export PORT=8080
go run ./cmd/provider
```

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

If Go is down, `POST /v1/payments` returns **502**. The Next webhook simulator
remains a parallel path and is not required to prove Go → API.

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
