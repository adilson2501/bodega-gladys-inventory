type PricedCartLine = {
  quantity: number;
  unitPrice?: string;
  unitCost?: string;
};

export function removeCartLine<T extends { productId: string }>(lines: T[], productId: string) {
  return lines.filter((line) => line.productId !== productId);
}

export function calculateCartTotal(lines: PricedCartLine[]) {
  return lines
    .reduce((sum, line) => sum + Number(line.unitPrice ?? line.unitCost ?? 0) * line.quantity, 0)
    .toFixed(2);
}

export function canSubmitCart(lines: { productId: string }[], requiredValue?: string) {
  return lines.length > 0 && (requiredValue === undefined || requiredValue.trim().length > 0);
}
