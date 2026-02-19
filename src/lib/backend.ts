import { isTauriRuntime } from "@/lib/runtime";
import { commandError, operationError } from "@/lib/errors";

type InvokeArgs = Record<string, unknown> | undefined;

export async function invokeCommand<T>(command: string, args?: InvokeArgs): Promise<T> {
  if (isTauriRuntime()) {
    try {
      const mod = await import("@tauri-apps/api/core");
      return await mod.invoke<T>(command, args as any);
    } catch (error) {
      throw commandError(command, error);
    }
  }

  try {
    const mock = await import("@/lib/mockBackend");
    return await mock.mockInvoke<T>(command, args);
  } catch (error) {
    throw commandError(command, error);
  }
}

export async function openPathSafe(path: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      const mod = await import("@tauri-apps/plugin-opener");
      await mod.openPath(path);
      return;
    } catch (error) {
      throw operationError("打开路径", error);
    }
  }
}

export async function openUrlSafe(url: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      const mod = await import("@tauri-apps/plugin-opener");
      await mod.openUrl(url);
      return;
    } catch (error) {
      throw operationError("打开链接", error);
    }
  }

  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // ignore
  }
}
