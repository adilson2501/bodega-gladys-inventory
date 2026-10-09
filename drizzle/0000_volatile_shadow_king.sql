CREATE TYPE "public"."movement_reason" AS ENUM('PURCHASE', 'SALE', 'ADJUSTMENT', 'WASTE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"quantity" integer NOT NULL,
	"previous_stock" integer NOT NULL,
	"resulting_stock" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_quantity_positive" CHECK ("inventory_movements"."quantity" > 0),
	CONSTRAINT "inventory_movements_previous_stock_non_negative" CHECK ("inventory_movements"."previous_stock" >= 0),
	CONSTRAINT "inventory_movements_resulting_stock_non_negative" CHECK ("inventory_movements"."resulting_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"barcode" text,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"minimum_stock" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_current_stock_non_negative" CHECK ("products"."current_stock" >= 0),
	CONSTRAINT "products_minimum_stock_non_negative" CHECK ("products"."minimum_stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_movements_product_id_idx" ON "inventory_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_product_created_at_idx" ON "inventory_movements" USING btree ("product_id","created_at");