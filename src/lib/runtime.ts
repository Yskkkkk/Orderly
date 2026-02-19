export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as any;
  return Boolean(g.isTauri || g.__TAURI__ || g.__TAURI_INTERNALS__);
}
