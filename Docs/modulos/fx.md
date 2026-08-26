# fx

FX quotes with 5-minute rate lock.

- `POST /v1/fx/quotes`
- Rate returned as decimal string (`FakeFxProvider`)
- Expired quote consumption → **1031**
- Single use: `FxService.consume()` stamps `consumed_at` with a conditional
  update, so two callers racing on the same quote cannot both claim it. Reuse →
  **1032**. Expiry is checked first, so an expired quote still reports 1031.
- Spec: `Docs/specs/fase-3-balances-fx.md`
