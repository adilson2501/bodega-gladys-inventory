import { describe, expect, it } from "vitest";

import {
  assertNormalOperationOrigin,
  deriveOperationOrigin,
  parseExportOrigin,
} from "../src/lib/provenance/origin";

describe("record provenance", () => {
  it("rejects a cross-origin sale", () => {
    expect(() => deriveOperationOrigin(["REAL", "UNCLASSIFIED"])).toThrow(/distintos orígenes/);
  });

  it("rejects a cross-origin purchase with synthetic stock", () => {
    expect(() => assertNormalOperationOrigin(deriveOperationOrigin(["UNCLASSIFIED", "SYNTHETIC"]))).toThrow(/contexto demo/);
  });

  it("preserves historical unclassified compatibility", () => {
    expect(deriveOperationOrigin(["UNCLASSIFIED"])).toBe("UNCLASSIFIED");
    expect(assertNormalOperationOrigin("UNCLASSIFIED")).toBe("UNCLASSIFIED");
  });

  it("requires explicit synthetic export selection", () => {
    expect(parseExportOrigin(null)).toBe("REAL");
    expect(parseExportOrigin("SYNTHETIC")).toBe("SYNTHETIC");
    expect(() => parseExportOrigin("UNCLASSIFIED")).toThrow();
  });
});
