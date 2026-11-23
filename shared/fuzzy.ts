/** 文件名模糊打分与内容拆词匹配。纯函数，server/client/smoke 共用。 */

const BOUNDARY = /[/\-_. ]/;

/** 子串命中最高优先；否则贪心子序列（连续/词边界/开头加成，跳字扣分），凑不齐返回 null。 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return null;
  const substringAt = t.indexOf(q);
  if (substringAt >= 0) {
    return 1000 + Math.max(0, 40 - substringAt) + Math.max(0, 20 - (t.length - q.length));
  }
  let score = 0;
  let ti = 0;
  let previousMatch = -2;
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti;
        break;
      }
      ti += 1;
    }
    if (found < 0) return null;
    if (found === 0) score += 10;
    if (found === previousMatch + 1) score += 8;
    const before = found > 0 ? t[found - 1] : "";
    const original = text[found];
    const camel =
      found > 0 &&
      original !== original.toLowerCase() &&
      text[found - 1] === text[found - 1].toLowerCase();
    if (BOUNDARY.test(before) || camel) score += 6;
    if (found > previousMatch + 1) score -= 1;
    score += 1;
    previousMatch = found;
    ti = found + 1;
  }
  return score;
}

/** 内容匹配：query 拆词后全部子串命中（顺序无关、大小写不敏感）。返回最早命中位置供 snippet。 */
export function contentMatch(text: string, query: string): { at: number; length: number } | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const lower = text.toLowerCase();
  let first: { at: number; length: number } | null = null;
  for (const token of tokens) {
    const at = lower.indexOf(token);
    if (at < 0) return null;
    if (!first || at < first.at) first = { at, length: token.length };
  }
  return first;
}