"use server";

import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth/server";

export type SignInState = {
  error?: string;
} | null;

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
  } catch {
    return { error: "No se pudo iniciar sesión. Inténtalo nuevamente." };
  }

  if (error) {
    console.warn("[auth] Sign-in provider error", {
      operation: "sign-in",
      code: error.code,
      status: error.status,
      statusText: error.statusText,
    });
    return { error: "El correo o la contraseña no son correctos." };
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
