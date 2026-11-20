import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseForecastRun } from "../src/lib/forecast/contract";

const batchPath = join(process.cwd(), "ml", "artifacts", "apf3", "forecast-batch", "forecast_batch.json");

describe("generated APF3 batch contract", () => {
  it.skipIf(!existsSync(batchPath))("validates the generated batch with the ML.2 Zod contract", () => {
    const batch = JSON.parse(readFileSync(batchPath, "utf8")) as unknown;
    const parsed = parseForecastRun(batch);
    expect(parsed.source).toBe("SYNTHETIC");
    expect(parsed.model_family).toBe("ridge");
    expect(parsed.horizon_days).toBe(7);
    expect(parsed.rows).toHaveLength(60);
  });
});
