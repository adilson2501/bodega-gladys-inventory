import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { loadStagingDatabase } from "./staging-db.mjs";

function run() {
  // The staging loader clears inherited DATABASE_URL and validates the endpoint
  // before loading the staging environment, so production cannot be a fallback.
  const { databaseUrl } = loadStagingDatabase();
  const nextBin = resolve("node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : "No se pudo iniciar staging.");
  process.exitCode = 1;
}
