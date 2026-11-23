import { MAX_IMAGES_PER_NOTE, MAX_IMAGE_BYTES } from "../shared/contracts";
import type { NoteImage } from "../shared/contracts";
import { bytesToDataUrl, imageMarkdown, mimeForPath } from "../shared/markdown";

export interface ImageQueryState {
  data?: Uint8Array;
  isError?: boolean;
  dataUpdatedAt?: number;
}

/** 占位文案模板（调用方 t() 好后传入），内含 {{ref}}/{{mb}}/{{n}} 占位符。 */
export interface PreviewLabels {
  missing: string;
  tooLarge: string;
  tooMany: string;
  loading: string;
  failed: string;
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""));

/** 全篇一次构建 ref→替换文本；各段再 rewriteImages，只替换本段出现的 ref。 */
export function buildReplacements(
  images: NoteImage[],
  imageQueries: ImageQueryState[],
  vault: string,
  dataUrls: Map<string, string>,
  labels: PreviewLabels,
): Map<string, string> {
  const replacements = new Map<string, string>();
  let position = 0;
  for (const image of images) {
    if (image.problem === "not-found") {
      replacements.set(image.ref, fill(labels.missing, { ref: image.ref }));
      continue;
    }
    if (image.problem === "too-large") {
      replacements.set(image.ref, fill(labels.tooLarge, { mb: MAX_IMAGE_BYTES / 1024 / 1024, ref: image.ref }));
      continue;
    }
    if (image.problem === "too-many") {
      replacements.set(image.ref, fill(labels.tooMany, { n: MAX_IMAGES_PER_NOTE, ref: image.ref }));
      continue;
    }
    const query = imageQueries[position];
    position += 1;
    if (image.path === null) {
      replacements.set(image.ref, labels.loading);
      continue;
    }
    // 键含版本：invalidate 后新字节到达不得命中旧 dataURL。
    const key = JSON.stringify([vault, image.path, query?.dataUpdatedAt ?? 0]);
    if (query?.data) {
      let url = dataUrls.get(key);
      if (!url) {
        url = bytesToDataUrl(query.data, mimeForPath(image.path) ?? "image/png");
        dataUrls.set(key, url);
      }
      replacements.set(image.ref, imageMarkdown(image.ref, url));
    } else if (query?.isError) {
      replacements.set(image.ref, fill(labels.failed, { ref: image.ref }));
    } else {
      replacements.set(image.ref, labels.loading);
    }
  }
  // 只保留当前笔记的图片缓存，防 Map 无界增长（移动端内存）。
  const livePaths = new Set(images.filter((image) => image.path !== null).map((image) => image.path as string));
  for (const key of [...dataUrls.keys()]) {
    const [cachedVault, cachedPath] = JSON.parse(key) as [string, string, number];
    if (cachedVault !== vault || !livePaths.has(cachedPath)) dataUrls.delete(key);
  }
  return replacements;
}