"use client";

import { useActionState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { signIn } from "@/actions/auth";
import { authClient } from "@/lib/auth/client";

export function SignInForm() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [state, formAction, isPending] = useActionState(signIn, null);

  useEffect(() => {
    if (session?.user) {
      router.replace("/");
    }
  }, [router, session]);

  if (isSessionPending || session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-8">
        <p className="text-sm text-slate-600">Cargando acceso...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Bodega Gladys
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Gestión de inventario
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Ingresa para revisar y organizar tu inventario.
        </p>

        <form action={formAction} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-800"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-800"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          {state?.error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 text-base font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>
      </section>
    </main>
  );
}
