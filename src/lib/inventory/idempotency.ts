import { createHash } from "node:crypto";

export function createRequestFingerprint(input: Record<string, string | number>) {
  const normalized = JSON.stringify(
    Object.keys(input)
      .sort()
      .reduce<Record<string, string | number>>((result, key) => {
        result[key] = input[key];
        return result;
      }, {}),
  );

  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
