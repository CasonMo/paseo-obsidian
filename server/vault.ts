import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { MAX_IMAGES_PER_NOTE, MAX_IMAGE_BYTES, MAX_NOTE_BYTES } from "../shared/contracts";
import type { NoteImage, NoteReadResult, NoteSummary, ObsidianSettingsValues, VaultEntry } from "../shared/contracts";
import { extractImageRefs, mimeForPath, normalizeNewlines, stripFrontmatter } from "../shared/markdown";
import { noteTitle, rankCandidate } from "../shared/paths";
import { getImageIndex, getNoteFiles } from "./cache";
import type { VaultFile } from "./cache";
import { resolveLinks } from "./links";
import {
  VaultError,
  describeFsError,
  expandHome,
  failureFrom,
  resolveInVault,
  toVaultRelative,
  tryResolveFile,
} from "./paths";

const REGISTRY_SCHEMA = z.object({
  vaults: z.record(z.string(), z.object({ path: z.string() })),
});

function toFailure(error: unknown): NoteReadResult {
  return { ok: false, ...failureFrom(error) };
}

/** vault 成员校验 + realpath 收敛；依赖 listVaults，故住本模块而非 paths（避循环 import）。 */
export async function resolveVaultRoot(vault: string, settings: ObsidianSettingsValues): Promise<string> {
  const entries = await listVaults(settings);
  const entry = entries.find((candidate) => candidate.path === vault);
  if (!entry) throw new VaultError("forbidden", "err.vault-unconfigured");
  if (!entry.exists) throw new VaultError("vault-missing", entry.error ?? "err.vault-unavailable");
  return realpath(entry.path);
}

function registryPath(): string | null {
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library/Application Support/obsidian/obsidian.json");
  }
  if (process.platform === "win32") {
    return process.env.APPDATA ? path.join(process.env.APPDATA, "obsidian/obsidian.json") : null;
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "obsidian/obsidian.json");
}

/** 服务器没装 Obsidian 是常态，探测失败一律返回空，不报错。 */
async function detectObsidianVaults(): Promise<string[]> {
  const file = registryPath();
  if (!file) return [];
  try {
    const parsed = REGISTRY_SCHEMA.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (!parsed.success) return [];
    return Object.values(parsed.data.vaults)
      .map((vault) => vault.path)
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

export async function listVaults(settings: ObsidianSettingsValues): Promise<VaultEntry[]> {
  const detected = settings.autoDetect ? await detectObsidianVaults() : [];
  const candidates = [
    ...settings.vaultPaths.map((raw) => ({ raw, source: "manual" as const })),
    ...detected.map((raw) => ({ raw, source: "obsidian" as const })),
  ];
  const entries: VaultEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = path.resolve(expandHome(candidate.raw.trim()));
    let key = resolved;
    let exists = false;
    let error: string | null = null;
    try {
      key = await realpath(resolved);
      const info = await stat(key);
      if (info.isDirectory()) exists = true;
      else error = "err.not-dir";
    } catch (fsError) {
      error = describeFsError(fsError);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    if (!exists && candidate.source === "obsidian") continue;
    entries.push({
      path: resolved,
      label: path.basename(resolved) || resolved,
      source: candidate.source,
      exists,
      error,
    });
  }
  return entries;
}

function toSummary(file: VaultFile, snippet: string | null): NoteSummary {
  return {
    path: file.path,
    title: noteTitle(file.path),
    mtimeMs: file.mtimeMs,
    sizeBytes: file.sizeBytes,
    snippet,
  };
}

export async function listNotes(
  vault: string,
  settings: ObsidianSettingsValues,
  limit: number,
): Promise<{ notes: NoteSummary[]; total: number; truncated: boolean }> {
  const root = await resolveVaultRoot(vault, settings);
  const files = [...(await getNoteFiles(root))];
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const cap = limit === 0 ? files.length : limit;
  return {
    notes: files.slice(0, cap).map((file) => toSummary(file, null)),
    total: files.length,
    truncated: files.length > cap,
  };
}

async function resolveImages(root: string, noteDir: string, body: string): Promise<NoteImage[]> {
  const targets: string[] = [];
  for (const ref of extractImageRefs(body)) {
    if (!targets.includes(ref.target)) targets.push(ref.target);
  }

  const noteRelDir = toVaultRelative(root, noteDir);
  let index: Map<string, string[]> | null = null;
  const images: NoteImage[] = [];

  for (const [position, target] of targets.entries()) {
    if (position >= MAX_IMAGES_PER_NOTE) {
      images.push({ ref: target, path: null, problem: "too-many" });
      continue;
    }
    if (mimeForPath(target) === null) {
      images.push({ ref: target, path: null, problem: "not-found" });
      continue;
    }

    let resolved =
      (await tryResolveFile(root, path.join(noteDir, target))) ??
      (await tryResolveFile(root, path.join(root, target)));

    // Obsidian 的最短路径习惯：裸文件名可能在 vault 任意目录，只在需要时建一次索引。
    if (!resolved && !target.includes("/")) {
      index ??= await getImageIndex(root);
      const candidates = index.get(target.toLowerCase()) ?? [];
      const ranked = [...candidates].sort((a, b) => rankCandidate(noteRelDir, a) - rankCandidate(noteRelDir, b));
      for (const candidate of ranked) {
        resolved = await tryResolveFile(root, path.join(root, candidate));
        if (resolved) break;
      }
    }

    if (!resolved) {
      images.push({ ref: target, path: null, problem: "not-found" });
      continue;
    }
    const info = await stat(resolved);
    if (info.size > MAX_IMAGE_BYTES) {
      images.push({ ref: target, path: null, problem: "too-large" });
      continue;
    }
    images.push({ ref: target, path: toVaultRelative(root, resolved), problem: null });
  }

  return images;
}

export async function readNote(
  vault: string,
  notePath: string,
  settings: ObsidianSettingsValues,
): Promise<NoteReadResult> {
  try {
    const root = await resolveVaultRoot(vault, settings);
    const absolute = await resolveInVault(root, notePath);
    const info = await stat(absolute);
    if (!info.isFile()) throw new VaultError("not-found", "err.not-file");
    if (info.size > MAX_NOTE_BYTES) {
      throw new VaultError("too-large", `err.note-too-large:${MAX_NOTE_BYTES / 1024 / 1024}`);
    }
    const raw = await readFile(absolute, "utf8");
    const stripped = stripFrontmatter(raw);
    const body = normalizeNewlines(stripped.body);
    const heading = /^#[ \t]+(.+)$/m.exec(body)?.[1]?.trim();
    const title = stripped.title || heading || noteTitle(notePath);
    const images = await resolveImages(root, path.dirname(absolute), body);
    const links = await resolveLinks(root, path.dirname(absolute), body);
    return {
      ok: true,
      title,
      content: body,
      mtimeMs: info.mtimeMs,
      sizeBytes: info.size,
      images,
      links,
    };
  } catch (error) {
    return toFailure(error);
  }
}

export async function readImage(
  vault: string,
  imagePath: string,
  settings: ObsidianSettingsValues,
): Promise<Uint8Array> {
  const root = await resolveVaultRoot(vault, settings);
  const absolute = await resolveInVault(root, imagePath);
  const info = await stat(absolute);
  if (!info.isFile()) throw new VaultError("not-found", "err.image-not-found");
  if (mimeForPath(absolute) === null) throw new VaultError("not-found", "err.image-format");
  if (info.size > MAX_IMAGE_BYTES) {
    throw new VaultError("too-large", `err.image-too-large:${MAX_IMAGE_BYTES / 1024 / 1024}`);
  }
  return readFile(absolute);
}