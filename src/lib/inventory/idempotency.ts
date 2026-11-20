import { createHash } from "node:crypto";

export function createRequestFingerprint(input: Record<string, string | number>) {
  const normalized = JSON.stringify(
    Object.keys(input)
      .sort()
      .reduce<Record<string, string | number>>((result, key) => {
        result[key] = input[key];
        return result;
      }, {}),
  );

  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

type CommercialItem = { productId: string; quantity: number; unitPrice?: string; unitCost?: string };

export function createCommercialFingerprint(input: {
  type: "sale" | "purchase";
  paymentMethod?: string;
  supplierName?: string;
  items: CommercialItem[];
}) {
  const normalizeMoney = (value: string | null) => {
    if (value === null) return null;
    const [whole, decimals = ""] = value.replace(",", ".").split(".");
    return `${whole}.${decimals.padEnd(2, "0")}`;
  };
  const canonical = JSON.stringify({
    type: input.type,
    paymentMethod: input.paymentMethod ?? null,
    supplierName: input.supplierName?.trim() ?? null,
    items: [...input.items]
      .map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: normalizeMoney(item.unitPrice ?? null), unitCost: normalizeMoney(item.unitCost ?? null) }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
