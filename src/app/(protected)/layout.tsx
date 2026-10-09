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
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Bodega Gladys</p>
            <p className="text-xs text-slate-500">Gestión de inventario</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      <BottomNavigation />
    </div>
  );
}
