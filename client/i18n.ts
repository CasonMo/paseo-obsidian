import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";
import { resources } from "./i18n-resources";

export const messages = defineTranslations({ resources });

/** 渲染期 t()：key 为 catalog 扁平路径（如 "list.searchPlaceholder"），args 供 {{占位符}} 与复数 count。 */
export type T = (key: string, args?: Record<string, string | number>) => string;

export function useT(): T {
  return useTranslation(messages).t as T;
}

// 带参 server 错误码 → 占位符名（模块级只存 key，不存译文）。
const ERR_ARG: Record<string, string> = {
  "err.fs": "code",
  "err.note-too-large": "mb",
  "err.image-too-large": "mb",
};

/** server/客户端错误以稳定码回传（err.<key>[:arg]）；按当前语言还原，未知 key 或无码原文透传。 */
export function errorText(raw: unknown, t: T): string {
  const message = raw instanceof Error ? raw.message : String(raw);
  if (!message.startsWith("err.")) return message;
  const colon = message.indexOf(":");
  const key = colon < 0 ? message : message.slice(0, colon);
  const arg = colon < 0 ? null : message.slice(colon + 1);
  try {
    return arg === null ? t(key) : t(key, { [ERR_ARG[key] ?? "code"]: arg });
  } catch {
    // 未知 key（SDK 会抛错）兜底原文，不炸渲染。
    return message;
  }
}