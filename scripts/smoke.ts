import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MAX_IMAGE_BYTES, clampWidth } from "../shared/contracts";
import type { ObsidianSettingsValues } from "../shared/contracts";
import { contentMatch, fuzzyScore } from "../shared/fuzzy";
import {
  bytesToDataUrl,
  extractImageRefs,
  extractInlineTags,
  extractLinkRefs,
  findMatches,
  imageMarkdown,
  mimeForPath,
  parseQueryTags,
  rewriteImages,
  splitSections,
  stripFrontmatter,
} from "../shared/markdown";
import { searchNotes } from "../server/search";
import { clearImageIndexCache, clearNotesCache } from "../server/cache";
import { listNotes, listVaults, readImage, readNote } from "../server/vault";
import { buildTree, flattenTree } from "../client/tree";

const here = __dirname;

function settings(vaultPaths: string[], autoDetect = false): ObsidianSettingsValues {
  return { vaultPaths, autoDetect };
}

async function testMarkdown(): Promise<void> {
  assert.deepEqual(stripFrontmatter("# 正文"), { title: null, tags: [], body: "# 正文" });
  assert.deepEqual(stripFrontmatter('---\ntitle: "排查手册"\ntags: [a]\n---\n# 正文'), {
    title: "排查手册",
    tags: ["a"],
    body: "# 正文",
  });
  assert.deepEqual(stripFrontmatter("---\ntags: [a]\n---\nbody"), { title: null, tags: ["a"], body: "body" });
  assert.deepEqual(stripFrontmatter("---\ntags:\n  - a\n  - b\n---\nbody").tags, ["a", "b"]);
  assert.deepEqual(stripFrontmatter("---\ntag: solo\n---\nbody").tags, ["solo"]);

  const body = [
    "![[Pasted image 2024.png|300]]",
    "![](images/a.png)",
    "![](<images/a b.png>)",
    "![](images/a%20b.png)",
    "![alt](https://example.com/x.png)",
    "![](data:image/png;base64,AAAA)",
    "![[note#^block]]",
  ].join("\n");
  const refs = extractImageRefs(body);
  assert.deepEqual(
    refs.map((ref) => ref.target),
    ["Pasted image 2024.png", "images/a.png", "images/a b.png", "images/a b.png"],
    "非图片 embed 不进图片管线",
  );
  assert.ok(refs.every((ref) => ref.end > ref.start));

  const replacements = new Map<string, string>([
    ["images/a.png", imageMarkdown("a", "data:image/png;base64,AAAA")],
    ["images/a b.png", "*[图片加载中…]*"],
  ]);
  const rewritten = rewriteImages(body, replacements);
  assert.ok(rewritten.includes("![a](data:image/png;base64,AAAA)"));
  assert.ok(!rewritten.includes("![](images/a.png)"));
  assert.ok(rewritten.includes("![alt](https://example.com/x.png)"), "远程图必须原样保留");
  assert.ok(rewritten.includes("![](data:image/png;base64,AAAA)"), "data URL 必须原样保留");
  assert.equal(rewritten.split("*[图片加载中…]*").length - 1, 2, "重复目标都要被替换");
  assert.equal(rewriteImages(body, new Map()), body, "空替换表不得改动原文");

  for (let length = 0; length < 700; length += 1) {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) bytes[index] = (index * 37 + length) % 256;
    assert.equal(
      bytesToDataUrl(bytes, "image/png"),
      `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
      `base64 长度 ${length}`,
    );
  }

  assert.equal(mimeForPath("a/b.PNG"), "image/png");
  assert.equal(mimeForPath("a/b.jpeg"), "image/jpeg");
  assert.equal(mimeForPath("a/b.md"), null);
}

async function testVault(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "obsidian-smoke-"));
  const outside = await mkdtemp(path.join(tmpdir(), "obsidian-outside-"));
  try {
    const vault = path.join(root, "vault");
    await mkdir(path.join(vault, "images"), { recursive: true });
    await mkdir(path.join(vault, "assets"), { recursive: true });
    await mkdir(path.join(vault, "nested"), { recursive: true });
    await mkdir(path.join(vault, ".obsidian"), { recursive: true });

    const png = Buffer.from("89504e470d0a1a0a", "hex");
    await writeFile(path.join(vault, "images/pic.png"), png);
    await writeFile(path.join(vault, "assets/shot.png"), png);
    await writeFile(path.join(vault, "big.png"), Buffer.alloc(MAX_IMAGE_BYTES + 1));
    await writeFile(path.join(outside, "secret.png"), png);
    await writeFile(path.join(outside, "outside.md"), "# 外部文件");

    await writeFile(
      path.join(vault, "笔记A.md"),
      [
        "---",
        "title: 排查手册 A",
        "---",
        "# 标题 A",
        "![](images/pic.png)",
        "![[shot.png]]",
        "![](big.png)",
        "![](missing.png)",
        "![](images/evil.png)",
        "[[nested/笔记B]]",
        "[相对](nested/笔记B.md)",
        "[[笔记B#标题 B]]",
        "[[missing-note]]",
        "[外部](https://example.com)",
        "`[[code-link]]`",
      ].join("\n"),
    );
    await writeFile(path.join(vault, "nested/笔记B.md"), "# 标题 B\n这里有一个 uniquekeyword 命中点。");
    await writeFile(path.join(vault, ".obsidian/config.json"), "{}");
    await writeFile(path.join(vault, ".hidden.md"), "# 隐藏");
    await symlink(path.join(outside, "outside.md"), path.join(vault, "escape.md"));
    await symlink(outside, path.join(vault, "linkdir"));
    await symlink(path.join(outside, "secret.png"), path.join(vault, "images/evil.png"));

    const config = settings([vault]);

    const vaults = await listVaults(config);
    assert.equal(vaults.length, 1);
    assert.equal(vaults[0].exists, true);
    assert.equal(vaults[0].label, "vault");
    assert.equal(vaults[0].source, "manual");

    const broken = await listVaults(settings([vault, path.join(root, "nope")]));
    assert.equal(broken.length, 2);
    assert.equal(broken[1].exists, false);
    assert.equal(broken[1].error, "路径不存在");

    const listed = await listNotes(vault, config, 0);
    const listedPaths = listed.notes.map((note) => note.path);
    assert.deepEqual(listedPaths.sort(), ["nested/笔记B.md", "笔记A.md"]);
    assert.equal(listed.total, 2);
    assert.equal(listed.truncated, false);

    const note = await readNote(vault, "笔记A.md", config);
    assert.equal(note.ok, true);
    if (!note.ok) return;
    assert.equal(note.title, "排查手册 A");
    assert.ok(!note.content.includes("---"), "frontmatter 必须被剥掉");
    const byRef = new Map(note.images.map((image) => [image.ref, image]));
    assert.equal(byRef.get("images/pic.png")?.path, "images/pic.png");
    assert.equal(byRef.get("shot.png")?.path, "assets/shot.png", "裸文件名要能全 vault 解析");
    assert.equal(byRef.get("big.png")?.problem, "too-large");
    assert.equal(byRef.get("missing.png")?.problem, "not-found");
    assert.equal(byRef.get("images/evil.png")?.problem, "not-found", "symlink 逃逸必须被拦");

    const byLinkRef = new Map(note.links.map((link) => [link.ref, link]));
    assert.equal(byLinkRef.get("[[nested/笔记B]]")?.path, "nested/笔记B.md");
    assert.equal(byLinkRef.get("[相对](nested/笔记B.md)")?.path, "nested/笔记B.md");
    assert.equal(byLinkRef.get("[[笔记B#标题 B]]")?.heading, "标题 B");
    assert.equal(byLinkRef.get("[[missing-note]]")?.path, null);
    assert.ok(!note.links.some((link) => link.ref.includes("example.com")), "外部链接不进链出面板");
    assert.ok(!note.links.some((link) => link.ref.includes("code-link")), "代码区 wikilink 不算链接");

    const bytes = await readImage(vault, "images/pic.png", config);
    assert.deepEqual(Buffer.from(bytes), png);

    const escapeRel = path.relative(vault, outside).split(path.sep).join("/");
    await assert.rejects(() => readImage(vault, "images/evil.png", config));
    await assert.rejects(() => readImage(vault, `${escapeRel}/secret.png`, config));

    for (const attempt of [`${escapeRel}/outside.md`, "/etc/passwd", "linkdir/outside.md"]) {
      const failure = await readNote(vault, attempt, config);
      assert.equal(failure.ok, false);
      if (failure.ok) continue;
      assert.equal(failure.code, "forbidden", `${attempt} 应判定为越界，实际 ${failure.code}`);
    }

    const unconfigured = await readNote(path.join(root, "nope"), "笔记A.md", config);
    assert.equal(unconfigured.ok, false);
    if (unconfigured.ok) return;
    assert.equal(unconfigured.code, "forbidden");

    const missing = await readNote(vault, "不存在.md", config);
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.code, "not-found");

    // 正向白名单：server 各模块的 node:fs/promises import 名必须 ⊆ 四个读 API。
    const readOnlyFs = new Set(["readdir", "stat", "realpath", "readFile"]);
    for (const file of ["vault.ts", "search.ts", "paths.ts", "cache.ts", "links.ts"]) {
      const source = await readFile(path.join(here, "../server", file), "utf8");
      for (const match of source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"node:fs\/promises"/g)) {
        for (const name of match[1].split(",").map((part) => part.trim()).filter(Boolean)) {
          assert.ok(readOnlyFs.has(name), `server/${file} 只允许读 API，发现 ${name}`);
        }
      }
      assert.ok(
        !/\b(writeFile|appendFile|mkdir|rename|rm|rmdir|unlink|createWriteStream|copyFile|chmod|utimes|truncate)\s*\(/.test(source),
        `server/${file} 必须保持只读`,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
}

async function testTree(): Promise<void> {
  const notes = [
    { path: "b/二.md", title: "二", mtimeMs: 2, sizeBytes: 1, snippet: null },
    { path: "a/一.md", title: "一", mtimeMs: 1, sizeBytes: 1, snippet: null },
    { path: "a/nested/三.md", title: "三", mtimeMs: 3, sizeBytes: 1, snippet: null },
    { path: "根.md", title: "根", mtimeMs: 4, sizeBytes: 1, snippet: null },
  ];
  const tree = buildTree(notes);
  assert.deepEqual(
    tree.map((node) => node.name),
    ["a", "b", "根"],
    "目录在前、笔记在后，各自按名字排序",
  );
  assert.equal(tree[0].count, 2);
  assert.deepEqual(
    tree[0].children.map((node) => node.name),
    ["nested", "一"],
  );

  const collapsed = flattenTree(tree, new Set());
  assert.deepEqual(
    collapsed.map((row) => row.key),
    ["folder:a", "folder:b", "note:根.md"],
  );

  const opened = flattenTree(tree, new Set(["a"]));
  assert.deepEqual(
    opened.map((row) => row.key),
    ["folder:a", "folder:a/nested", "note:a/一.md", "folder:b", "note:根.md"],
  );
  assert.equal(opened[1].depth, 1);

  const deep = flattenTree(tree, new Set(["a", "a/nested"]));
  assert.ok(deep.some((row) => row.key === "note:a/nested/三.md" && row.depth === 2));
}

async function testReading(): Promise<void> {
  const body = [
    "preamble",
    "# 一",
    "text [[笔记B]] and [相对](b.md)",
    "```",
    "# 不是 heading",
    "[[code]]",
    "```",
    "## 二",
    "tail #运维 #123 url http://x/#frag",
  ].join("\n");
  const sections = splitSections(body);
  assert.deepEqual(
    sections.map((section) => section.heading?.text ?? null),
    [null, "一", "二"],
  );
  assert.ok(sections[1].text.includes("# 不是 heading"), "围栏内 heading 不切段");
  assert.deepEqual(
    extractLinkRefs(body).map((link) => link.target),
    ["笔记B", "b.md"],
  );
  assert.deepEqual(findMatches("aXaXa", "a"), [0, 2, 4]);
  assert.deepEqual(findMatches("abc", ""), []);
  assert.deepEqual(extractInlineTags(body), ["运维"]);
  assert.deepEqual(parseQueryTags("#redis 连接池 tag:pool"), { tags: ["redis", "pool"], rest: "连接池" });
  assert.equal(clampWidth("vault", 10), 140);
  assert.equal(clampWidth("vault", 9999), 400);
  assert.equal(clampWidth("list", 10), 220);
  assert.equal(clampWidth("list", 9999), 560);
  assert.equal(clampWidth("vault", Number.NaN), 200);
  assert.equal(clampWidth("list", 300.4), 300);
}

