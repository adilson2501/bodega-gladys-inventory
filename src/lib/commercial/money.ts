export const MAX_UNIT_CENTS = 9_999_999_999;
export const MAX_TOTAL_CENTS = 999_999_999_999;
export const MAX_COMMERCIAL_ITEMS = 100;

function assertSafeCents(cents: number, maximum = MAX_TOTAL_CENTS) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > maximum) {
    throw new Error("El monto excede el límite permitido.");
  }
  return cents;
}

export function parseMoneyToCents(value: string | number, maximum = MAX_UNIT_CENTS) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("El monto no es válido.");
  const [whole, decimals = ""] = normalized.split(".");
  const wholeCents = Number(whole) * 100;
  const cents = wholeCents + Number(decimals.padEnd(2, "0"));
  return assertSafeCents(cents, maximum);
}

export function multiplyCents(unitCents: number, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("La cantidad no es válida.");
  return assertSafeCents(unitCents * quantity);
}

export function addCents(...values: number[]) {
  return assertSafeCents(values.reduce((total, value) => assertSafeCents(total + value), 0));
}

export function centsToMoney(cents: number) {
  return (assertSafeCents(cents) / 100).toFixed(2);
}

export function addMoney(...values: (string | number)[]) {
  return centsToMoney(addCents(...values.map((value) => parseMoneyToCents(value))));
}
