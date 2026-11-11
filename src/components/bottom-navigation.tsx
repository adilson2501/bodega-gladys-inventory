"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/productos", label: "Productos", icon: "products" },
  { href: "/movimiento", label: "Registrar", icon: "movement", primary: true },
  { href: "/inventario", label: "Stock", icon: "inventory" },
  { href: "/historial", label: "Historial", icon: "history" },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:px-5"
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
              className={`flex min-h-15 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-xs font-semibold transition sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                isActive
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "primary" in item && item.primary
                    ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function NavigationIcon({ name }: { name: (typeof navigationItems)[number]["icon"] }) {
  const commonProps = {
    "aria-hidden": true,
    className: "h-5 w-5 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
  };

  if (name === "home") {
    return (
      <svg {...commonProps}>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
        <path d="M9 21v-6h6v6" />
      </svg>
    );
  }

  if (name === "products") {
    return (
      <svg {...commonProps}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5Z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  if (name === "movement") {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14M5 12h14" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }

  if (name === "inventory") {
    return (
      <svg {...commonProps}>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5Z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
