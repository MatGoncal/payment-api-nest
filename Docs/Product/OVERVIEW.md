# Product overview — AcmePay payment-api-nest

AcmePay is a **fictional** portfolio payments platform. This repository
(`payment-api-nest`) is the NestJS 11 implementation of the shared AcmePay v1
contract consumed by `checkout-portal-next`.

## Goals

- Demonstrate the same HTTP contract as `pix-wallet-api` (Laravel) with a
  TypeScript/Nest stack: idempotent webhooks, integer money, BullMQ jobs.
- Stay demoable locally with Docker Compose (Postgres + Redis) and
  `FakePixProvider` (HTTP client of `fake-pix-provider`).
- Keep specs in git (`Docs/`) for portfolio visibility.

## Non-goals

- Real PIX / PSP connectivity
- Production-grade ledger reconciliation
- Sharing any StarsPay proprietary code

## Personas

| Persona | Need |
|---------|------|
| Partner developer | Create PIX charges, poll status, FX, balances, payouts |
| Checkout integrator | Hit Nest API from Next checkout demo |
| Interviewer | Read specs + run docker-compose + Postman |

## Success (Fases 0–5)

Partner authenticates with API key, creates PENDING payment with QR, signed
webhook moves to PAID once, balances credit, async payouts reserve on create
and debit on confirm,
splits validated at settlement.
