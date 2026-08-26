# partners / auth

Partner API key authentication for `/v1/*` (except webhooks).

- Header: `Authorization: Bearer <key>` or `X-Api-Key: <key>`
- Storage: `partners.api_key_hash` = SHA-256 hex of raw key
- Guard: `ApiKeyGuard` in `src/auth/`
- Demo key: `demo-partner-key` (see seed)
- Spec: `Docs/specs/fase-1-payments-auth.md`