async function testFuzzy(): Promise<void> {
  assert.notEqual(fuzzyScore("abc", "aXbXc"), null, "跳字子序列应命中");
  assert.equal(fuzzyScore("abc", "ab"), null, "凑不齐应返回 null");
  assert.equal(fuzzyScore("", "abc"), null);
  assert.ok((fuzzyScore("abc", "abc.md") ?? 0) > (fuzzyScore("abc", "a-b-c.md") ?? 0), "子串优先于子序列");
  assert.ok((fuzzyScore("abc", "xabc") ?? 0) > (fuzzyScore("abc", "a-b-c") ?? 0));
  assert.ok((fuzzyScore("fb", "foo-bar") ?? 0) > (fuzzyScore("fb", "fxxb") ?? 0), "词边界加成");
  assert.equal(fuzzyScore("ABC", "xxabcxx"), fuzzyScore("abc", "xxabcxx"), "大小写不敏感");
  assert.notEqual(fuzzyScore("排册", "排查手册"), null, "中文跳字");
  assert.ok((fuzzyScore("排查", "排查手册") ?? 0) > (fuzzyScore("排册", "排查手册") ?? 0), "中文子串优先");

  assert.notEqual(contentMatch("数据库 连接池 配置", "连接池 数据库"), null, "拆词乱序 AND");
  assert.equal(contentMatch("数据库 连接池", "连接池 缺词"), null, "缺词不中");
  assert.equal(contentMatch("abc", "   "), null);
}

