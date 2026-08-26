-- A ledger entry is fully identified by what it settles. Checking for an
-- existing row before inserting one is a race; only the database can make
-- "at most one entry per reference and direction" true under concurrency.
CREATE UNIQUE INDEX "balance_ledger_reference_unique"
    ON "balance_ledger" ("reference_type", "reference_id", "direction");
