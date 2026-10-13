"use server";

import { redirect } from "next/navigation";

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

function sanitizeAuthMessage(message: unknown) {
  return String(message ?? "Unknown authentication error")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
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

  let error;
  try {
    ({ error } = await getAuth().signIn.email({
      email: email.trim(),
      password,
    }));
  } catch (caughtError) {
    console.error({
      timestamp: new Date().toISOString(),
      source: "neon-auth-sign-in",
      kind: "thrown-exception",
      errorClass: caughtError instanceof Error ? caughtError.constructor.name : "Unknown",
      errorName: caughtError instanceof Error ? caughtError.name : "Unknown",
      message: sanitizeAuthMessage(caughtError instanceof Error ? caughtError.message : undefined),
    });
    return { error: "No se pudo iniciar sesión. Inténtalo nuevamente." };
  }

  if (error) {
    console.error({
      timestamp: new Date().toISOString(),
      source: "neon-auth-sign-in",
      kind: "returned-error",
      sdkCode: error.code,
      status: error.status,
      statusText: error.statusText,
      message: sanitizeAuthMessage(error.message),
    });
    return { error: "El correo o la contraseña no son correctos." };
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
