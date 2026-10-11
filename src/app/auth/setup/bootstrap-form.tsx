"use client";

import { useActionState } from "react";

import { bootstrapAdmin, type BootstrapActionState } from "@/actions/auth";

export function BootstrapForm() {
  const [state, formAction, isPending] = useActionState<BootstrapActionState, FormData>(
    bootstrapAdmin,
    null,
  );

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Bodega Gladys
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Crear acceso administrador
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Este acceso solo se puede crear una vez. Usa el correo y la contraseña que Gladys
          utilizará para ingresar a la bodega.
        </p>

        <form action={formAction} className="mt-8 space-y-5">
          <FormField label="Nombre" htmlFor="setup-name">
            <input
              id="setup-name"
              name="name"
              type="text"
              defaultValue="Gladys"
              autoComplete="name"
              required
              className="form-input"
            />
          </FormField>

          <FormField label="Correo electrónico" htmlFor="setup-email">
            <input
              id="setup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="form-input"
            />
          </FormField>

          <FormField label="Contraseña" htmlFor="setup-password" hint="Mínimo 12 caracteres.">
            <input
              id="setup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="form-input"
            />
          </FormField>

          <FormField label="Confirmar contraseña" htmlFor="setup-password-confirmation">
            <input
              id="setup-password-confirmation"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="form-input"
            />
          </FormField>

          <FormField
            label="Token de instalación"
            htmlFor="setup-token"
            hint="Es el valor de BOOTSTRAP_ADMIN_TOKEN en .env.local."
          >
            <input
              id="setup-token"
              name="setupToken"
              type="password"
              autoComplete="off"
              required
              className="form-input"
            />
          </FormField>

          {state?.error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 text-base font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Creando acceso..." : "Crear acceso administrador"}
          </button>
        </form>
      </section>
    </main>
  );
}

function FormField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-800">
        {label} <span aria-hidden="true">*</span>
      </label>
      {children}
      {hint ? <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}
