import { describe, expect, it } from "vitest";

import { splitForecastPresentation } from "../src/lib/forecast/presentation";
import type { ForecastArtifact } from "../src/lib/forecast/artifact";

const syntheticArtifact = {
  schema_version: "1.0",
  generated_at: "2026-11-11T19:19:29.877105+00:00",
  source: "SYNTHETIC",
  model_type: "RandomForestRegressor",
  training_date_start: "2025-01-01",
  training_date_end: "2025-03-11",
  evaluation_method: "cronológico",
  rows: [{ product_id: "00000000-0000-4000-8000-000000000001", forecast_7d: 63.64, status: "DEMO", model: "RandomForestRegressor" }],
} satisfies ForecastArtifact;

describe("forecast presentation separation", () => {
  it("shows synthetic rows as generic demo products without stock or replenishment", () => {
    const result = splitForecastPresentation([{ id: "00000000-0000-4000-8000-000000000001", name: "Producto real", currentStock: 8 }], syntheticArtifact, null);
    expect(result.demos[0].label).toBe("Producto de demostración 1");
    expect(result.demos[0].forecast.forecast_7d).toBe(63.64);
    expect(result.operational[0].forecast).toBeUndefined();
  });

  it("keeps matching real forecasts operational", () => {
    const real = { ...syntheticArtifact, source: "REAL", rows: [{ ...syntheticArtifact.rows[0], status: "OK" }] } satisfies ForecastArtifact;
    const result = splitForecastPresentation([{ id: real.rows[0].product_id, name: "Producto real", currentStock: 8 }], real, null);
    expect(result.demos).toHaveLength(0);
    expect(result.operational[0].forecast?.status).toBe("OK");
  });
});
