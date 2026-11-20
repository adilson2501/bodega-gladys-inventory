import { describe, expect, it } from "vitest";

import {
  classifyForecastStatus,
  informationalReplenishment,
  matchForecastsToProducts,
  parseForecastRun,
} from "../src/lib/forecast/contract";

const baseRun = {
  schema_version: "2.0",
  run_id: "00000000-0000-4000-8000-000000000010",
  model_family: "ridge",
  model_version: "apf3-models-1.0",
  source: "SYNTHETIC",
  provenance: { source: "SYNTHETIC", verification: "synthetic-manifest" },
  created_at: "2026-11-19T12:00:00+00:00",
  cutoff_date: "2026-11-19",
  forecast_start: "2026-11-20",
  forecast_end: "2026-11-26",
  horizon_days: 7,
  input_hash: null,
  artifact_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  rows: [{ product_id: "00000000-0000-4000-8000-000000000001", forecast_units: 4.5, status: "READY" }],
} as const;

describe("forecast contract", () => {
  it("accepts a valid synthetic Ridge run", () => {
    expect(parseForecastRun(baseRun).rows[0].forecast_units).toBe(4.5);
  });

  it("rejects malformed, negative, NaN-like and duplicate data", () => {
    expect(() => parseForecastRun({ ...baseRun, schema_version: "1.0" })).toThrow();
    expect(() => parseForecastRun({ ...baseRun, rows: [{ ...baseRun.rows[0], forecast_units: -1 }] })).toThrow();
    expect(() => parseForecastRun({ ...baseRun, rows: [{ ...baseRun.rows[0], forecast_units: "NaN" }] })).toThrow();
    expect(() => parseForecastRun({ ...baseRun, rows: [baseRun.rows[0], baseRun.rows[0]] })).toThrow(/duplicado/i);
  });

  it("rejects unknown products and invalid dates", () => {
    expect(() => parseForecastRun(baseRun, { knownProductIds: new Set(["00000000-0000-4000-8000-000000000002"]) })).toThrow(/desconocido/i);
    expect(() => parseForecastRun({ ...baseRun, forecast_end: "2026-11-27" })).toThrow();
    expect(() => parseForecastRun({ ...baseRun, cutoff_date: "2026-02-30", forecast_start: "2026-03-01", forecast_end: "2026-03-07" })).toThrow();
    expect(() => parseForecastRun({ ...baseRun, model_version: "unknown-model" })).toThrow(/soportada/i);
  });

  it("requires trusted verification before accepting REAL provenance", () => {
    const real = { ...baseRun, source: "REAL", provenance: { source: "REAL", verification: "authenticated-export" }, input_hash: baseRun.artifact_hash } as const;
    expect(() => parseForecastRun(real)).toThrow(/confiable/i);
    expect(parseForecastRun(real, { trustedRealProvenance: true }).source).toBe("REAL");
  });

  it("keeps synthetic forecasts non-operational and reports missing products", () => {
    const result = matchForecastsToProducts([{ id: baseRun.rows[0].product_id, name: "Producto", currentStock: 2 }, { id: "00000000-0000-4000-8000-000000000002", name: "Otro", currentStock: 2 }], parseForecastRun(baseRun));
    expect(result[0].status).toBe("READY");
    expect(result[1].status).toBe("MISSING_FORECAST");
  });

  it("classifies a forecast beyond its horizon as stale", () => {
    const run = parseForecastRun(baseRun);
    expect(classifyForecastStatus(run.rows[0], run, new Date("2026-11-27T00:00:00Z"))).toBe("STALE");
  });

  it("calculates bounded informational replenishment", () => {
    expect(informationalReplenishment(4.5, 2, 1)).toBe(4);
    expect(informationalReplenishment(0, 10)).toBe(0);
    expect(informationalReplenishment(-4, 0)).toBe(0);
    expect(informationalReplenishment(Number.NaN, 0)).toBe(0);
  });
});
