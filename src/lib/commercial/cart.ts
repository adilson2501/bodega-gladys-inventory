type PricedCartLine = {
  quantity: number;
  unitPrice?: string;
  unitCost?: string;
};

export function removeCartLine<T extends { productId: string }>(lines: T[], productId: string) {
  return lines.filter((line) => line.productId !== productId);
}

export function calculateCartTotal(lines: PricedCartLine[]) {
  const total = lines.reduce((sum, line) => addCents(sum, multiplyCents(parseMoneyToCents(line.unitPrice ?? line.unitCost ?? "0"), line.quantity)), 0);
  return centsToMoney(total);
}

export function canSubmitCart(lines: { productId: string }[], requiredValue?: string) {
  return lines.length > 0 && (requiredValue === undefined || requiredValue.trim().length > 0);
}
import { centsToMoney, multiplyCents, parseMoneyToCents, addCents } from "@/lib/commercial/money";
