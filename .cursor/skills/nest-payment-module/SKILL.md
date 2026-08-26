---
name: nest-payment-module
description: >-
  Create a new AcmePay payment-related module in payment-api-nest: Module,
  Controller, Service, DTO, Guard, Bull processor, and Jest tests. Use when
  adding endpoints or domain modules under payments, webhooks, fx, balances,
  payouts, or splits.
disable-model-invocation: true
---

# Nest payment module (payment-api-nest)

## Checklist

1. Write/update `Docs/specs/fase-N-*.md` with acceptance criteria.
2. Update `Docs/modulos/<module>.md` and `Docs/Database/DB.md` if schema changes.
3. Add Prisma model(s) in `prisma/schema.prisma` — amounts as `BigInt`.
4. Run `npx prisma migrate dev`.
5. Add enum/constants in `src/common/enums.ts` for closed status sets.
6. Add DTO(s) with `class-validator` under `src/<module>/dto/`.
7. Add `Service` (orchestration) and optional provider (`FakePixProvider`, etc.).
8. Add `Controller` with `@Controller('v1/...')` matching OpenAPI.
9. Register `Module` in `app.module.ts`.
10. If async: BullMQ `@Processor` + queue registration in module.
11. Jest unit test with mocked `PrismaService` / queue.
12. Mark acceptance criteria in the spec.

## Layout

```
src/
├── <feature>/
│   ├── <feature>.module.ts
│   ├── <feature>.controller.ts
│   ├── <feature>.service.ts
│   ├── dto/
│   ├── *.processor.ts      # optional BullMQ
│   └── *.provider.ts       # optional fake client
├── auth/api-key.guard.ts
└── common/
    ├── enums.ts
    ├── exceptions/domain.exception.ts
    └── filters/domain-exception.filter.ts
```

## Money

- Request/DB/response: integer minor units.
- Never use float for money conversion — use BigInt/string math (`FakeFxProvider`).
- Pair every amount with ISO currency.

## Auth

- Partner routes: `@UseGuards(ApiKeyGuard)` + `@CurrentPartner()`.
- Webhooks: `@UseGuards(WebhookSignatureGuard)` — requires raw body in `main.ts`.

## Tests

```bash
npm test -- --testPathPattern=payments
```

## Swagger

Add `@ApiTags`, `@ApiBearerAuth()` on partner controllers.
