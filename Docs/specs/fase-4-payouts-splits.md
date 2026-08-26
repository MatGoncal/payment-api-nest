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
- [x] Splits on a payment in any terminal status → 1015, stored lines untouched
- [x] Payout enqueued under the deterministic job id `payout-<id>`
- [x] Processing the same payout twice debits once
- [x] A job that keeps failing stops after 5 attempts and stays in the failed set

## Resiliência da fila

`MONEY_JOB_OPTIONS` gives both money queues 5 attempts with exponential backoff
from 5s and keeps failed jobs. Retrying is safe at any point: the payout only
leaves `QUEUED` inside the transaction that debits it, and a payout already past
`QUEUED` is skipped.

## Códigos de erro

| Código | Situação |
|--------|----------|
| 1027 | insufficient_balance |
| 1015 | settlement_failed |
