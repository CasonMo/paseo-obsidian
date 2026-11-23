import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const MAX_NOTE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_NOTE = 40;
export const LIST_CAP = 1000;
export const SEARCH_CAP = 100;

export const obsidianSettingsSchema = z.object({
  /** 手工指定的 vault 绝对路径（支持 ~/）。每台 daemon 各记各的。 */
  vaultPaths: z.array(z.string().min(1).max(1024)).max(20).default([]),
  /** 读本机 Obsidian 注册表自动发现 vault。服务器没装 Obsidian 时探测为空，不报错。 */
  autoDetect: z.boolean().default(true),
});
export type ObsidianSettingsValues = z.infer<typeof obsidianSettingsSchema>;

export const obsidianSettings = defineSettings({
  id: "obsidian",
  scope: "host",
  version: 1,
  schema: obsidianSettingsSchema,
});

/** 按设备记住浏览状态：上次的 vault、打开的笔记、vault 栏收合、各 vault 的目录展开集合。 */
export const obsidianUiSettings = defineSettings({
  id: "ui",
  scope: "device",
  version: 1,
  schema: z.object({
    vault: z.string().nullable().default(null),
    notePath: z.string().nullable().default(null),
    vaultCollapsed: z.boolean().default(false),
    expanded: z.record(z.string(), z.array(z.string().min(1).max(1024)).max(500)).default({}),
    listCollapsed: z.boolean().default(false),
    vaultWidth: z.number().default(200),
    listWidth: z.number().default(320),
    searchHistory: z.array(z.string().min(1).max(200)).max(20).default([]),
    communityDismissed: z.boolean().default(false),
  }),
});

export const VAULT_WIDTH_RANGE = { min: 140, max: 400, default: 200 } as const;
export const LIST_WIDTH_RANGE = { min: 220, max: 560, default: 320 } as const;

export function clampWidth(kind: "vault" | "list", value: number): number {
  const range = kind === "vault" ? VAULT_WIDTH_RANGE : LIST_WIDTH_RANGE;
  if (!Number.isFinite(value)) return range.default;
  return Math.min(Math.max(Math.round(value), range.min), range.max);
}

/** vault 标识就是配置时的路径原值，不另造 id。server 端校验它必须是已知 vault。 */
export const vaultSchema = z.string().min(1).max(1024);

/** vault 内相对路径。realpath 前缀比对是第二道防线。 */
export const notePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."), {
    message: "err.invalid-relative-path",
  });

export const vaultEntrySchema = z.object({
  path: z.string(),
  label: z.string(),
  source: z.enum(["manual", "obsidian"]),
  exists: z.boolean(),
  error: z.string().nullable(),
});
export type VaultEntry = z.infer<typeof vaultEntrySchema>;

export const listVaultsRpc = defineRpc({
  name: "obsidian.list-vaults",
  input: z.object({}),
  output: z.object({ vaults: z.array(vaultEntrySchema) }),
});

export const noteSummarySchema = z.object({
  path: z.string(),
  title: z.string(),
  mtimeMs: z.number(),
  sizeBytes: z.number(),
  snippet: z.string().nullable(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

/** 纯列表：按修改时间倒序。limit=0 表示全量（目录树需要完整路径集合）。搜索走 searchNotesRpc。 */
export const listNotesRpc = defineRpc({
  name: "obsidian.list-notes",
  input: z.object({ vault: vaultSchema, limit: z.number().int().min(0).max(20000).default(LIST_CAP) }),
  output: z.object({
    notes: z.array(noteSummarySchema),
    total: z.number(),
    truncated: z.boolean(),
  }),
});

export const noteImageSchema = z.object({
  /** 归一化后的引用目标，client 用它做取字节与重写的键。 */
  ref: z.string(),
  path: z.string().nullable(),
  problem: z.enum(["not-found", "too-large", "too-many"]).nullable(),
});
export type NoteImage = z.infer<typeof noteImageSchema>;

export const noteLinkSchema = z.object({
  ref: z.string(),
  kind: z.enum(["wikilink", "markdown"]),
  path: z.string().nullable(),
  title: z.string(),
  heading: z.string().nullable(),
});
export type NoteLink = z.infer<typeof noteLinkSchema>;

export const noteReadResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    title: z.string(),
    content: z.string(),
    mtimeMs: z.number(),
    sizeBytes: z.number(),
    images: z.array(noteImageSchema),
    links: z.array(noteLinkSchema).max(200),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum(["vault-missing", "not-found", "too-large", "forbidden", "error"]),
    message: z.string(),
  }),
]);
export type NoteReadResult = z.infer<typeof noteReadResultSchema>;

export const readNoteRpc = defineRpc({
  name: "obsidian.read-note",
  input: z.object({ vault: vaultSchema, path: notePathSchema }),
  output: noteReadResultSchema,
});

/** 顶层 Uint8Array 走二进制帧。裸二进制无法携带错误对象，失败直接 throw。 */
export const readImageRpc = defineRpc({
  name: "obsidian.read-image",
  input: z.object({ vault: vaultSchema, path: notePathSchema }),
  output: z.instanceof(Uint8Array),
});

export const searchHitSchema = z.object({
  vault: z.string(),
  vaultLabel: z.string(),
  path: z.string(),
  title: z.string(),
  snippet: z.string().nullable(),
  kind: z.enum(["name", "content", "tag"]),
  score: z.number(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

/** 全局模糊搜索：vault 为 null 时搜本 host 全部已配置 vault。 */
export const searchNotesRpc = defineRpc({
  name: "obsidian.search",
  input: z.object({ query: z.string().min(1).max(200), vault: vaultSchema.nullable() }),
  output: z.object({
    hits: z.array(searchHitSchema),
    total: z.number(),
    truncated: z.boolean(),
    problem: z.string().nullable().default(null),
  }),
});