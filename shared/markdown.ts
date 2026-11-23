/**
 * server / client / smoke 三方共用的纯函数。不 import Node、React Native 或 SDK 运行时。
 */

export interface ImageRef {
  /** 归一化后的引用目标，作为取字节与重写的键。 */
  target: string;
  alt: string;
  start: number;
  end: number;
}

const WIKILINK_EMBED = /!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
const STANDARD_IMAGE = /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export function mimeForPath(path: string): string | null {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
}

/** 读写统一口径：只把 \r\n 归一为 \n，孤立的 \r 不动。 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function stripFrontmatter(raw: string): { title: string | null; tags: string[]; body: string } {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { title: null, tags: [], body: raw };
  const block = match[1];
  const declared = /^[ \t]*title:[ \t]*(.+?)[ \t]*$/m.exec(block)?.[1];
  const title = declared ? declared.replace(/^["']|["']$/g, "").trim() : null;
  return { title: title || null, tags: parseFrontmatterTags(block), body: raw.slice(match[0].length) };
}

const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();

/** 行级最小 YAML：flow [a,b]、块 - a、单值/逗号串；嵌套与 flow map 忽略。 */
function parseFrontmatterTags(block: string): string[] {
  const lines = block.split(/\r?\n/);
  const at = lines.findIndex((line) => /^[ \t]*(tags|tag):/.test(line));
  if (at < 0) return [];
  const inlineValue = lines[at].replace(/^[ \t]*(tags|tag):[ \t]*/, "");
  const collected: string[] = [];
  if (inlineValue.startsWith("[")) {
    collected.push(...inlineValue.replace(/^\[|\]$/g, "").split(","));
  } else if (inlineValue.trim() === "") {
    for (let index = at + 1; index < lines.length; index += 1) {
      const item = /^[ \t]*-[ \t]+(.+)$/.exec(lines[index]);
      if (!item) break;
      collected.push(item[1]);
    }
  } else {
    collected.push(...inlineValue.split(","));
  }
  return collected.map(unquote).filter((tag) => tag.length > 0 && !tag.includes(":") && !/^\d+$/.test(tag));
}

