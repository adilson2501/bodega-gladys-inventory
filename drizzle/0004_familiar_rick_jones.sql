ALTER TABLE "purchases" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_selling_price_non_negative" CHECK ("products"."selling_price" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_purchase_cost_non_negative" CHECK ("products"."purchase_cost" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_unit_cost_non_negative" CHECK ("purchase_items"."unit_cost" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_line_total_non_negative" CHECK ("purchase_items"."line_total" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_line_total_consistent" CHECK ("purchase_items"."line_total" = "purchase_items"."unit_cost" * "purchase_items"."quantity") NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_subtotal_non_negative" CHECK ("purchases"."subtotal" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_total_non_negative" CHECK ("purchases"."total" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_subtotal_matches_total" CHECK ("purchases"."subtotal" = "purchases"."total") NOT VALID;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_price_non_negative" CHECK ("sale_items"."unit_price" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_line_total_non_negative" CHECK ("sale_items"."line_total" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_line_total_consistent" CHECK ("sale_items"."line_total" = "sale_items"."unit_price" * "sale_items"."quantity") NOT VALID;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_subtotal_non_negative" CHECK ("sales"."subtotal" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_non_negative" CHECK ("sales"."total" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_subtotal_matches_total" CHECK ("sales"."subtotal" = "sales"."total") NOT VALID;
