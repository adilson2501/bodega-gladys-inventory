import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    category: text("category"),
    barcode: text("barcode"),
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
    check("inventory_movements_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "inventory_movements_previous_stock_non_negative",
      sql`${table.previousStock} >= 0`,
    ),
    check(
      "inventory_movements_resulting_stock_non_negative",
      sql`${table.resultingStock} >= 0`,
    ),
  ],
);
