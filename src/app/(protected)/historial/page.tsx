import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { HistoryClient, type HistoryMovement } from "@/components/history/history-client";
import { db } from "@/db";
import { inventoryMovements, products } from "@/db/schema";
import { type MovementReason, type MovementType } from "@/lib/inventory/movement-rules";

export const instant = false;

export default async function HistoryPage() {
  await connection();

  const movementRows = await db
    .select({
      id: inventoryMovements.id,
      productName: products.name,
      type: inventoryMovements.type,
      reason: inventoryMovements.reason,
      quantity: inventoryMovements.quantity,
      previousStock: inventoryMovements.previousStock,
      resultingStock: inventoryMovements.resultingStock,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(inventoryMovements.productId, products.id))
    .orderBy(desc(inventoryMovements.createdAt));

  const movements: HistoryMovement[] = movementRows.map((movement) => ({
    ...movement,
    type: movement.type as MovementType,
    reason: movement.reason as MovementReason,
    createdAt: movement.createdAt.toISOString(),
  }));

  return <HistoryClient movements={movements} />;
}
