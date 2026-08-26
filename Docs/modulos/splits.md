# splits

Payment split lines — sum must equal payment amount.

- `POST /v1/payments/{id}/splits`
- Parties: `platform`, `seller`, `affiliate`
- Invalid sum → **1015**; validated again at settlement
- Spec: `Docs/specs/fase-4-payouts-splits.md`
