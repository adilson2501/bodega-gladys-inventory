import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  [
    "--no-install",
    "vitest",
    "run",
    "--config",
    "vitest.integration.config.mts",
    "tests/integration/import-resolution.test.ts",
  ],
  {
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://import-resolution.invalid/test",
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
