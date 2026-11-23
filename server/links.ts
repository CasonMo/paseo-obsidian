import path from "node:path";
import type { NoteLink } from "../shared/contracts";
import { extractLinkRefs } from "../shared/markdown";
import { basenameKey, noteTitle, rankCandidate } from "../shared/paths";
import { getNoteFiles } from "./cache";
import { toVaultRelative, tryResolveFile } from "./paths";

/** 链出笔记解析：同目录相对 → vault 根相对 → 裸名 basename 索引（同目录优先/段数少优先）。 */
export async function resolveLinks(root: string, noteDir: string, body: string): Promise<NoteLink[]> {
  const refs = extractLinkRefs(body);
  const noteRelDir = toVaultRelative(root, noteDir);
  const files = await getNoteFiles(root);
  const byBase = new Map<string, string[]>();
  for (const file of files) {
    const name = basenameKey(file.path);
    const list = byBase.get(name);
    if (list) list.push(file.path);
    else byBase.set(name, [file.path]);
  }

  const seen = new Set<string>();
  const links: NoteLink[] = [];
  for (const ref of refs) {
    if (links.length >= 200) break;
    const key = `${ref.target}#${ref.heading ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const withExt = ref.target.toLowerCase().endsWith(".md") ? ref.target : `${ref.target}.md`;
    let resolved: string | null = null;
    for (const candidate of [path.join(noteDir, withExt), path.join(root, withExt)]) {
      resolved = await tryResolveFile(root, candidate);
      if (resolved) break;
    }
    if (!resolved && !ref.target.includes("/")) {
      const ranked = [...(byBase.get(ref.target.toLowerCase()) ?? [])].sort(
        (a, b) => rankCandidate(noteRelDir, a) - rankCandidate(noteRelDir, b),
      );
      for (const candidate of ranked) {
        resolved = await tryResolveFile(root, path.join(root, candidate));
        if (resolved) break;
      }
    }
    links.push({
      ref: ref.ref,
      kind: ref.kind,
      path: resolved ? toVaultRelative(root, resolved) : null,
      title: noteTitle(ref.target),
      heading: ref.heading,
    });
  }
  return links;
}