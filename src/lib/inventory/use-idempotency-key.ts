"use client";

import { useRef } from "react";

import { createIdempotencyKeyLifecycle } from "@/lib/inventory/idempotency-key-lifecycle";

export function useIdempotencyKey() {
  const lifecycleRef = useRef<ReturnType<typeof createIdempotencyKeyLifecycle> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (lifecycleRef.current == null) {
    lifecycleRef.current = createIdempotencyKeyLifecycle(() => crypto.randomUUID());
  }

  function rotateKey() {
    const key = lifecycleRef.current!.rotateKey();

    if (inputRef.current) {
      inputRef.current.value = key;
    }
  }

  function ensureKey() {
    const key = lifecycleRef.current!.ensureKey();

    if (inputRef.current && inputRef.current.value !== key) {
      inputRef.current.value = key;
    }
  }

  return { inputRef, ensureKey, rotateKey };
}
