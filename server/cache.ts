import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { mimeForPath } from "../shared/markdown";
import { toVaultRelative } from "./paths";

interface VaultFile {
  path: string;
  mtimeMs: number;
  sizeBytes: number;
}
export type { VaultFile };

/** 跳过点开头条目（.obsidian/.git/.trash 与 iCloud 占位）和 symlink（防环防逃逸）。 */
async function walk(root: string, accept: (name: string) => boolean): Promise<VaultFile[]> {
  const files: VaultFile[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !accept(entry.name)) continue;
      try {
        const info = await stat(full);
        files.push({ path: toVaultRelative(root, full), mtimeMs: info.mtimeMs, sizeBytes: info.size });
      } catch {
        // 单文件 stat 失败跳过
      }
    }
  }
  return files;
}

/** notes 列表 walk 缓存：搜索与浏览共用，避免每键全 vault re-walk；in-flight 去重防并发首查重复 walk。 */
const notesCache = new Map<string, { files: VaultFile[]; ts: number }>();
const notesInFlight = new Map<string, Promise<VaultFile[]>>();

export function clearNotesCache(): void {
  notesCache.clear();
  notesInFlight.clear();
}

export async function getNoteFiles(root: string): Promise<VaultFile[]> {
  const cached = notesCache.get(root);
  if (cached && Date.now() - cached.ts < 30_000) return cached.files;
  const existing = notesInFlight.get(root);
  if (existing) return existing;
  const task = walk(root, (name) => name.toLowerCase().endsWith(".md"))
    .then((files) => {
      notesCache.set(root, { files, ts: Date.now() });
      return files;
    })
    .finally(() => {
      notesInFlight.delete(root);
    });
  notesInFlight.set(root, task);
  return task;
}

async function buildImageIndex(root: string): Promise<Map<string, string[]>> {
  const files = await walk(root, (name) => mimeForPath(name) !== null);
  const index = new Map<string, string[]>();
  for (const file of files) {
    const name = file.path.slice(file.path.lastIndexOf("/") + 1).toLowerCase();
    const existing = index.get(name);
    if (existing) existing.push(file.path);
    else index.set(name, [file.path]);
  }
  return index;
}

/** 纯内存缓存，避免 iCloud 上每次裸文件名解析都全 vault walk；in-flight 去重。 */
const imageIndexCache = new Map<string, { index: Map<string, string[]>; ts: number }>();
const imageIndexInFlight = new Map<string, Promise<Map<string, string[]>>>();

export function clearImageIndexCache(): void {
  imageIndexCache.clear();
  imageIndexInFlight.clear();
}

export async function getImageIndex(root: string): Promise<Map<string, string[]>> {
  const cached = imageIndexCache.get(root);
  if (cached && Date.now() - cached.ts < 30_000) return cached.index;
  const existing = imageIndexInFlight.get(root);
  if (existing) return existing;
  const task = buildImageIndex(root)
    .then((index) => {
      imageIndexCache.set(root, { index, ts: Date.now() });
      return index;
    })
    .finally(() => {
      imageIndexInFlight.delete(root);
    });
  imageIndexInFlight.set(root, task);
  return task;
}