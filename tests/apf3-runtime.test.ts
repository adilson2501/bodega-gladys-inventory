import { describe, expect, it } from "vitest";
import { APF3_CUTOFF, buildApf3Record } from "../src/lib/apf3/features";

const product = { id: "00000000-0000-0000-0000-000000000001", name: "Sintético", category: "Snacks", unitOfMeasure: "UNIT" };
const sale = (day: string, quantity: number) => ({ productId: product.id, quantity, date: new Date(`${day}T08:00:00Z`) });
const movement = (day: string, resultingStock: number) => ({ productId: product.id, resultingStock, date: new Date(`${day}T08:00:00Z`) });

describe("runtime APF3 contract", () => {
  it("builds only historical features through the cutoff", () => {
    const record = buildApf3Record(product, [sale("2026-10-30", 4), sale("2026-11-01", 99)], [movement("2026-10-31", 8)]);
    expect(record.source).toBe("SYNTHETIC");
    expect(record.date).toBe(APF3_CUTOFF);
    expect(record.lag_1).toBe(4);
    expect(record.stock_available_eod).toBe(1);
    expect(record).not.toHaveProperty("target_next_7d");
  });

  it("rejects unsupported prediction dates", () => {
    expect(() => buildApf3Record(product, [], [], "2026-11-01")).toThrow("2026-10-31");
  });

  it("does not mix product history", () => {
    const other = { ...product, id: "00000000-0000-0000-0000-000000000002" };
    const record = buildApf3Record(product, [sale("2026-10-30", 4), { ...sale("2026-10-30", 50), productId: other.id }], []);
    expect(record.lag_1).toBe(4);
  });
});
