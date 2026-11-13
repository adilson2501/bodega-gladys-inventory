import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { InactivityManager } from "@/components/auth/inactivity-manager";
import { BottomNavigation } from "@/components/bottom-navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { getInventoryActor } from "@/lib/auth/actor";
import { getAuth } from "@/lib/auth/server";
import { hasAuthenticatedUser } from "@/lib/auth/route-guard";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await connection();
  const { data: session } = await getAuth().getSession();
  const actor = getInventoryActor(session);
  const sessionId = session?.session?.id;

  if (!hasAuthenticatedUser(session) || !actor || typeof sessionId !== "string") {
    redirect("/auth/sign-in");
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-8">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-sm font-bold text-white"
            >
              BG
            </div>
            <div>
              <p className="text-sm font-bold text-slate-950">Bodega Gladys</p>
              <p className="hidden text-xs text-slate-600 sm:block">Control de productos</p>
            </div>
          </div>
          <DesktopNavigation />
          <LogoutButton sessionId={sessionId} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{children}</main>
      <InactivityManager userId={actor.id} sessionId={sessionId} sessionCreatedAt={session?.session?.createdAt ?? null} />
      <BottomNavigation />
    </div>
  );
}

function DesktopNavigation() {
  return (
    <nav aria-label="Navegación de escritorio" className="hidden items-center gap-1 lg:flex">
      {[
        ["/", "Inicio"], ["/ventas", "Ventas"], ["/productos", "Productos"],
        ["/compras", "Compras"], ["/inventario", "Stock"], ["/historial", "Historial"],
        ["/predicciones", "Predicciones"], ["/movimiento", "Movimientos"],
      ].map(([href, label]) => (
        <a key={href} href={href} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-800">
          {label}
        </a>
      ))}
    </nav>
  );
}
