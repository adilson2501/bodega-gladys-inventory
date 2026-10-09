"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/", label: "Inicio", shortLabel: "Inicio" },
  { href: "/productos", label: "Productos", shortLabel: "Productos" },
  { href: "/movimiento", label: "Movimiento", shortLabel: "Mover" },
  { href: "/inventario", label: "Inventario", shortLabel: "Stock" },
  { href: "/historial", label: "Historial", shortLabel: "Historial" },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:px-5"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-5 gap-1">
        {navigationItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-12 items-center justify-center rounded-xl px-1 text-center text-[11px] font-medium transition sm:text-sm ${
                isActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