async function testSearch(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "obsidian-search-"));
  try {
    const vault = path.join(root, "vault");
    const vault2 = path.join(root, "vault2");
    await mkdir(path.join(vault, "docs"), { recursive: true });
    await mkdir(vault2, { recursive: true });
    await writeFile(path.join(vault, "docs/redis-connection-pool.md"), "# Redis\n\n数据库 连接池 配置说明。\n");
    await writeFile(path.join(vault, "排查手册.md"), "# 排查\n\n生产 事故 处理流程。\n");
    await writeFile(path.join(vault2, "redis-other.md"), "# Other\n\n连接池 在另一个库。\n");
    await writeFile(path.join(vault, "tagged.md"), "---\ntags: [redis, pool]\n---\n# Tagged\n\n连接池 配置。 #运维 #123\n");
    await writeFile(path.join(vault2, "inline-tagged.md"), "# Inline\n\n#redis 另一个库。\n");
    const config = settings([vault, vault2]);
    clearNotesCache();

    const fuzzyName = await searchNotes("rcp", null, config);
    assert.ok(
      fuzzyName.hits.some((hit) => hit.path === "docs/redis-connection-pool.md" && hit.kind === "name"),
      "文件名跳字模糊应命中",
    );

    const sub = await searchNotes("redis", null, config);
    assert.equal(sub.hits[0].kind, "name");
    assert.equal(sub.total, 3);

    const content = await searchNotes("连接池 数据库", null, config);
    assert.equal(content.total, 1);
    assert.equal(content.hits[0].vault, vault);
    assert.equal(content.hits[0].kind, "content");
    assert.ok(content.hits[0].snippet?.includes("数据库"));

    assert.equal((await searchNotes("连接池 缺词xyz", null, config)).total, 0);

    const global = await searchNotes("连接池", null, config);
    assert.equal(global.total, 3);
    assert.deepEqual(global.hits.map((hit) => hit.vaultLabel).sort(), ["vault", "vault", "vault2"]);

    const scoped = await searchNotes("连接池", vault, config);
    assert.equal(scoped.total, 2);
    assert.ok(scoped.hits.every((hit) => hit.vault === vault));

    const zh = await searchNotes("排册", null, config);
    assert.ok(zh.hits.some((hit) => hit.path === "排查手册.md"));

    const tagOnly = await searchNotes("#redis", null, config);
    assert.equal(tagOnly.total, 2);
    assert.ok(tagOnly.hits.every((hit) => hit.kind === "tag"));
    assert.deepEqual(tagOnly.hits.map((hit) => hit.path).sort(), ["inline-tagged.md", "tagged.md"]);
    assert.equal((await searchNotes("tag:pool", null, config)).total, 1);
    const combo = await searchNotes("#redis 连接池", null, config);
    assert.equal(combo.total, 1);
    assert.equal(combo.hits[0].path, "tagged.md");
    assert.equal(combo.hits[0].kind, "content");
    assert.equal((await searchNotes("#123", null, config)).total, 0, "纯数字不是 tag");
    assert.equal((await searchNotes("#运维", null, config)).total, 1);

    for (let index = 0; index < 101; index += 1) {
      await writeFile(path.join(vault2, `cap-${index}.md`), "capword\n");
    }
    clearNotesCache();
    const capped = await searchNotes("capword", null, config);
    assert.equal(capped.hits.length, 100);
    assert.equal(capped.total, 101);
    assert.equal(capped.truncated, true);

    await rm(path.join(vault2, "cap-0.md"));
    clearNotesCache();
    assert.equal((await searchNotes("capword", null, config)).total, 100, "清缓存后应反映删除");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testRegressions(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "obsidian-regress-"));
  try {
    const vault = path.join(root, "vault");
    await mkdir(path.join(vault, "img"), { recursive: true });
    await writeFile(path.join(vault, "img/pic.png"), Buffer.from("89504e470d0a1a0a", "hex"));
    await writeFile(path.join(vault, "fm.md"), "---\ntags: [ops]\n---\n# FM\n\n前言。\n\n深处关键词命中点。\n");
    await writeFile(path.join(vault, "num.md"), "---\ntags: [123]\n---\n# Num\n\nbody\n");
    await writeFile(path.join(vault, "code.md"), "# Code\n\n```\n![](img/pic.png)\n![[pic.png]]\n```\n\n![](img/pic.png)\n");
    await writeFile(path.join(vault, "locked.md"), "# Locked\n\nbody\n");
    const config = settings([vault]);
    clearNotesCache();
    clearImageIndexCache();

    const hit = await searchNotes("深处关键词", null, config);
    assert.equal(hit.total, 1);
    assert.ok(hit.hits[0].snippet?.includes("深处关键词"));
    assert.ok(!hit.hits[0].snippet?.includes("tags:"), "snippet 不得混入 frontmatter");

    assert.equal((await searchNotes("#123", null, config)).total, 0, "frontmatter 纯数字 tag 排除");

    const codeNote = await readNote(vault, "code.md", config);
    assert.equal(codeNote.ok, true);
    if (codeNote.ok) {
      assert.equal(codeNote.images.length, 1, "代码区图片语法不进图片管线");
      assert.equal(codeNote.images[0].ref, "img/pic.png");
    }

    await chmod(path.join(vault, "locked.md"), 0o000);
    const locked = await readNote(vault, "locked.md", config);
    await chmod(path.join(vault, "locked.md"), 0o644);
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.code, "forbidden", "EACCES 不得误报 not-found/删除");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testMarkdown();
  await testVault();
  await testTree();
  await testReading();
  await testFuzzy();
  await testSearch();
  await testRegressions();
  console.log("smoke ok");
}

void main();