import { withVerifiedStagingConnection } from "./staging-db.mjs";
import { reportSanitizedError } from "./error-reporting.mjs";

withVerifiedStagingConnection(async ({ endpointHostname, metadata }) => {
  const neonBranchIdentity =
    metadata.neon_timeline_id ?? metadata.neon_endpoint_id ?? endpointHostname;

  console.log(JSON.stringify({
    database_name: metadata.database_name,
    role_name: metadata.role_name,
    endpoint_hostname: endpointHostname,
    neon_branch_identity: neonBranchIdentity,
    neon_timeline_id: metadata.neon_timeline_id ?? null,
    neon_endpoint_id: metadata.neon_endpoint_id ?? null,
    transaction_read_only: metadata.transaction_read_only,
    identity_verified_against: "STAGING_NEON_ENDPOINT_HOST",
  }, null, 2));
}).catch((error) => {
  reportSanitizedError("Verificación de staging fallida:", error);
  process.exitCode = 1;
});
