# Fase 3 — Multi-currency balances + FX rate lock

## Contexto / Objetivo

Partner wallets hold balances per currency with an immutable ledger.
FX quotes lock a synthetic rate for 5 minutes (`quote_id` + `expires_at`).

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/v1/balances` | API key | Available + pending by currency |
| POST | `/v1/fx/quotes` | API key | Create quote with rate lock |

## Critérios de aceite

- [x] Paid webhook credits partner balance + ledger once
- [x] `GET /v1/balances` returns integer minor units
- [x] `POST /v1/fx/quotes` returns `quote_id`, string `rate`, `expires_at`
- [x] Rate lock default is 300 seconds
- [x] No float used for money math
- [x] Jest covers FX conversion unit test

## Códigos de erro

| Código | Situação |
|--------|----------|
| 1031 | quote_expired (consumption) |

## Env

| Var | Default | Descrição |
|-----|---------|-----------|
| `FX_RATE_LOCK_SECONDS` | `300` | Rate lock window |
