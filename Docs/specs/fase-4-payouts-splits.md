# Fase 4 — Async payouts + payment splits

## Contexto / Objetivo

Payouts are created as `QUEUED` and processed asynchronously. Debit happens on
**confirm** (BullMQ job), not on create. Splits define settlement allocation.

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/v1/payouts` | API key | Enqueue payout (`202`) |
| POST | `/v1/payments/{id}/splits` | API key | Define split lines |

## Critérios de aceite

- [x] `POST /v1/payouts` returns `202` with status `QUEUED` without debiting
- [x] Job debits on confirm; insufficient → `FAILED` + 1027 domain code
- [x] Split sum must equal payment amount → 1015 on mismatch
- [x] Splits scoped to owning partner

## Códigos de erro

| Código | Situação |
|--------|----------|
| 1027 | insufficient_balance |
| 1015 | settlement_failed |
