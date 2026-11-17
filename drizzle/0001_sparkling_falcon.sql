ALTER TABLE "inventory_movements" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_idempotency_key_uidx" ON "inventory_movements" USING btree ("idempotency_key") WHERE "inventory_movements"."idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_type_reason_valid" CHECK ((
        ("inventory_movements"."type" = 'IN' AND "inventory_movements"."reason" IN ('PURCHASE', 'ADJUSTMENT', 'OTHER'))
        OR
        ("inventory_movements"."type" = 'OUT' AND "inventory_movements"."reason" IN ('SALE', 'ADJUSTMENT', 'WASTE', 'OTHER'))
      )) NOT VALID;
