# Runbook — testes (payment-api-nest)

Nest runs on **host Node 20+** or inside the optional `api` Docker service.

## Up (infra only)

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev
```

BullMQ workers run in-process with `@nestjs/bullmq` processors (no separate worker
command required for the demo).

## Tests

```bash
npm test              # unit (mocked Prisma where needed)
npm run test:e2e      # smoke (may need Postgres/Redis or mocks)
npm run lint
npm run build
```

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
