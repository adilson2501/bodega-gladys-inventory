import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { HistoryClient, type HistoryMovement, type HistoryPurchase, type HistorySale } from "@/components/history/history-client";
import { db } from "@/db";
import { inventoryMovements, products, purchaseItems, purchases, saleItems, sales } from "@/db/schema";
import { type MovementReason, type MovementType } from "@/lib/inventory/movement-rules";

export const instant = false;

export default async function HistoryPage() {
  await connection();

  const [movementRows, saleRows, saleItemRows, purchaseRows, purchaseItemRows] = await Promise.all([
    db
      .select({
      id: inventoryMovements.id,
      productName: products.name,
      type: inventoryMovements.type,
      reason: inventoryMovements.reason,
      quantity: inventoryMovements.quantity,
      previousStock: inventoryMovements.previousStock,
       resultingStock: inventoryMovements.resultingStock,
       actorEmail: inventoryMovements.actorEmail,
       saleId: inventoryMovements.saleId,
       purchaseId: inventoryMovements.purchaseId,
      createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .orderBy(desc(inventoryMovements.createdAt)),
    db.select().from(sales).orderBy(desc(sales.createdAt)).limit(20),
    db.select().from(saleItems),
    db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(20),
    db.select().from(purchaseItems),
  ]);

  const movements: HistoryMovement[] = movementRows.map((movement) => ({
    ...movement,
    type: movement.type as MovementType,
    reason: movement.reason as MovementReason,
    createdAt: movement.createdAt.toISOString(),
    actorEmail: movement.actorEmail,
    source: movement.saleId ? "Venta" : movement.purchaseId ? "Compra" : "Manual",
  }));

  const historySales: HistorySale[] = saleRows.map((sale) => ({
    id: sale.id,
    paymentMethod: sale.paymentMethod as HistorySale["paymentMethod"],
    total: sale.total,
    createdAt: sale.createdAt.toISOString(),
    actorEmail: sale.actorEmail,
    items: saleItemRows.filter((item) => item.saleId === sale.id),
  }));
  const historyPurchases: HistoryPurchase[] = purchaseRows.map((purchase) => ({
    id: purchase.id,
    supplierName: purchase.supplierName,
    total: purchase.total,
    createdAt: purchase.createdAt.toISOString(),
    actorEmail: purchase.actorEmail,
    items: purchaseItemRows.filter((item) => item.purchaseId === purchase.id),
  }));

  return <HistoryClient movements={movements} sales={historySales} purchases={historyPurchases} />;
}
