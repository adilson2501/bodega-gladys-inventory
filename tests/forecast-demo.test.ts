import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { filterSyntheticForecasts, matchSyntheticForecasts, predictionsSubtitle, syntheticReplenishment } from "../src/lib/forecast/demo";
import { isSyntheticDemoModeEnabled, loadSyntheticForecastBatch, parseSyntheticForecastBatch } from "../src/lib/forecast/demo-loader";

const batch = {
  schema_version: "2.0",
  run_id: "00000000-0000-4000-8000-000000000010",
  model_family: "ridge",
  model_version: "apf3-models-1.0",
  source: "SYNTHETIC",
  provenance: { source: "SYNTHETIC", verification: "synthetic-manifest" },
  created_at: "2026-10-31T23:59:59+00:00",
  cutoff_date: "2026-10-31",
  forecast_start: "2026-11-01",
  forecast_end: "2026-11-07",
  horizon_days: 7,
  input_hash: null,
  artifact_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  rows: [{ product_id: "00000000-0000-4000-8000-000000000001", forecast_units: 4.5, status: "READY" }],
} as const;

describe("synthetic forecast demo safety", () => {
  it("requires explicit non-production server mode", () => {
    expect(isSyntheticDemoModeEnabled({ NODE_ENV: "test", APF3_DEMO_MODE: "true" })).toBe(true);
    expect(isSyntheticDemoModeEnabled({ NODE_ENV: "development", APF3_DEMO_MODE: "false" })).toBe(false);
    expect(isSyntheticDemoModeEnabled({ NODE_ENV: "production", APF3_DEMO_MODE: "true" })).toBe(false);
    expect(isSyntheticDemoModeEnabled({ APF3_DEMO_MODE: "true" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("uses historical and operational subtitles in the correct mode", () => {
    expect(predictionsSubtitle(true)).toContain("históricos");
    expect(predictionsSubtitle(false)).toBe("Demanda estimada para los próximos 7 días.");
  });

  it("rejects invalid contract and production mode", () => {
    expect(() => parseSyntheticForecastBatch({ ...batch, source: "REAL" })).toThrow();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APF3_DEMO_MODE", "true");
    expect(loadSyntheticForecastBatch()).toEqual({ enabled: false, batch: null, reason: "PRODUCTION_DISABLED" });
    vi.unstubAllEnvs();
  });

  it("reports missing local artifact without fabricating data", () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue("/tmp/bodega-gladys-no-forecast-artifact");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APF3_DEMO_MODE", "true");
    expect(loadSyntheticForecastBatch()).toEqual({ enabled: true, batch: null, reason: "MISSING_ARTIFACT" });
    cwd.mockRestore();
    vi.unstubAllEnvs();
  });

  it("matches only canonical UUIDs and classifies historical batches", () => {
    const result = matchSyntheticForecasts([
      { id: batch.rows[0].product_id, name: "Producto sintético" },
      { id: "00000000-0000-4000-8000-000000000002", name: "Producto ajeno" },
    ], parseSyntheticForecastBatch(batch), new Date("2026-11-19T00:00:00Z"));
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].status).toBe("STALE");
    expect(result.hasDatasetMismatch).toBe(false);
    expect(result.missingForecastIds).toContain("00000000-0000-4000-8000-000000000002");
  });

  it("flags a batch product absent from the catalog", () => {
    const result = matchSyntheticForecasts([], parseSyntheticForecastBatch(batch));
    expect(result.hasDatasetMismatch).toBe(true);
    expect(result.unknownForecastIds).toEqual([batch.rows[0].product_id]);
  });

  it("filters by name, UUID, status and combined criteria while preserving order", () => {
    const run = parseSyntheticForecastBatch(batch);
    const matches = matchSyntheticForecasts([
      { id: batch.rows[0].product_id, name: "Producto sintético" },
      { id: "00000000-0000-4000-8000-000000000002", name: "Producto ajeno" },
    ], run, new Date("2026-11-19T00:00:00Z")).matches;
    expect(filterSyntheticForecasts(matches)).toHaveLength(1);
    expect(filterSyntheticForecasts(matches, "SINTÉTICO")[0].product.name).toBe("Producto sintético");
    expect(filterSyntheticForecasts(matches, batch.rows[0].product_id)[0].product.name).toBe("Producto sintético");
    expect(filterSyntheticForecasts(matches, "sintético", "STALE")).toHaveLength(1);
    expect(filterSyntheticForecasts(matches, "sintético", "READY")).toHaveLength(0);
    expect(filterSyntheticForecasts(matches, "no existe")).toHaveLength(0);
  });

  it("requires historical cutoff stock for replenishment", () => {
    expect(syntheticReplenishment("READY", 4.5, null)).toBeNull();
    expect(syntheticReplenishment("READY", 4.5, 2)).toBe(3);
    expect(syntheticReplenishment("STALE", 4.5, 2)).toBeNull();
  });

  it("keeps the synthetic path read-only", () => {
    const product = { id: batch.rows[0].product_id, name: "Producto", currentStock: 9 };
    const before = { ...product };
    matchSyntheticForecasts([product], parseSyntheticForecastBatch(batch));
    syntheticReplenishment("READY", 4.5, null);
    expect(product).toEqual(before);
  });
});
