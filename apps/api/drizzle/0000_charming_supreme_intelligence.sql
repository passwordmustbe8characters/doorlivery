CREATE TABLE IF NOT EXISTS "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"pickup_note" text NOT NULL,
	"customer_name" varchar(200) NOT NULL,
	"customer_phone" varchar(32),
	"item_note" text,
	"status" varchar(32) DEFAULT 'created' NOT NULL,
	"code_hash" text,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"customer_token_hash" varchar(128),
	"rider_token_hash" varchar(128),
	"rider_phone" varchar(32),
	"dropoff_postcode" varchar(16),
	"dropoff_lat" double precision,
	"dropoff_lng" double precision,
	"dropoff_confidence" varchar(16),
	"landmark_note" text,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "deliveries_customer_token_hash_unique" UNIQUE("customer_token_hash"),
	CONSTRAINT "deliveries_rider_token_hash_unique" UNIQUE("rider_token_hash"),
	CONSTRAINT "deliveries_status_check" CHECK ("deliveries"."status" in ('created', 'awaiting_customer', 'ready', 'assigned', 'picked_up', 'arrived', 'delivered', 'failed', 'cancelled')),
	CONSTRAINT "deliveries_confidence_check" CHECK ("deliveries"."dropoff_confidence" is null or "deliveries"."dropoff_confidence" in ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"actor" varchar(16) NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy_m" double precision,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_events_actor_check" CHECK ("delivery_events"."actor" in ('vendor', 'customer', 'rider', 'system'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "location_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"postcode" varchar(16) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_m" double precision,
	"confidence" varchar(16),
	"source" varchar(16) NOT NULL,
	"delivery_id" uuid,
	CONSTRAINT "location_points_source_check" CHECK ("location_points"."source" in ('customer_pin', 'rider_confirm'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"business_name" varchar(200) NOT NULL,
	"phone" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "vendors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "location_points" ADD CONSTRAINT "location_points_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_vendor_created_idx" ON "deliveries" USING btree ("vendor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_events_delivery_idx" ON "delivery_events" USING btree ("delivery_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_points_postcode_idx" ON "location_points" USING btree ("postcode");