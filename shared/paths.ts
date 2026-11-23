/**
 * server / client / smoke 三方共用的纯路径函数。不 import Node、React Native 或 SDK 运行时。
 * 路径一律是 vault 内相对路径（/ 分隔）。
 */

/** 相对路径 → 笔记标题（basename 去 .md）。 */
export function noteTitle(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}

/** 裸文件名索引键：小写 basename 去 .md。 */
export function basenameKey(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1).replace(/\.md$/i, "").toLowerCase();
}

/** 候选排序：同目录优先，其次路径段数少优先。 */
export function rankCandidate(noteRelDir: string, candidate: string): number {
  const sameDir = noteRelDir !== "." && candidate.startsWith(`${noteRelDir}/`);
  return (sameDir ? 0 : 100) + candidate.split("/").length;
}