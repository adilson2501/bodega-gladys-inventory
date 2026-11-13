"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const mainItems = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/ventas", label: "Ventas", icon: "sales" },
  { href: "/productos", label: "Productos", icon: "products" },
] as const;

const moreItems = [
  ["/compras", "Compras"], ["/movimiento", "Registrar movimiento"], ["/inventario", "Stock"],
  ["/historial", "Historial"], ["/predicciones", "Predicciones"],
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreActive = moreItems.some(([href]) => pathname.startsWith(href));

  useEffect(() => {
    const closeTimer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!navigationRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        moreButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <nav ref={navigationRef} aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      {open ? <div id="mobile-more-menu" className="absolute bottom-full right-2 mb-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl" role="menu">
        {moreItems.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800" role="menuitem">{label}</Link>)}
      </div> : null}
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {mainItems.map((item) => <NavItem key={item.href} {...item} active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)} onNavigate={() => setOpen(false)} />)}
        <button ref={moreButtonRef} type="button" aria-expanded={open} aria-controls="mobile-more-menu" aria-haspopup="menu" onClick={() => setOpen((value) => !value)} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${moreActive || open ? "bg-emerald-50 text-emerald-800" : "text-slate-600"}`}>
          <Icon name="more" /><span>Más</span>
        </button>
      </div>
    </nav>
  );
}

function NavItem({ href, label, icon, active, onNavigate }: { href: string; label: string; icon: "home" | "sales" | "products"; active: boolean; onNavigate: () => void }) {
  return <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${active ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon name={icon} /><span>{label}</span></Link>;
}

function Icon({ name }: { name: "home" | "sales" | "products" | "more" }) {
  const props = { "aria-hidden": true, className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2, viewBox: "0 0 24 24" };
  if (name === "home") return <svg {...props}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-6h6v6" /></svg>;
  if (name === "products") return <svg {...props}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5Z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  if (name === "sales") return <svg {...props}><path d="M4 6h16v14H4zM8 10h8M8 14h5" /></svg>;
  return <svg {...props}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
}