/** 标记 fenced code 与行内 code span 的字符位置（1=代码区），供 heading/tag/链接提取跳过。 */
export function codeMask(body: string): Uint8Array {
  const mask = new Uint8Array(body.length);
  const lines = body.split("\n");
  let offset = 0;
  let fence: string | null = null;
  for (const line of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null && fenceMatch) {
      fence = fenceMatch[1][0].repeat(fenceMatch[1].length);
      mask.fill(1, offset, offset + line.length);
    } else if (fence !== null) {
      mask.fill(1, offset, offset + line.length);
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
    } else {
      let cursor = 0;
      while (cursor < line.length) {
        const run = /^`+/.exec(line.slice(cursor));
        if (!run) {
          cursor += 1;
          continue;
        }
        const end = line.indexOf(run[0], cursor + run[0].length);
        if (end < 0) {
          cursor += run[0].length;
          continue;
        }
        mask.fill(1, offset + cursor, offset + end + run[0].length);
        cursor = end + run[0].length;
      }
    }
    offset += line.length + 1;
  }
  return mask;
}

export interface LinkRef {
  ref: string;
  kind: "wikilink" | "markdown";
  target: string;
  heading: string | null;
  start: number;
  end: number;
}

const WIKILINK = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
const MD_LINK = /\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

/** 非 embed 的 wikilink 与相对 md 链接；跳过代码区、外部 scheme、图片与纯锚点。 */
export function extractLinkRefs(body: string): LinkRef[] {
  const mask = codeMask(body);
  const refs: LinkRef[] = [];
  for (const match of body.matchAll(WIKILINK)) {
    const start = match.index ?? 0;
    if (start > 0 && body[start - 1] === "!") continue;
    if (mask[start]) continue;
    const [rawTarget, ...rest] = match[1].split("#");
    const target = normalizeTarget(rawTarget);
    if (!target) continue;
    refs.push({
      ref: match[0],
      kind: "wikilink",
      target,
      heading: rest.join("#").trim() || null,
      start,
      end: start + match[0].length,
    });
  }
  for (const match of body.matchAll(MD_LINK)) {
    const start = match.index ?? 0;
    if (start > 0 && body[start - 1] === "!") continue;
    if (mask[start]) continue;
    const target = normalizeTarget(match[2]);
    if (!target || mimeForPath(target) !== null) continue;
    refs.push({ ref: match[0], kind: "markdown", target, heading: null, start, end: start + match[0].length });
  }
  refs.sort((a, b) => a.start - b.start);
  const ordered: LinkRef[] = [];
  let lastEnd = -1;
  for (const ref of refs) {
    if (ref.start < lastEnd) continue;
    ordered.push(ref);
    lastEnd = ref.end;
  }
  return ordered;
}

export interface Section {
  text: string;
  heading: { level: number; text: string } | null;
}

const ATX = /^ {0,3}(#{1,6})[ \t]+(.*)$/;

/** 按 ATX heading 切段（含 preamble）；围栏内的 # 不算 heading；不支持 setext。 */
export function splitSections(body: string): Section[] {
  const mask = codeMask(body);
  const sections: Section[] = [];
  let current: Section = { text: "", heading: null };
  let offset = 0;
  for (const line of body.split("\n")) {
    const match = mask[offset] ? null : ATX.exec(line);
    if (match) {
      if (current.text.trim() !== "" || current.heading !== null) sections.push(current);
      current = {
        text: line,
        heading: { level: match[1].length, text: match[2].replace(/[ \t]+#+[ \t]*$/, "").trim() },
      };
    } else {
      current.text += (current.text === "" ? "" : "\n") + line;
    }
    offset += line.length + 1;
  }
  if (current.text.trim() !== "" || current.heading !== null) sections.push(current);
  return sections;
}

/** 大小写不敏感的全部出现位置。查找必须跑在原始文本上，不能跑在重写后文本。 */
export function findMatches(text: string, needle: string): number[] {
  const q = needle.toLowerCase();
  if (!q) return [];
  const t = text.toLowerCase();
  const positions: number[] = [];
  let at = t.indexOf(q);
  while (at >= 0) {
    positions.push(at);
    at = t.indexOf(q, at + q.length);
  }
  return positions;
}

const INLINE_TAG = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;

/** inline #tag：# 前仅空白/行首，拒绝纯数字（排除 #123），跳过代码区。 */
export function extractInlineTags(body: string): string[] {
  const mask = codeMask(body);
  const tags: string[] = [];
  for (const match of body.matchAll(INLINE_TAG)) {
    const at = (match.index ?? 0) + match[1].length;
    if (mask[at]) continue;
    const tag = match[2];
    if (/^\d+$/.test(tag)) continue;
    tags.push(tag.toLowerCase());
  }
  return tags;
}

/** 搜索 query 里的 tag token：#x 与 tag:x；其余词留给模糊/AND 管线。 */
export function parseQueryTags(query: string): { tags: string[]; rest: string } {
  const tags: string[] = [];
  const rest: string[] = [];
  for (const token of query.split(/\s+/).filter(Boolean)) {
    if (token.startsWith("#") && token.length > 1) tags.push(token.slice(1).toLowerCase());
    else if (token.toLowerCase().startsWith("tag:") && token.length > 4) tags.push(token.slice(4).toLowerCase());
    else rest.push(token);
  }
  return { tags, rest: rest.join(" ") };
}

/** 远程图与 data/blob 由 host 自己渲染，不进插件的图片管线。 */
function normalizeTarget(raw: string): string | null {
  let value = raw.trim();
  if (value.startsWith("<") && value.endsWith(">")) value = value.slice(1, -1);
  value = value.replace(/[?#].*$/, "").trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // 不是合法百分号编码时保留原值
  }
  value = value.trim();
  if (!value || /^(https?:|data:|blob:|file:)/i.test(value)) return null;
  return value;
}

export function extractImageRefs(body: string): ImageRef[] {
  const mask = codeMask(body);
  const refs: ImageRef[] = [];
  for (const match of body.matchAll(WIKILINK_EMBED)) {
    const start = match.index ?? 0;
    if (mask[start]) continue;
    const target = normalizeTarget(match[1].split("#")[0]);
    if (!target || mimeForPath(target) === null) continue;
    refs.push({ target, alt: target, start, end: start + match[0].length });
  }
  for (const match of body.matchAll(STANDARD_IMAGE)) {
    const start = match.index ?? 0;
    if (mask[start]) continue;
    const target = normalizeTarget(match[2]);
    if (!target || mimeForPath(target) === null) continue;
    refs.push({ target, alt: match[1], start, end: start + match[0].length });
  }
  refs.sort((a, b) => a.start - b.start);
  const ordered: ImageRef[] = [];
  let lastEnd = -1;
  for (const ref of refs) {
    if (ref.start < lastEnd) continue;
    ordered.push(ref);
    lastEnd = ref.end;
  }
  return ordered;
}

/** 倒序 splice，前面的偏移量始终有效。replacements 的值是整段替换文本。 */
export function rewriteImages(body: string, replacements: Map<string, string>): string {
  const refs = extractImageRefs(body);
  let out = body;
  for (let index = refs.length - 1; index >= 0; index -= 1) {
    const ref = refs[index];
    const replacement = replacements.get(ref.target);
    if (replacement === undefined) continue;
    out = out.slice(0, ref.start) + replacement + out.slice(ref.end);
  }
  return out;
}

export function imageMarkdown(alt: string, url: string): string {
  return `![${alt.replace(/[[\]]/g, "")}](${url})`;
}

export function makeSnippet(text: string, at: number, length: number): string {
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + length + 60);
  const flat = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${flat}${end < text.length ? "…" : ""}`;
}

/** React Native 没有 btoa polyfill，自己编码，不依赖平台全局。 */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64_ALPHABET[first >> 2];
    encoded += BASE64_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    encoded += second === undefined ? "=" : BASE64_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    encoded += third === undefined ? "=" : BASE64_ALPHABET[third & 63];
  }
  return `data:${mime};base64,${encoded}`;
}