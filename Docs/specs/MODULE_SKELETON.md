# MODULE_SKELETON — payment-api-nest

Canonical layout for new domain modules. See also
`.cursor/skills/nest-payment-module/SKILL.md`.

```
src/<module>/
├── <module>.module.ts
├── <module>.controller.ts      # routes under /v1/...
├── <module>.service.ts
├── dto/*.dto.ts                # class-validator
├── *.processor.ts              # BullMQ when async
└── *.spec.ts                   # Jest unit tests
prisma/schema.prisma            # models + unique idempotency keys
Docs/modulos/<module>.md
Docs/specs/fase-N-<name>.md
```

## Rules

1. Controllers stay thin — orchestration in `*Service`.
2. External provider I/O only through a client/provider class (`FakePixProvider`, `FakeFxProvider`).
3. Status fields use string enums matching `API_CONTRACT.md`.
4. Unique constraints for idempotency keys live in Prisma (`@@unique`), not only in code.
5. Money columns: `BigInt` minor units + `String(3)` currency; serialize amounts as integers in JSON.
6. Partner routes use `ApiKeyGuard`; webhooks use HMAC signature guard.
