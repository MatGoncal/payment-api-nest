# Fase 0 — Bootstrap spec-driven + Docker Compose

## Contexto / Objetivo

Scaffold `payment-api-nest` with AGENTS.md, Docs/, Cursor rules/skills, shared
API contract, and Docker Compose (Postgres + Redis). Runnable NestJS 11 app with
Prisma, Swagger at `/docs`.

## Critérios de aceite

- [x] `AGENTS.md` with stack, module map, workflow, PR checklist
- [x] `Docs/` tree: Product, specs, modulos, Database, Postman, runbooks
- [x] `API_CONTRACT.md`, `error-codes.md`, `openapi.yaml` in `Docs/specs/`
- [x] `.cursor/rules/projeto.mdc` + `nest-payment-module` skill
- [x] `docker-compose.yml` with `postgres:18-alpine` + `redis:alpine`
- [x] `.env.example` documents Postgres, Redis, webhook secret, PORT=3001
- [x] README quickstart (one-command docker + migrate + seed)
- [x] CI workflow stub (lint + test with service containers)

## Testes

- [x] `npm run build` succeeds
- [x] `docker compose up -d` brings Postgres + Redis

## Variáveis de ambiente

| Var | Default | Descrição |
|-----|---------|-----------|
| `DATABASE_URL` | see `.env.example` | PostgreSQL |
| `REDIS_HOST` / `REDIS_PORT` | localhost / 6379 | BullMQ |
| `WEBHOOK_SECRET` | `dev-webhook-secret` | HMAC for provider webhooks |
| `PORT` | `3001` | HTTP port (avoid Next clash) |
| `DEMO_PARTNER_API_KEY` | `demo-partner-key` | Seeded partner raw key |
