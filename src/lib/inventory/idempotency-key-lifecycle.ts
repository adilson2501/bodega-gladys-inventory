export function createIdempotencyKeyLifecycle(generateKey: () => string) {
  let currentKey: string | null = null;

  return {
    ensureKey() {
      currentKey ??= generateKey();
      return currentKey;
    },
    getKey() {
      return currentKey;
    },
    rotateKey() {
      currentKey = generateKey();
      return currentKey;
    },
  };
}
