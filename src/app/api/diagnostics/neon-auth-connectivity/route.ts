// TEMPORARY: remove after diagnosing Vercel -> Neon Auth connectivity.
export async function GET() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;

  if (!baseUrl) {
    return Response.json(
      { diagnostic: "neon-auth-connectivity", errorName: "ConfigurationError" },
      { status: 500 },
    );
  }

  let target: URL;
  try {
    target = new URL("get-session", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  } catch (error) {
    return Response.json(
      {
        diagnostic: "neon-auth-connectivity",
        errorName: getErrorName(error),
        errorCauseCode: getCauseField(error, "code"),
        errorCauseName: getCauseField(error, "name"),
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(target, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
    });

    return Response.json({
      diagnostic: "neon-auth-connectivity",
      hostname: target.hostname,
      pathname: target.pathname,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    return Response.json(
      {
        diagnostic: "neon-auth-connectivity",
        hostname: target.hostname,
        pathname: target.pathname,
        errorName: getErrorName(error),
        errorCauseCode: getCauseField(error, "code"),
        errorCauseName: getCauseField(error, "name"),
      },
      { status: 502 },
    );
  }
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : undefined;
}

function getCauseField(error: unknown, field: "code" | "name") {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object") {
    return undefined;
  }

  const value = Reflect.get(error.cause, field);
  return typeof value === "string" ? value : undefined;
}
