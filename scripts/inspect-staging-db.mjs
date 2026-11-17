import { reportSanitizedError } from "./error-reporting.mjs";
import { inspectStagingMigrationState } from "./staging-migration-state.mjs";

inspectStagingMigrationState()
  .then((report) => console.log(JSON.stringify(report, null, 2)))
  .catch((error) => {
    reportSanitizedError("Inspección de staging fallida:", error);
    process.exitCode = 1;
  });
