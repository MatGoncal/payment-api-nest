# Runbook — testes (payment-api-nest)

Nest runs on **host Node 20+** or inside the optional `api` Docker service.

## Up (infra only)

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev
```

`docker compose up -d` starts Postgres, Redis, and **fake-pix** (no `go run`).

BullMQ workers run in-process with `@nestjs/bullmq` processors (no separate worker
command required for the demo).

## Tests

```bash
npm test              # unit (mocked Prisma where needed)
npm run test:int      # integration against a real PostgreSQL
npm run test:e2e      # smoke (may need Postgres/Redis or mocks)
npm run lint
npm run build
```

### Integration suite

Unit specs mock the Prisma client, so transaction boundaries, unique
constraints and row locks are invisible to them — exactly what the money paths
depend on. `test/integration/**/*.int-spec.ts` runs against a throwaway
database, migrating once per run and truncating every table between tests:

```bash
docker compose --profile test up -d postgres-test redis
TEST_DATABASE_URL=postgresql://acmepay:acmepay@localhost:5434/acmepay_test?schema=public \
  REDIS_PORT=6380 npm run test:int
```

Point `TEST_DATABASE_URL` at a database you are willing to lose. It defaults to
`DATABASE_URL`, which for local work is the dev database.

`queue-resilience.int-spec.ts` also needs Redis, because BullMQ's retry policy
and job-id deduplication only exist in Redis — a mocked queue would happily
accept a config that BullMQ rejects. It reads `REDIS_HOST`/`REDIS_PORT` and
defaults to `localhost:6379`; the local compose stack publishes Redis on
**6380**.

## Reconcile (read-only)

```bash
npm run reconcile
```

Exit 0 when `available + pending` matches the ledger net; exit 1 with a
`ledger_mismatch` line otherwise. See `Docs/runbooks/incidents.md`.

## Tear down

```bash
docker compose down
```

## Demo credentials

| Item | Value |
|------|-------|
| API key | `demo-partner-key` |
| Webhook secret | `dev-webhook-secret` |
| Base URL | `http://localhost:3001/v1` |
| Swagger | `http://localhost:3001/docs` |
