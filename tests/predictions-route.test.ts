import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));
  return {
    insertValues,
    insert,
    createPrediction: vi.fn(),
    modelFingerprint: vi.fn(async () => "fallback-hash"),
  };
});

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/db", () => ({ db: { insert: mocks.insert } }));
vi.mock("@/db/schema", () => ({ predictionAudits: {}, products: {} }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ getSession: async () => ({ data: { user: { id: "user-1" } } }) }) }));
vi.mock("@/lib/apf3/runtime", () => ({
  APF3_CUTOFF: "2026-10-31",
  createPrediction: mocks.createPrediction,
  modelFingerprint: mocks.modelFingerprint,
}));

import { POST } from "@/app/api/predictions/route";

const input = { productId: "1c30d819-9a34-58a4-bcb0-00ef4caea0d8", cutoffDate: "2026-10-31" };
const prediction = { product_id: input.productId, cutoff_date: input.cutoffDate, forecast_next_7d_units: 4, model: "ridge_no_intercept", model_version: "apf3-models-1.1", horizon_days: 7, source: "SYNTHETIC" };

describe("prediction audit behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertValues.mockReturnValue({ returning: vi.fn(async () => [{ id: "audit-1" }]) });
  });

  it("writes a SUCCESS audit after valid inference", async () => {
    mocks.createPrediction.mockResolvedValue({ product: {}, record: { source: "SYNTHETIC" }, prediction, modelVersion: "apf3-models-1.1", modelHash: "model-hash" });
    const response = await POST(new Request("http://localhost/api/predictions", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(200);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ status: "SUCCESS", origin: "SYNTHETIC", modelHash: "model-hash" }));
  });

  it("writes a FAILURE audit when the Python service fails", async () => {
    mocks.createPrediction.mockRejectedValue(new Error("APF3 service error (500): APF3 inference failed"));
    const response = await POST(new Request("http://localhost/api/predictions", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(422);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILURE", origin: "SYNTHETIC", output: null, errorDetails: expect.stringContaining("APF3 service error") }));
  });
});
