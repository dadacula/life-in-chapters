import { QueryClient } from "@tanstack/react-query";
import { type z } from "zod";

export const spaceQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

type ActionSchemas = Record<string, { request: z.ZodType; response: z.ZodType }>;

export type ActionClient<T extends ActionSchemas> = {
  [K in keyof T]: (args: z.input<T[K]["request"]>) => Promise<z.output<T[K]["response"]>>;
};

export type ApiRequest<TClient, TAction extends keyof TClient> =
  TClient[TAction] extends (args: infer Args) => Promise<unknown> ? Args : never;

export type ApiResponse<TClient, TAction extends keyof TClient> =
  TClient[TAction] extends (...args: never[]) => Promise<infer Result> ? Result : never;

export function createActionClient<T extends ActionSchemas>(): ActionClient<T> {
  return new Proxy({} as ActionClient<T>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      return async (args: unknown) => {
        let response: Response;
        try {
          response = await fetch("./actions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: property, args }),
          });
        } catch {
          throw new Error("无法连接档案服务。本地页面需要能访问 ./actions。");
        }
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `动作 ${property} 没有完成`);
        }
        return response.json() as Promise<unknown>;
      };
    },
  });
}

export async function fileToBase64(file: Blob): Promise<{ dataBase64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("文件编码失败"));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("文件编码失败");
  return { dataBase64: dataUrl.slice(comma + 1), mimeType: file.type || "application/octet-stream" };
}

export function SafeAreaTopScrim({ backgroundColor }: { backgroundColor?: string }) {
  return <div aria-hidden="true" style={{
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: "env(safe-area-inset-top)",
    background: backgroundColor,
    zIndex: 30,
    pointerEvents: "none",
  }} />;
}
