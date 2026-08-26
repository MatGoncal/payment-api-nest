# Fase 5 — Hardening (ESLint, Jest, CI, README)

## Contexto / Objetivo

Production-ready quality gates: ESLint, unit + e2e smoke tests, GitHub Actions CI
with Postgres/Redis service containers, English README with architecture diagram.

## Critérios de aceite

- [x] ESLint configured (Nest default)
- [x] Jest unit tests: PaymentService, webhook idempotency, FX money
- [x] At least one e2e smoke test (401 + Swagger)
- [x] GitHub Actions CI runs lint + test
- [x] README in English with mermaid diagram + Laravel vs Nest comparison
- [x] AGENTS.md phase table updated
- [x] Swagger at `/docs`

## Commands

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```
