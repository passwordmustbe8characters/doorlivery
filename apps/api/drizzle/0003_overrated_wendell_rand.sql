ALTER TABLE "deliveries" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "redacted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_closed_idx" ON "deliveries" USING btree ("closed_at");--> statement-breakpoint
-- Backfill: deliveries already closed before this column existed.
UPDATE "deliveries" SET "closed_at" = COALESCE("delivered_at", "updated_at") WHERE "status" IN ('delivered', 'cancelled', 'failed') AND "closed_at" IS NULL;
