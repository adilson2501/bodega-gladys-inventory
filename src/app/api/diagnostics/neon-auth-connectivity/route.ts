import { lookup } from "node:dns/promises";

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
        errorCauseErrno: getCauseField(error, "errno"),
        errorCauseSyscall: getCauseField(error, "syscall"),
      },
      { status: 500 },
    );
  }

  const dnsResult = await resolveHostname(target.hostname);

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
      ...dnsResult,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    return Response.json(
      {
        diagnostic: "neon-auth-connectivity",
        hostname: target.hostname,
        pathname: target.pathname,
        ...dnsResult,
        errorName: getErrorName(error),
        errorCauseCode: getCauseField(error, "code"),
        errorCauseName: getCauseField(error, "name"),
        errorCauseErrno: getCauseField(error, "errno"),
        errorCauseSyscall: getCauseField(error, "syscall"),
      },
      { status: 502 },
    );
  }
}

async function resolveHostname(hostname: string) {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });

    return {
      dnsLookup: "success",
      dnsAddressCount: addresses.length,
      dnsAddressFamilies: Array.from(new Set(addresses.map((address) => address.family))).sort(),
    };
  } catch (error) {
    return {
      dnsLookup: "failure",
      dnsErrorCode: getSafeErrorField(error, "code"),
    };
  }
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : undefined;
}

function getCauseField(error: unknown, field: "code" | "name" | "errno" | "syscall") {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object") {
    return undefined;
  }

  const value = Reflect.get(error.cause, field);
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function getSafeErrorField(error: unknown, field: "code") {
  if (!error || typeof error !== "object") return undefined;

  const value = Reflect.get(error, field);
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}
