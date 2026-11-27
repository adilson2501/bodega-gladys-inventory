CREATE TABLE "prediction_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output" jsonb,
	"model_version" text NOT NULL,
	"model_hash" text NOT NULL,
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin" "record_origin" NOT NULL,
	"status" text NOT NULL,
	"error_details" text,
	CONSTRAINT "prediction_audits_status_ck" CHECK ("prediction_audits"."status" IN ('SUCCESS', 'FAILURE')),
	CONSTRAINT "prediction_audits_origin_synthetic_ck" CHECK ("prediction_audits"."origin" = 'SYNTHETIC')
);
--> statement-breakpoint
ALTER TABLE "prediction_audits" ADD CONSTRAINT "prediction_audits_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "prediction_audits_product_predicted_at_idx" ON "prediction_audits" USING btree ("product_id","predicted_at");
