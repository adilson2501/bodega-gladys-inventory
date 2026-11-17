import { describe, expect, it } from "vitest";

import { parseForecastArtifact } from "../src/lib/forecast/artifact";
import { recommendedReplenishment } from "../src/lib/forecast/replenishment";

describe("forecast safety", () => {
  it("calculates a nonnegative integer replenishment", () => {
    expect(recommendedReplenishment(12.2, 5, 2)).toBe(10);
    expect(recommendedReplenishment(-3, 100)).toBe(0);
  });

  it("rejects unvalidated forecast rows", () => {
    expect(() => parseForecastArtifact({ schema_version: "1.0", rows: [] })).toThrow();
  });
});
