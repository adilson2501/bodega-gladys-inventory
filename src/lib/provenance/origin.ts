import { sql } from "drizzle-orm";

export const recordOriginValues = ["REAL", "SYNTHETIC", "UNCLASSIFIED"] as const;
export type RecordOrigin = (typeof recordOriginValues)[number];

export const normalOperationOrigins = ["REAL", "UNCLASSIFIED"] as const satisfies readonly RecordOrigin[];

export function isRecordOrigin(value: unknown): value is RecordOrigin {
  return typeof value === "string" && (recordOriginValues as readonly string[]).includes(value);
}

export function deriveOperationOrigin(origins: readonly RecordOrigin[]): RecordOrigin {
  const unique = [...new Set(origins)];
  if (unique.length === 0) throw new Error("No se encontró el origen del producto.");
  if (unique.includes("SYNTHETIC")) throw new Error("Las operaciones sintéticas requieren el contexto demo explícito.");
  if (unique.length !== 1) throw new Error("No se pueden mezclar productos de distintos orígenes.");
  return unique[0];
}

export function assertNormalOperationOrigin(origin: RecordOrigin) {
  if (!normalOperationOrigins.includes(origin as (typeof normalOperationOrigins)[number])) {
    throw new Error("El producto sintético solo puede usarse mediante el importador demo autorizado.");
  }
  return origin;
}

export function parseExportOrigin(value: string | null): "REAL" | "SYNTHETIC" {
  if (!value || value === "REAL") return "REAL";
  if (value === "SYNTHETIC") return "SYNTHETIC";
  throw new Error("El origen de exportación debe ser REAL o SYNTHETIC.");
}

export function setDatabaseOperationOrigin(origin: RecordOrigin) {
  return sql`select set_config('app.operation_origin', ${origin}, true)`;
}
