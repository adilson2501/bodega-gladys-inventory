import {
  check,
  index,
  integer,
  boolean,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const movementType = pgEnum("movement_type", ["IN", "OUT"]);

export const movementReason = pgEnum("movement_reason", [
  "PURCHASE",
  "SALE",
  "ADJUSTMENT",
  "WASTE",
  "OTHER",
]);

export const unitOfMeasure = pgEnum("unit_of_measure", ["UNIT", "KG", "LITER", "BOX", "PACK"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "YAPE", "PLIN", "OTHER"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    category: text("category"),
    barcode: text("barcode"),
    sellingPrice: numeric("selling_price", { precision: 10, scale: 2 }).notNull().default("0"),
    purchaseCost: numeric("purchase_cost", { precision: 10, scale: 2 }).notNull().default("0"),
    unitOfMeasure: unitOfMeasure("unit_of_measure").notNull().default("UNIT"),
    isActive: boolean("is_active").notNull().default(true),
    currentStock: integer("current_stock").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("products_current_stock_non_negative", sql`${table.currentStock} >= 0`),
    check("products_minimum_stock_non_negative", sql`${table.minimumStock} >= 0`),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    type: movementType("type").notNull(),
    reason: movementReason("reason").notNull(),
    quantity: integer("quantity").notNull(),
    previousStock: integer("previous_stock").notNull(),
    resultingStock: integer("resulting_stock").notNull(),
    idempotencyKey: text("idempotency_key"),
    requestFingerprint: text("request_fingerprint"),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    saleId: uuid("sale_id").references(() => sales.id),
    purchaseId: uuid("purchase_id").references(() => purchases.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_movements_product_id_idx").on(table.productId),
    index("inventory_movements_created_at_idx").on(table.createdAt),
    index("inventory_movements_product_created_at_idx").on(
      table.productId,
      table.createdAt,
    ),
    uniqueIndex("inventory_movements_idempotency_key_uidx")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    check("inventory_movements_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "inventory_movements_previous_stock_non_negative",
      sql`${table.previousStock} >= 0`,
    ),
    check(
      "inventory_movements_resulting_stock_non_negative",
      sql`${table.resultingStock} >= 0`,
    ),
    check(
      "inventory_movements_type_reason_valid",
      sql`(
        (${table.type} = 'IN' AND ${table.reason} IN ('PURCHASE', 'ADJUSTMENT', 'OTHER'))
        OR
        (${table.type} = 'OUT' AND ${table.reason} IN ('SALE', 'ADJUSTMENT', 'WASTE', 'OTHER'))
      )`,
    ),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sales_idempotency_key_uidx").on(table.idempotencyKey), index("sales_created_at_idx").on(table.createdAt)],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [index("sale_items_sale_id_idx").on(table.saleId), check("sale_items_quantity_positive", sql`${table.quantity} > 0`)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    contact: text("contact"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("suppliers_name_uidx").on(table.name)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("purchases_idempotency_key_uidx").on(table.idempotencyKey), index("purchases_created_at_idx").on(table.createdAt)],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseId: uuid("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [index("purchase_items_purchase_id_idx").on(table.purchaseId), check("purchase_items_quantity_positive", sql`${table.quantity} > 0`)],
);
