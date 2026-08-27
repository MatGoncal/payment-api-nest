# AcmePay payment-api-nest

NestJS 11 implementation of the shared [AcmePay v1 API](Docs/specs/API_CONTRACT.md) — PIX cash-in, idempotent webhooks, FX quotes, balances, async payouts, and payment splits.

## Architecture

```mermaid
flowchart TB
  Client[Partner / Checkout] -->|Bearer or X-Api-Key| API[NestJS API :3001]
  Provider[FakePix Provider] -->|HMAC webhook| API
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis / BullMQ)]
  Redis --> WH[ProcessPaymentWebhook]
  Redis --> PO[ProcessPayout]
  WH --> PG
  PO --> PG
  API --> Swagger[/docs]
```

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
