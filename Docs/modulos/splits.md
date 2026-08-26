# splits

Payment split lines — sum must equal payment amount.

- `POST /v1/payments/{id}/splits`
- Parties: `platform`, `seller`, `affiliate`
- Invalid sum → **1015**; validated again at settlement
- Only editable while the payment is `PENDING`. Any terminal status (`PAID`,
  `EXPIRED`, `FAILED`, `CANCELLED`) → **1015** with `details.status`, stored
  lines untouched: rewriting them after settlement would leave the ledger
  describing a split that never happened.
- Spec: `Docs/specs/fase-4-payouts-splits.md`
