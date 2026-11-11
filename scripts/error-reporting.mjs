const connectionStringPattern = /\bpostgres(?:ql)?:\/\/[^\s"'`]+/gi;
const secretParameterPattern = /\b(password|passwd|secret|token)=([^&\s]+)/gi;

export function sanitizeText(value, secrets = []) {
  let sanitized = String(value)
    .replace(connectionStringPattern, "[connection string redacted]")
    .replace(secretParameterPattern, "$1=[redacted]");

  for (const secret of secrets.filter(Boolean)) {
    sanitized = sanitized.split(secret).join("[redacted]");
  }

  return sanitized;
}

export function sanitizedErrorMessage(error, secrets = []) {
  const message = error instanceof Error ? error.message : String(error);
  const details = [
    error?.code ? `code=${error.code}` : "",
    error?.detail ? `detail=${error.detail}` : "",
    error?.hint ? `hint=${error.hint}` : "",
    error?.constraint ? `constraint=${error.constraint}` : "",
    error?.table ? `table=${error.table}` : "",
    error?.column ? `column=${error.column}` : "",
  ].filter(Boolean).join(" ");
  const aggregateErrors = error?.errors ?? [];
  const aggregateMessage = aggregateErrors.length
    ? ` Errors: ${aggregateErrors.map((nestedError) => sanitizedErrorMessage(nestedError, secrets)).join(" | ")}`
    : "";
  const cleanupErrors = error?.cleanupErrors ?? [];
  const cleanupMessage = cleanupErrors.length
    ? ` Cleanup: ${cleanupErrors.map((cleanupError) => sanitizedErrorMessage(cleanupError, secrets)).join(" | ")}`
    : "";

  return `${sanitizeText(message, secrets)}${details ? ` ${sanitizeText(details, secrets)}` : ""}${aggregateMessage}${cleanupMessage}`;
}

export function reportSanitizedError(prefix, error, secrets = []) {
  console.error(`${prefix} ${sanitizedErrorMessage(error, secrets)}`);
}
