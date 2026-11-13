"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import {
  getInactivityStatus,
  getInitialActivityAt,
  getRemainingInactivityMs,
  INACTIVITY_CHANNEL_NAME,
  INACTIVITY_CONTROL_STORAGE_KEY,
  isValidActivityTimestamp,
  isSameSessionScope,
  shouldSyncActivity,
  WARNING_BEFORE_TIMEOUT_MS,
} from "@/lib/auth/inactivity";
import { hasAuthOperationError, withLogoutTimeout } from "@/lib/auth/logout";

const ACTIVITY_STORAGE_KEY = "bodega-gladys.auth.last-activity";

type ActivityRecord = { userId: string; sessionId: string; lastActivityAt: number };
type ControlMessage =
  | { type: "activity"; at: number; sessionId: string }
  | { type: "logout"; at: number; sessionId: string };

type InactivityManagerProps = {
  userId: string;
  sessionId: string;
  sessionCreatedAt: Date | string | null;
};

function parseActivityRecord(value: string | null, userId: string, sessionId: string) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ActivityRecord>;
    if (!isSameSessionScope(parsed, userId, sessionId) || !isValidActivityTimestamp(parsed.lastActivityAt)) return null;
    return parsed.lastActivityAt;
  } catch {
    return null;
  }
}

function parseControlMessage(value: string | null): ControlMessage | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ControlMessage>;
    if ((parsed.type !== "activity" && parsed.type !== "logout") || typeof parsed.sessionId !== "string" || !isValidActivityTimestamp(parsed.at)) {
      return null;
    }
    return parsed as ControlMessage;
  } catch {
    return null;
  }
}

