# AGENTS.md — payment-api-nest (AcmePay)

> Master index for humans and AI agents. Read this **before** any implementation.

## Project summary

**AcmePay** payments API — fictional portfolio backend (NestJS 11) for PIX
cash-in, webhooks, FX rate lock, multi-currency balances, payouts, and splits.
Domain: personal skill `payments-domain`. Contract: `Docs/specs/API_CONTRACT.md` +
`Docs/specs/openapi.yaml`.

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node 20+ (host or Docker `api` service) |
| Framework | NestJS 11 |
| ORM | Prisma + PostgreSQL |
| Queue | BullMQ + Redis |
| Tests | Jest (+ supertest e2e) |
| Lint | ESLint + Prettier |
| API docs | Swagger at `/docs` |

### Environment rule

Run on host Node **or** Docker. Prisma migrations/seeds run on host against
`docker compose` Postgres:

```bash
docker compose up -d postgres redis
npx prisma migrate dev
npm run db:seed
npm run start:dev
```

See `Docs/runbooks/testes.md`.

## Module map

| Module | Responsibility | Doc |
|--------|----------------|-----|
| `auth` | Partner + `ApiKeyGuard` | `Docs/modulos/partners.md` |
| `payments` | Cash-in PIX, QR, status | `Docs/modulos/payments.md` |
| `webhooks` | Idempotent provider events | `Docs/modulos/webhooks.md` |
| `fx` | Quotes + rate lock (Fase 3) | `Docs/modulos/fx.md` |
| `balances` | Multi-currency wallet + payout holds (Fase 3, 7) | `Docs/modulos/balances.md` |
| `payouts` | Async payouts with pending reserve (Fase 4, 7) | `Docs/modulos/payouts.md` |
| `splits` | Settlement splits (Fase 4) | `Docs/modulos/splits.md` |

## Entrypoints

| Path | Notes |
|------|-------|
| `src/payments/payments.controller.ts` | `POST/GET /v1/payments` |
| `src/auth/api-key.guard.ts` | Partner auth |
| `src/payments/payments.service.ts` | Payment orchestration |
| `src/balances/balances.service.ts` | Balances + ledger |
| `src/fx/fx.service.ts` | FX quotes |
| `src/payouts/payouts.service.ts` | Async payouts |
| `src/splits/splits.service.ts` | Payment splits |
| `src/payments/fake-pix.provider.ts` | HTTP client of `fake-pix-provider` (not a real PSP) |
| `src/webhooks/process-payment-webhook.processor.ts` | Webhook side effects |
| `src/payouts/process-payout.processor.ts` | Payout confirm + pending debit |
| `src/cli/reconcile.ts` | Read-only `npm run reconcile` |
| `src/common/payment-state-machine.ts` | Allowed payment status transitions |
| `src/common/queue.config.ts` | Retry/backoff defaults for money queues |
| `prisma/schema.prisma` | Database schema |

## Quick lookup

| Want to understand… | See |
|---------------------|-----|
| Product overview | `Docs/Product/OVERVIEW.md` |
| HTTP contract | `Docs/specs/API_CONTRACT.md` |
| OpenAPI 3.1 | `Docs/specs/openapi.yaml` |
| Error codes | `Docs/specs/error-codes.md` |
| Schema | `Docs/Database/DB.md` |
| Fase 0 bootstrap | `Docs/specs/fase-0-bootstrap.md` |
| Fase 1 payments + auth | `Docs/specs/fase-1-payments-auth.md` |
| Fase 2 webhooks | `Docs/specs/fase-2-webhooks.md` |
| Fase 3 balances + FX | `Docs/specs/fase-3-balances-fx.md` |
| Fase 4 payouts + splits | `Docs/specs/fase-4-payouts-splits.md` |
| Fase 5 hardening | `Docs/specs/fase-5-hardening.md` |
| Fase 6 HMAC + Idempotency-Key | `Docs/specs/fase-6-idempotency-hmac.md` |
| Fase 7 pending payout hold | `Docs/specs/fase-7-pending-payout.md` |
| Fase 8 reconcile | `Docs/specs/fase-8-reconcile.md` |
| Fase 9 FakePix HTTP | `Docs/specs/fase-9-fake-pix-http.md` |
| Fase 10 charge retry | `Docs/specs/fase-10-charge-retry.md` |
| ADRs | `Docs/adrs/` |
| Incidents | `Docs/runbooks/incidents.md` |
| How to test | `Docs/runbooks/testes.md` |
| New Nest module skill | `.cursor/skills/nest-payment-module/SKILL.md` |

## Agent workflow (mandatory)

```
1. Read AGENTS.md
2. Read Docs/modulos/<module>.md and/or Docs/specs/<feature>.md
3. Implement following nest-payment-module skill
4. Run npm test && npm run lint && npm run build
5. If behavior changed → update spec / module doc / Postman
6. PR with checklist below
```

**Spec without test does not close. Code without updating the spec does not close.**

## Build phases

| Fase | Scope | Doc |
|------|-------|-----|
| 0 | Spec-driven bootstrap + Docker | `Docs/specs/fase-0-bootstrap.md` |
| 1 | API key auth + POST/GET payments + FakePixProvider | `Docs/specs/fase-1-payments-auth.md` |
| 2 | Idempotent webhook + BullMQ job | `Docs/specs/fase-2-webhooks.md` |
| 3 | Balances + FX quotes | `Docs/specs/fase-3-balances-fx.md` |
| 4 | Payouts + splits | `Docs/specs/fase-4-payouts-splits.md` |
| 5 | Hardening (Jest, ESLint, CI) | `Docs/specs/fase-5-hardening.md` |
| 6 | HMAC timestamp + Idempotency-Key | `Docs/specs/fase-6-idempotency-hmac.md` |
| 7 | Payout pending hold | `Docs/specs/fase-7-pending-payout.md` |
| 8 | Read-only reconcile | `Docs/specs/fase-8-reconcile.md` |
| 9 | FakePixProvider HTTP client of `fake-pix-provider` | `Docs/specs/fase-9-fake-pix-http.md` |
| 10 | Charge id + retry-safe payment create | `Docs/specs/fase-10-charge-retry.md` |

## Do NOT

- Use `float`/`number` decimals for money — integer minor units only (BigInt in DB)
- Call a real PSP — `FakePixProvider` is an HTTP client of `fake-pix-provider` only
- Copy StarsPay production code or secrets
- Invent error codes outside `error-codes.md`
- Use global prefix that breaks `/v1/*` contract paths

## Naming

- Modules: `src/<feature>/<feature>.module.ts`
- Controllers: `@Controller('v1/...')` matching OpenAPI paths
- DTOs: `class-validator` in `dto/`
- Guards: `*.guard.ts`
- Processors: `*.processor.ts` for BullMQ
- Amounts in DB: Prisma `BigInt`; JSON responses as integers

## PR checklist

- [ ] Spec in `Docs/specs/` updated (acceptance criteria checked)
- [ ] Module doc updated if behavior changed
- [ ] Jest tests cover happy path + money/idempotency edge cases
- [ ] `npm test` green
- [ ] `npm run lint` green
- [ ] No floats for money
- [ ] Postman collection updated for new/changed endpoints
- [ ] Commits small and English
