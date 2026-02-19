export function errorMessage(error: unknown): string {
  if (typeof error === "string") return cleanupErrorMessage(error);
  if (error instanceof Error) return cleanupErrorMessage(error.message || String(error));
  if (error && typeof error === "object") {
    const maybeMessage = (error as any).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return cleanupErrorMessage(maybeMessage);
    }
  }
  return "未知错误";
}

export function commandError(command: string, error: unknown): Error {
  const msg = errorMessage(error);
  return new Error(`命令执行失败（${command}）：${msg}`);
}

export function operationError(action: string, error: unknown): Error {
  const msg = errorMessage(error);
  return new Error(`${action}失败：${msg}`);
}

export function uiError(error: unknown, fallback: string): string {
  const msg = errorMessage(error).trim();
  return msg ? msg : fallback;
}

function cleanupErrorMessage(raw: string): string {
  let out = raw.trim();
  out = out.replace(/^error returned from backend:\s*/i, "");
  out = out.replace(/^failed to invoke command ['"`].+?['"`]:\s*/i, "");
  return out;
}
