CREATE TYPE "public"."record_origin" AS ENUM('REAL', 'SYNTHETIC', 'UNCLASSIFIED');--> statement-breakpoint
DROP INDEX "suppliers_name_uidx";--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "origin" "record_origin" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "source_batch_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "origin" "record_origin" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_batch_id" text;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "origin" "record_origin" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "origin" "record_origin" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "source_batch_id" text;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "origin" "record_origin" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "origin" "record_origin" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "source_batch_id" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "origin" "record_origin" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "source_batch_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_origin_uidx" ON "suppliers" USING btree ("name","origin");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_synthetic_batch_ck" CHECK (("origin" = 'SYNTHETIC' AND "source_batch_id" IS NOT NULL) OR ("origin" <> 'SYNTHETIC' AND "source_batch_id" IS NULL));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_synthetic_batch_ck" CHECK (("origin" = 'SYNTHETIC' AND "source_batch_id" IS NOT NULL) OR ("origin" <> 'SYNTHETIC' AND "source_batch_id" IS NULL));--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_synthetic_batch_ck" CHECK (("origin" = 'SYNTHETIC' AND "source_batch_id" IS NOT NULL) OR ("origin" <> 'SYNTHETIC' AND "source_batch_id" IS NULL));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_synthetic_batch_ck" CHECK (("origin" = 'SYNTHETIC' AND "source_batch_id" IS NOT NULL) OR ("origin" <> 'SYNTHETIC' AND "source_batch_id" IS NULL));--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_synthetic_batch_ck" CHECK (("origin" = 'SYNTHETIC' AND "source_batch_id" IS NOT NULL) OR ("origin" <> 'SYNTHETIC' AND "source_batch_id" IS NULL));--> statement-breakpoint
CREATE FUNCTION "public"."protect_origin"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origin IS DISTINCT FROM NEW.origin THEN
    RAISE EXCEPTION 'record origin is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "public"."protect_parent_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origin IS DISTINCT FROM NEW.origin OR OLD.source_batch_id IS DISTINCT FROM NEW.source_batch_id THEN
    RAISE EXCEPTION 'record provenance is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "products_provenance_immutable" BEFORE UPDATE ON "products" FOR EACH ROW EXECUTE FUNCTION "public"."protect_parent_provenance"();--> statement-breakpoint
CREATE TRIGGER "suppliers_provenance_immutable" BEFORE UPDATE ON "suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."protect_parent_provenance"();--> statement-breakpoint
CREATE TRIGGER "sales_provenance_immutable" BEFORE UPDATE ON "sales" FOR EACH ROW EXECUTE FUNCTION "public"."protect_parent_provenance"();--> statement-breakpoint
CREATE TRIGGER "purchases_provenance_immutable" BEFORE UPDATE ON "purchases" FOR EACH ROW EXECUTE FUNCTION "public"."protect_parent_provenance"();--> statement-breakpoint
CREATE TRIGGER "inventory_movements_provenance_immutable" BEFORE UPDATE ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."protect_parent_provenance"();--> statement-breakpoint
CREATE TRIGGER "sale_items_origin_immutable" BEFORE UPDATE ON "sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."protect_origin"();--> statement-breakpoint
CREATE TRIGGER "purchase_items_origin_immutable" BEFORE UPDATE ON "purchase_items" FOR EACH ROW EXECUTE FUNCTION "public"."protect_origin"();--> statement-breakpoint
CREATE FUNCTION "public"."validate_sale_item_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale_origin record_origin; product_origin record_origin;
BEGIN
  SELECT origin INTO sale_origin FROM sales WHERE id = NEW.sale_id;
  SELECT origin INTO product_origin FROM products WHERE id = NEW.product_id;
  IF sale_origin IS NULL OR product_origin IS NULL OR NEW.origin <> sale_origin OR NEW.origin <> product_origin THEN
    RAISE EXCEPTION 'sale item provenance does not match its parents';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "public"."validate_purchase_item_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase_origin record_origin; product_origin record_origin;
BEGIN
  SELECT origin INTO purchase_origin FROM purchases WHERE id = NEW.purchase_id;
  SELECT origin INTO product_origin FROM products WHERE id = NEW.product_id;
  IF purchase_origin IS NULL OR product_origin IS NULL OR NEW.origin <> purchase_origin OR NEW.origin <> product_origin THEN
    RAISE EXCEPTION 'purchase item provenance does not match its parents';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "public"."validate_movement_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE product_origin record_origin; sale_origin record_origin; purchase_origin record_origin;
BEGIN
  SELECT origin INTO product_origin FROM products WHERE id = NEW.product_id;
  IF product_origin IS NULL OR NEW.origin <> product_origin THEN
    RAISE EXCEPTION 'movement provenance does not match its product';
  END IF;
  IF NEW.sale_id IS NOT NULL THEN
    SELECT origin INTO sale_origin FROM sales WHERE id = NEW.sale_id;
    IF sale_origin IS NULL OR NEW.origin <> sale_origin THEN
      RAISE EXCEPTION 'movement provenance does not match its sale';
    END IF;
  END IF;
  IF NEW.purchase_id IS NOT NULL THEN
    SELECT origin INTO purchase_origin FROM purchases WHERE id = NEW.purchase_id;
    IF purchase_origin IS NULL OR NEW.origin <> purchase_origin THEN
      RAISE EXCEPTION 'movement provenance does not match its purchase';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "public"."validate_purchase_supplier_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE supplier_origin record_origin;
BEGIN
  IF NEW.supplier_id IS NOT NULL THEN
    SELECT origin INTO supplier_origin FROM suppliers WHERE id = NEW.supplier_id;
    IF supplier_origin IS NULL OR NEW.origin <> supplier_origin THEN
      RAISE EXCEPTION 'purchase provenance does not match its supplier';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sale_items_provenance_fk" BEFORE INSERT OR UPDATE ON "sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."validate_sale_item_provenance"();--> statement-breakpoint
CREATE TRIGGER "purchase_items_provenance_fk" BEFORE INSERT OR UPDATE ON "purchase_items" FOR EACH ROW EXECUTE FUNCTION "public"."validate_purchase_item_provenance"();--> statement-breakpoint
CREATE TRIGGER "inventory_movements_provenance_fk" BEFORE INSERT OR UPDATE ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."validate_movement_provenance"();--> statement-breakpoint
CREATE TRIGGER "purchases_supplier_provenance_fk" BEFORE INSERT OR UPDATE ON "purchases" FOR EACH ROW EXECUTE FUNCTION "public"."validate_purchase_supplier_provenance"();--> statement-breakpoint
CREATE FUNCTION "public"."guard_product_stock_origin"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation_origin text;
BEGIN
  IF NEW.current_stock IS DISTINCT FROM OLD.current_stock THEN
    operation_origin := current_setting('app.operation_origin', true);
    IF operation_origin IS NULL OR operation_origin = '' OR operation_origin <> OLD.origin::text OR NEW.origin <> OLD.origin THEN
      RAISE EXCEPTION 'stock change requires a matching operation origin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "products_stock_origin_guard" BEFORE UPDATE ON "products" FOR EACH ROW EXECUTE FUNCTION "public"."guard_product_stock_origin"();
