"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth/server";
import { isBootstrapAvailable } from "@/lib/auth/bootstrap";
import {
  bootstrapAdminSchema,
  hasValidBootstrapToken,
} from "@/lib/auth/bootstrap-rules";

export type SignInState = {
  error?: string;
} | null;

export type BootstrapActionState = {
  error?: string;
} | null;

function getErrorProperty(error: unknown, property: string) {
  if (!error || typeof error !== "object" || !(property in error)) {
    return undefined;
  }

  return (error as Record<string, unknown>)[property];
}

function safeHeaderValue(value: string | null) {
  return value?.replace(/[\r\n]/g, " ").slice(0, 255) || undefined;
}

async function logAuthDiagnostic(
  category: "returned-error" | "thrown-error",
  error: unknown,
) {
  if (process.env.AUTH_DEBUG_STAGING !== "1") {
    return;
  }

  try {
    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin");
    let originHost: string | undefined;
    let originScheme: string | undefined;

    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        originHost = parsedOrigin.host;
        originScheme = parsedOrigin.protocol.replace(":", "");
      } catch {
        originHost = "invalid";
      }
    }

    const status = getErrorProperty(error, "status");
    const code = getErrorProperty(error, "code");

    console.error("[auth-debug] Neon Auth login failure", {
      category,
      status: typeof status === "number" ? status : undefined,
      code: typeof code === "string" ? code : undefined,
      originHost,
      originScheme,
      host: safeHeaderValue(requestHeaders.get("host")),
      forwardedHost: safeHeaderValue(requestHeaders.get("x-forwarded-host")),
      forwardedProto: safeHeaderValue(requestHeaders.get("x-forwarded-proto")),
    });
  } catch {
    // Diagnostics must never change authentication behavior.
  }
}

function signInErrorMessage(error: unknown) {
  const status = getErrorProperty(error, "status");
  const code = getErrorProperty(error, "code");
  const normalizedCode = typeof code === "string" ? code.toLowerCase() : "";

  if (
    status === 401 ||
    normalizedCode === "invalid_credentials" ||
    normalizedCode === "invalid_email_or_password"
  ) {
    return "El correo o la contraseña no son correctos.";
  }

  if (status === 404) {
    return "El servicio de acceso no está configurado correctamente.";
  }

  if (typeof status === "number" && status >= 500) {
    return "El servicio de acceso no está disponible. Inténtalo nuevamente más tarde.";
  }

  return "No se pudo completar el inicio de sesión. Inténtalo nuevamente.";
}

function isConfigurationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /NEON_AUTH_|cookie secret|DATABASE_URL/i.test(error.message);
}

function isTransportError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error instanceof TypeError || /fetch|network|timeout|timed out|connect/i.test(error.message);
}

export async function signIn(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || !email.trim()) {
    return { error: "Ingresa tu correo electrónico." };
  }

  if (typeof password !== "string" || !password) {
    return { error: "Ingresa tu contraseña." };
  }

  let error: unknown;
  try {
    ({ error } = await getAuth().signIn.email({
      email: email.trim(),
      password,
    }));
  } catch (caughtError) {
    await logAuthDiagnostic("thrown-error", caughtError);

    if (isConfigurationError(caughtError)) {
      return { error: "El servicio de acceso no está configurado correctamente." };
    }

    if (isTransportError(caughtError)) {
      return { error: "El servicio de acceso no está disponible. Inténtalo nuevamente más tarde." };
    }

    return { error: "Ocurrió un error inesperado. Inténtalo nuevamente." };
  }

  if (error) {
    await logAuthDiagnostic("returned-error", error);

    return { error: signInErrorMessage(error) };
  }

  redirect("/");
}

export async function bootstrapAdmin(
  _previousState: BootstrapActionState,
  formData: FormData,
): Promise<BootstrapActionState> {
  const result = bootstrapAdminSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
    setupToken: formData.get("setupToken"),
  });

  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Revisa los datos ingresados." };
  }

  if (!hasValidBootstrapToken(result.data.setupToken, process.env.BOOTSTRAP_ADMIN_TOKEN)) {
    return { error: "El token de instalación no es válido." };
  }

  if (!(await isBootstrapAvailable())) {
    return { error: "El acceso inicial ya fue creado. Inicia sesión." };
  }

  try {
    const { error } = await getAuth().signUp.email({
      name: result.data.name,
      email: result.data.email,
      password: result.data.password,
    });

    if (error) {
      return { error: "No se pudo crear el acceso. Verifica los datos e inténtalo nuevamente." };
    }
  } catch {
    return { error: "No se pudo crear el acceso. Inténtalo nuevamente." };
  }

  redirect("/");
}

export async function signOut() {
  try {
    await getAuth().signOut();
  } catch {
    redirect("/auth/sign-in");
  }

  redirect("/auth/sign-in");
}
