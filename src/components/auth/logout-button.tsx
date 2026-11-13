"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import { INACTIVITY_CONTROL_STORAGE_KEY } from "@/lib/auth/inactivity";
import { hasAuthOperationError, withLogoutTimeout } from "@/lib/auth/logout";

export function LogoutButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    setError(false);

    try {
      const result = await withLogoutTimeout(authClient.signOut());
      if (hasAuthOperationError(result)) throw new Error("Neon Auth signOut failed");
    } catch {
      setPending(false);
      setError(true);
      return;
    }

    setPending(false);
    try {
      window.localStorage.setItem(INACTIVITY_CONTROL_STORAGE_KEY, JSON.stringify({ type: "logout", at: Date.now(), sessionId }));
    } catch {
      // Storage synchronization must not block an already completed logout.
    }
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={pending}
        className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Cerrando..." : "Salir"}
      </button>
      {error ? <p role="alert" className="text-xs text-red-700">No se pudo cerrar la sesión. Inténtalo nuevamente.</p> : null}
    </div>
  );
}
