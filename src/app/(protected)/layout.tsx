import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { signOut } from "@/actions/auth";

import { BottomNavigation } from "@/components/bottom-navigation";
import { getAuth } from "@/lib/auth/server";
import { hasAuthenticatedUser } from "@/lib/auth/route-guard";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await connection();
  const { data: session } = await getAuth().getSession();

  if (!hasAuthenticatedUser(session)) {
    redirect("/auth/sign-in");
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700 text-base font-bold text-white"
            >
              BG
            </div>
            <div>
              <p className="text-base font-bold text-slate-950">Bodega Gladys</p>
              <p className="text-sm text-slate-600">Control de productos</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-8">{children}</main>
      <BottomNavigation />
    </div>
  );
}
