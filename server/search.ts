import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { MAX_NOTE_BYTES, SEARCH_CAP } from "../shared/contracts";
import type { ObsidianSettingsValues, SearchHit } from "../shared/contracts";
import { contentMatch, fuzzyScore } from "../shared/fuzzy";
import { extractInlineTags, makeSnippet, normalizeNewlines, parseQueryTags, stripFrontmatter } from "../shared/markdown";
import { noteTitle } from "../shared/paths";
import { getNoteFiles } from "./cache";
import type { VaultFile } from "./cache";
import { listVaults } from "./vault";

const SEARCH_CONCURRENCY = 16;

function fileTags(text: string): Set<string> {
  const stripped = stripFrontmatter(text);
  const tags = new Set(stripped.tags.map((tag) => tag.toLowerCase()));
  for (const tag of extractInlineTags(stripped.body)) tags.add(tag);
  return tags;
}

/** 全局模糊搜索：vault 为 null 时搜本 host 全部已配置 vault。文件名模糊 + 内容拆词 AND + tag 过滤。 */
export async function searchNotes(
  query: string,
  vault: string | null,
  settings: ObsidianSettingsValues,
): Promise<{ hits: SearchHit[]; total: number; truncated: boolean }> {
  const { tags, rest } = parseQueryTags(query.trim());
  const entries = (await listVaults(settings)).filter((entry) => entry.exists);
  const targets = vault === null ? entries : entries.filter((entry) => entry.path === vault);
  const raw: { hit: SearchHit; mtimeMs: number }[] = [];

  for (const entry of targets) {
    const root = await realpath(entry.path);
    const files = await getNoteFiles(root);
    const pending: VaultFile[] = [];
    for (const file of files) {
      // 带 tag 过滤时统一进 worker 校验，避免 name 命中绕过 tag 条件。
      if (tags.length === 0) {
        const title = noteTitle(file.path);
        const score = fuzzyScore(rest, title);
        if (score !== null) {
          raw.push({
            hit: { vault: entry.path, vaultLabel: entry.label, path: file.path, title, snippet: null, kind: "name", score },
            mtimeMs: file.mtimeMs,
          });
          continue;
        }
      }
      if (file.sizeBytes <= MAX_NOTE_BYTES) pending.push(file);
    }

    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < pending.length) {
        const file = pending[cursor];
        cursor += 1;
        try {
          const rawText = normalizeNewlines(await readFile(path.join(root, file.path), "utf8"));
          if (tags.length > 0) {
            const present = fileTags(rawText);
            if (!tags.every((tag) => present.has(tag))) continue;
          }
          const title = noteTitle(file.path);
          if (rest === "") {
            raw.push({
              hit: { vault: entry.path, vaultLabel: entry.label, path: file.path, title, snippet: null, kind: "tag", score: 500 },
              mtimeMs: file.mtimeMs,
            });
            continue;
          }
          const nameScore = tags.length > 0 ? fuzzyScore(rest, title) : null;
          if (nameScore !== null) {
            raw.push({
              hit: { vault: entry.path, vaultLabel: entry.label, path: file.path, title, snippet: null, kind: "name", score: nameScore },
              mtimeMs: file.mtimeMs,
            });
            continue;
          }
          // match 与 snippet 必须同口径（剥 frontmatter 后的归一化正文），否则偏移错位。
          const body = stripFrontmatter(rawText).body;
          const match = contentMatch(body, rest);
          if (match) {
            raw.push({
              hit: {
                vault: entry.path,
                vaultLabel: entry.label,
                path: file.path,
                title,
                snippet: makeSnippet(body, match.at, match.length),
                kind: "content",
                score: 1,
              },
              mtimeMs: file.mtimeMs,
            });
          }
        } catch {
          // 单文件读失败跳过
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, pending.length) }, worker));
  }

  raw.sort((a, b) => b.hit.score - a.hit.score || b.mtimeMs - a.mtimeMs);
  return {
    hits: raw.slice(0, SEARCH_CAP).map((entry) => entry.hit),
    total: raw.length,
    truncated: raw.length > SEARCH_CAP,
  };
}