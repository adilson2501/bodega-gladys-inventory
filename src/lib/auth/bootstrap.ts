import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import { canBootstrapAdmin } from "./bootstrap-rules";

type AuthUserCount = {
  count: number | string;
};

export async function isBootstrapAvailable() {
  const result = await db.execute(sql<AuthUserCount>`
    select count(*) as count
    from neon_auth."user"
  `);

  return canBootstrapAdmin(Number(result.rows[0]?.count ?? 0));
}
