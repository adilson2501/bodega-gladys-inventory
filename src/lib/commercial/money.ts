export function parseMoneyToCents(value: string | number) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("El precio no es válido.");
  const [whole, decimals = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

export function centsToMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

export function addMoney(...values: (string | number)[]) {
  return centsToMoney(values.reduce<number>((total, value) => total + parseMoneyToCents(value), 0));
}
