# Fase 11 — fake-pix no compose Nest

## Contexto / Objetivo

Demo still needs `go run` on the host. `fake-pix-provider` fase 3 adds a
Dockerfile. This phase adds `fake-pix` to the **default** compose (always on
with Postgres/Redis) so `docker compose up -d` starts the PSP without a Go
toolchain.

Two API placements, two URL sets:

| API process | `FAKE_PIX_BASE_URL` | `FAKE_PIX_CALLBACK_URL` |
|-------------|---------------------|-------------------------|
| Host (`npm run start:dev`) | `http://127.0.0.1:8080` (published port) | `http://host.docker.internal:3001/v1/webhooks/payment` (Go container → host) |
| Container (`--profile full`) | `http://fake-pix:8080` | `http://api:3001/v1/webhooks/payment` |

`callback_url` of `http://127.0.0.1:3001/...` is wrong once Go is in Docker
(`127.0.0.1` is the Go container). `fake-pix` gets
`extra_hosts: host.docker.internal:host-gateway`.

Do **not** merge with Laravel Sail. Partner JSON / OpenAPI unchanged. Jest
keeps mocked `fetch` — CI still does not start Go.

## Endpoints (se aplicável)

Partner contract unchanged.

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/v1/payments` | API key + optional `Idempotency-Key` | Unchanged. Internally POSTs Go `/v1/charges`. |

## Request / Response

Outbound body unchanged except `callback_url` depends on where the API runs
(table above). Partner 201 shape unchanged. Go down → HTTP **502**.

## Fluxo (passo a passo)

1. `docker-compose.yml`: service `fake-pix` (no profile), build
   `context: ../fake-pix-provider`, publish `8080:8080`, HEALTHCHECK.
2. `api` (`--profile full`): `FAKE_PIX_BASE_URL=http://fake-pix:8080`,
   `FAKE_PIX_CALLBACK_URL=http://api:3001/v1/webhooks/payment`,
   `depends_on.fake-pix` healthy. Can drop `host.docker.internal` as the Go
   base URL (keep `extra_hosts` on `fake-pix` for the host-API path).
3. `.env.example` (host API): base `http://127.0.0.1:8080`, callback
   `http://host.docker.internal:3001/v1/webhooks/payment`.
4. README: `docker compose up -d` starts postgres, redis, **and** fake-pix.
   `go run` is no longer the demo path. Smoke 502 = `docker compose stop fake-pix`.
5. Unit/int tests still mock `fetch`; they may keep `127.0.0.1` in the test env.

## Códigos de erro

| Código | Situação |
|--------|----------|
| HTTP 400 / `error.code` 422 (`validation_error`) | `currency` is not `BRL` (unchanged) |
| HTTP 502 (`bad_gateway`) | `fake-pix` stopped / timeout (unchanged envelope) |

## Critérios de aceite

- [x] `docker compose up -d` starts Go without a toolchain on the host
- [x] Host API: create → by-payment → simulate → `PAID` without `go run`
- [x] `docker compose stop fake-pix` → POST with `Idempotency-Key` → 502; start → retry same key → 201 same `id`
- [x] `--profile full` uses container DNS for base URL and `http://api:3001/...` for callback
- [x] Jest / int tests still mock `fetch`; CI does not start the Go container
- [x] No mega-compose with Laravel; no `provider_charge_id` on partner JSON

## Testes obrigatórios

- [x] Existing `npm test` green (mocked `fetch`)
- [x] No new test that requires a live `fake-pix` container
- [x] README smoke (manual): 502 → retry → simulate → `PAID`

## Migrações

None.

## Variáveis de ambiente novas

Same names; **defaults change** for callback when Go is containerized:

| Var | Default (host API) | Default (`--profile full`) | Descrição |
|-----|--------------------|----------------------------|-----------|
| `FAKE_PIX_BASE_URL` | `http://127.0.0.1:8080` | `http://fake-pix:8080` | Published port vs container DNS |
| `FAKE_PIX_API_KEY` | `fake-pix-demo` | `fake-pix-demo` | Outbound Bearer / `X-Api-Key` |
| `FAKE_PIX_CALLBACK_URL` | `http://host.docker.internal:3001/v1/webhooks/payment` | `http://api:3001/v1/webhooks/payment` | URL the **Go container** can reach |

## Dependências / Rollback

- Dependências: sibling `../fake-pix-provider` with fase 3 `Dockerfile`.
  `WEBHOOK_SECRET` must match. Do not run Laravel Sail and Nest fake-pix
  publishes on host `:8080` at the same time (two stacks, two paths).
- Rollback: drop the compose service; restore `go run` + callback
  `http://127.0.0.1:3001/v1/webhooks/payment`.
- Out of scope: durable Go store (fase 12), `Idempotency-Key` on Next (fase 13),
  EMV fallback, unified Laravel+Nest compose.
