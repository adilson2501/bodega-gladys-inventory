import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync("drizzle/0001_sparkling_falcon.sql", "utf8");
const provenanceMigrationSql = readFileSync("drizzle/0003_great_kang.sql", "utf8");

describe("migration 0001 SQL", () => {
  it("places NOT VALID outside the CHECK expression", () => {
    expect(migrationSql).toMatch(/\)\)\s+NOT VALID;/);
    expect(migrationSql).not.toMatch(/(?<!\))\)\s+NOT VALID;/);
  });

  it("preserves the movement type and reason matrix", () => {
    expect(migrationSql).toContain(
      '("inventory_movements"."type" = \'IN\' AND "inventory_movements"."reason" IN (\'PURCHASE\', \'ADJUSTMENT\', \'OTHER\'))',
    );
    expect(migrationSql).toContain(
      '("inventory_movements"."type" = \'OUT\' AND "inventory_movements"."reason" IN (\'SALE\', \'ADJUSTMENT\', \'WASTE\', \'OTHER\'))',
    );
  });
});

describe("provenance migration SQL", () => {
  it("keeps legacy rows unclassified and protects origin", () => {
    expect(provenanceMigrationSql).toContain("record_origin");
    expect(provenanceMigrationSql).toContain("DEFAULT 'UNCLASSIFIED' NOT NULL");
    expect(provenanceMigrationSql).toContain("record provenance is immutable");
  });

  it("guards cross-origin references and stock changes", () => {
    expect(provenanceMigrationSql).toContain("validate_sale_item_provenance");
    expect(provenanceMigrationSql).toContain("validate_purchase_item_provenance");
    expect(provenanceMigrationSql).toContain("validate_movement_provenance");
    expect(provenanceMigrationSql).toContain("stock change requires a matching operation origin");
  });
});
