-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "api_key_prefix" VARCHAR(16) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "external_id" TEXT,
    "description" VARCHAR(140),
    "qr_code" TEXT NOT NULL,
    "copy_paste" TEXT NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "provider_tx_id" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "payment_id" UUID,
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_balances" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "available" BIGINT NOT NULL DEFAULT 0,
    "pending" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_ledger" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "direction" VARCHAR(16) NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "reference_type" VARCHAR(64) NOT NULL,
    "reference_id" UUID NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_quotes" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "source_currency" VARCHAR(3) NOT NULL,
    "target_currency" VARCHAR(3) NOT NULL,
    "source_amount" BIGINT NOT NULL,
    "target_amount" BIGINT NOT NULL,
    "rate" VARCHAR(32) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "destination_type" VARCHAR(32) NOT NULL,
    "destination_value" TEXT NOT NULL,
    "external_id" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_splits" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "party" VARCHAR(32) NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_api_key_hash_key" ON "partners"("api_key_hash");

-- CreateIndex
CREATE INDEX "payments_partner_id_status_idx" ON "payments"("partner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_partner_id_external_id_key" ON "payments"("partner_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_balances_partner_id_currency_key" ON "partner_balances"("partner_id", "currency");

-- CreateIndex
CREATE INDEX "balance_ledger_partner_id_currency_created_at_idx" ON "balance_ledger"("partner_id", "currency", "created_at");

-- CreateIndex
CREATE INDEX "fx_quotes_partner_id_expires_at_idx" ON "fx_quotes"("partner_id", "expires_at");

-- CreateIndex
CREATE INDEX "payouts_partner_id_status_idx" ON "payouts"("partner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_partner_id_external_id_key" ON "payouts"("partner_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_splits_payment_id_party_key" ON "payment_splits"("payment_id", "party");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_balances" ADD CONSTRAINT "partner_balances_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_quotes" ADD CONSTRAINT "fx_quotes_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