export function InactivityManager({ userId, sessionId, sessionCreatedAt }: InactivityManagerProps) {
  const router = useRouter();
  const [warningVisible, setWarningVisible] = useState(false);
  const [remainingMs, setRemainingMs] = useState(WARNING_BEFORE_TIMEOUT_MS);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  const recordActivityRef = useRef<() => void>(() => undefined);
  const retryLogoutRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const authenticatedUserId = userId;
    const authenticatedSessionId = sessionId;

    const persistedActivityAt = parseActivityRecord(window.localStorage.getItem(ACTIVITY_STORAGE_KEY), authenticatedUserId, authenticatedSessionId);
    const createdAt = sessionCreatedAt instanceof Date ? sessionCreatedAt.getTime() : Date.parse(String(sessionCreatedAt));
    const sessionCreatedTimestamp = Number.isFinite(createdAt) ? createdAt : null;
    let lastActivityAt = getInitialActivityAt(persistedActivityAt, sessionCreatedTimestamp);
    if (persistedActivityAt === null) {
      window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify({ userId: authenticatedUserId, sessionId: authenticatedSessionId, lastActivityAt } satisfies ActivityRecord));
    }

    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(INACTIVITY_CHANNEL_NAME);
    let lastBroadcastAt: number | null = null;
    let warningTimer: number | undefined;
    let countdownTimer: number | undefined;
    let logoutStarted = false;
    let expired = false;

    function clearTimers() {
      if (warningTimer !== undefined) window.clearTimeout(warningTimer);
      if (countdownTimer !== undefined) window.clearTimeout(countdownTimer);
      warningTimer = undefined;
      countdownTimer = undefined;
    }

    function broadcast(message: ControlMessage) {
      channel?.postMessage(message);
      try {
        window.localStorage.setItem(INACTIVITY_CONTROL_STORAGE_KEY, JSON.stringify(message));
      } catch {
        // BroadcastChannel remains available when storage is blocked.
      }
    }

    function persistActivity(at: number, announce: boolean) {
      lastActivityAt = Math.min(at, Date.now());
      const syncActivity = announce && shouldSyncActivity(lastBroadcastAt, lastActivityAt);
      if (syncActivity) {
        window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify({ userId: authenticatedUserId, sessionId: authenticatedSessionId, lastActivityAt } satisfies ActivityRecord));
        lastBroadcastAt = lastActivityAt;
        broadcast({ type: "activity", at: lastActivityAt, sessionId: authenticatedSessionId });
      }
    }

    async function performLogout(announce: boolean) {
      if (logoutStarted) return;
      logoutStarted = true;
      expired = true;
      clearTimers();
      setWarningVisible(false);
      setLogoutInProgress(true);
      window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);

      try {
        const result = await withLogoutTimeout(authClient.signOut());
        if (hasAuthOperationError(result)) throw new Error("Neon Auth signOut failed");
      } catch {
        logoutStarted = false;
        setLogoutInProgress(true);
        setLogoutFailed(true);
        return;
      }

      setLogoutInProgress(false);
      if (announce) broadcast({ type: "logout", at: Date.now(), sessionId: authenticatedSessionId });
      router.replace("/auth/sign-in");
      router.refresh();
    }

    function expireSession() {
      if (expired) return;
      void performLogout(true);
    }

    function scheduleCheck() {
      clearTimers();
      const now = Date.now();
      const status = getInactivityStatus(lastActivityAt, now);

      if (status === "expired") {
        countdownTimer = window.setTimeout(expireSession, 0);
        return;
      }

      if (status === "warning") {
        warningTimer = window.setTimeout(() => {
          setWarningVisible(true);
          setRemainingMs(getRemainingInactivityMs(lastActivityAt));
        }, 0);
        countdownTimer = window.setTimeout(scheduleCheck, 1000);
        return;
      }

      warningTimer = window.setTimeout(scheduleCheck, getRemainingInactivityMs(lastActivityAt, now) - WARNING_BEFORE_TIMEOUT_MS);
    }

    function recordActivity() {
      if (expired) return;
      persistActivity(Date.now(), true);
      setWarningVisible(false);
      setRemainingMs(WARNING_BEFORE_TIMEOUT_MS);
      scheduleCheck();
    }

    function reevaluateActivity() {
      if (expired) return;
      const status = getInactivityStatus(lastActivityAt);
      if (status === "expired") {
        expireSession();
      } else {
        scheduleCheck();
      }
    }

    function handleControlMessage(message: ControlMessage) {
      if (message.sessionId !== authenticatedSessionId) return;
      if (message.type === "logout") {
        if (logoutStarted) return;
        logoutStarted = true;
        expired = true;
        clearTimers();
        setWarningVisible(false);
        setLogoutInProgress(true);
        window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);
        router.replace("/auth/sign-in");
        router.refresh();
        return;
      }

      if (message.at <= lastActivityAt || expired) return;
      persistActivity(message.at, false);
      setWarningVisible(false);
      setRemainingMs(WARNING_BEFORE_TIMEOUT_MS);
      scheduleCheck();
    }

    function handleChannelMessage(event: MessageEvent<ControlMessage>) {
      if (event.data) handleControlMessage(event.data);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === INACTIVITY_CONTROL_STORAGE_KEY) {
        const message = parseControlMessage(event.newValue);
        if (message) handleControlMessage(message);
      }
      if (event.key === ACTIVITY_STORAGE_KEY) {
        const activity = parseActivityRecord(event.newValue, authenticatedUserId, authenticatedSessionId);
        if (activity !== null && activity > lastActivityAt) handleControlMessage({ type: "activity", at: activity, sessionId: authenticatedSessionId });
      }
    }

    recordActivityRef.current = recordActivity;
    retryLogoutRef.current = () => void performLogout(true);
    channel?.addEventListener("message", handleChannelMessage);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity);
    document.addEventListener("visibilitychange", reevaluateActivity);
    window.addEventListener("focus", reevaluateActivity);
    window.addEventListener("pageshow", reevaluateActivity);
    scheduleCheck();

    return () => {
      clearTimers();
      channel?.removeEventListener("message", handleChannelMessage);
      channel?.close();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      document.removeEventListener("visibilitychange", reevaluateActivity);
      window.removeEventListener("focus", reevaluateActivity);
      window.removeEventListener("pageshow", reevaluateActivity);
      recordActivityRef.current = () => undefined;
      retryLogoutRef.current = () => undefined;
    };
  }, [router, sessionCreatedAt, sessionId, userId]);

  useEffect(() => {
    if (warningVisible) continueButtonRef.current?.focus();
  }, [warningVisible]);

  if (!warningVisible && !logoutInProgress) return null;

  if (logoutFailed) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="logout-failed-title" aria-describedby="logout-failed-description">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="logout-failed-title" className="text-lg font-bold text-slate-950">No se pudo cerrar la sesión</h2>
          <p id="logout-failed-description" className="mt-2 text-sm leading-6 text-slate-700">La sesión remota no pudo invalidarse. La pantalla permanece bloqueada; inténtalo nuevamente.</p>
          <button type="button" onClick={() => { setLogoutFailed(false); retryLogoutRef.current(); }} className="mt-5 min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">Reintentar cerrar sesión</button>
        </section>
      </div>
    );
  }

  if (logoutInProgress) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="logout-title">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
          <h2 id="logout-title" className="text-lg font-bold text-slate-950">Cerrando sesión...</h2>
          <p className="mt-2 text-sm text-slate-700">Espera mientras se invalida tu sesión.</p>
        </section>
      </div>
    );
  }

  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="inactivity-title" aria-describedby="inactivity-description">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="inactivity-title" className="text-lg font-bold text-slate-950">Tu sesión se cerrará pronto por inactividad.</h2>
        <p id="inactivity-description" className="mt-2 text-sm leading-6 text-slate-700">Quedan aproximadamente {remainingSeconds} segundos. Las ventas, compras o cambios de inventario sin guardar pueden perderse.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button ref={continueButtonRef} type="button" onClick={() => recordActivityRef.current()} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">Continuar sesión</button>
          <button type="button" onClick={() => retryLogoutRef.current()} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-100">Cerrar sesión</button>
        </div>
      </section>
    </div>
  );
}
