import { Markdown, ScrollView, TextInput, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { NoteImage, NoteLink } from "../../shared/contracts";
import { findMatches, rewriteImages, splitSections } from "../../shared/markdown";
import { useInvalidateImages, useNote, useNoteImages, useRefreshNote } from "../data";
import { buildReplacements } from "../preview";
import { consumeAnchor, navigate } from "../store";
import { INDENT, type Styles } from "../styles";
import { Chip, IconButton, StatusBlock, formatTime } from "./bits";

const NO_IMAGES: NoteImage[] = [];

interface Pinned {
  title: string;
  content: string;
  images: NoteImage[];
  links: NoteLink[];
  mtimeMs: number;
}

export function NoteReaderColumn({
  vault,
  notePath,
  onBack,
  onHistoryBack,
  onHistoryForward,
  canBack,
  canForward,
  onExpandVault,
  onExpandList,
  styles,
}: {
  vault: string;
  notePath: string;
  onBack?: () => void;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  canBack: boolean;
  canForward: boolean;
  onExpandVault?: () => void;
  onExpandList?: () => void;
  styles: Styles;
}) {
  const note = useNote(vault, notePath);
  const refreshNote = useRefreshNote();
  const invalidateImages = useInvalidateImages();
  const toast = useToast();
  const latest = note.data?.ok ? note.data : null;
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [dismissedMtime, setDismissedMtime] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCursor, setFindCursor] = useState(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const sectionY = useRef(new Map<number, number>());
  const lastScroll = useRef<{ index: number; y: number } | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const dataUrls = useRef(new Map<string, string>());

  useEffect(() => {
    if (latest && pinned === null) {
      setPinned({
        title: latest.title,
        content: latest.content,
        images: latest.images,
        links: latest.links,
        mtimeMs: latest.mtimeMs,
      });
    }
  }, [latest, pinned]);

  const stale = latest !== null && pinned !== null && latest.mtimeMs !== pinned.mtimeMs && dismissedMtime !== latest.mtimeMs;
  const deleted = pinned !== null && note.data !== undefined && !note.data.ok && note.data.code === "not-found";

  const sections = useMemo(() => splitSections(pinned?.content ?? ""), [pinned]);
  const images = pinned?.images ?? NO_IMAGES;
  const imageQueries = useNoteImages(vault, images);
  const signature = imageQueries.map((query) => `${query.status}:${query.dataUpdatedAt}`).join("|");
  const replacements = useMemo(
    () => buildReplacements(images, imageQueries, vault, dataUrls.current),
    [images, signature, vault],
  );
  const sectionTexts = useMemo(
    () => sections.map((section) => rewriteImages(section.text, replacements)),
    [sections, replacements],
  );
  const matches = useMemo(
    () => sections.flatMap((section, index) => findMatches(section.text, findQuery).map(() => index)),
    [sections, findQuery],
  );

  function scrollToSection(index: number) {
    const y = sectionY.current.get(index);
    if (y === undefined) return;
    lastScroll.current = { index, y };
    scrollRef.current?.scrollTo({ y, animated: true });
  }

  function stepFind(delta: number) {
    if (matches.length === 0) return;
    const next = (findCursor + delta + matches.length) % matches.length;
    setFindCursor(next);
    scrollToSection(matches[next]);
  }

  // 链接锚点：y map 就绪后一次性消费；无匹配也清除，防残留日后误跳。
  useEffect(() => {
    const index = consumeAnchor(
      vault,
      notePath,
      sections.map((section) => section.heading?.text ?? null),
      (i) => sectionY.current.has(i),
    );
    if (index !== null && index >= 0) scrollToSection(index);
  }, [layoutTick, sections, vault, notePath]);

  function refresh() {
    if (latest) {
      setPinned({
        title: latest.title,
        content: latest.content,
        images: latest.images,
        links: latest.links,
        mtimeMs: latest.mtimeMs,
      });
    }
    setDismissedMtime(null);
    refreshNote(vault, notePath);
    invalidateImages(
      vault,
      [...(pinned?.images ?? []), ...(latest?.images ?? [])]
        .map((image) => image.path)
        .filter((imagePath): imagePath is string => imagePath !== null),
    );
  }

  async function copyPath() {
    try {
      await copyText(`${vault}/${notePath}`);
      toast.show("已复制绝对路径", { variant: "success" });
    } catch {
      toast.error("复制失败，请手动选择路径");
    }
  }

  const links = pinned?.links ?? [];
  const headings = sections
    .map((section, index) => ({ index, heading: section.heading }))
    .filter((entry): entry is { index: number; heading: { level: number; text: string } } => entry.heading !== null);

  return (
    <View style={styles.readerColumn}>
      <View style={styles.toolbar}>
        {onExpandVault ? (
          <IconButton label="展开 vault 栏" onPress={onExpandVault} icon="Folder" styles={styles} />
        ) : null}
        {onExpandList ? (
          <IconButton label="展开目录栏" onPress={onExpandList} icon="PanelLeftOpen" styles={styles} />
        ) : null}
        {onBack ? <IconButton label="返回笔记列表" onPress={onBack} text="返回" styles={styles} /> : null}
        <IconButton label="后退" onPress={onHistoryBack} disabled={!canBack} icon="ArrowLeft" styles={styles} />
        <IconButton label="前进" onPress={onHistoryForward} disabled={!canForward} icon="ArrowRight" styles={styles} />
        <Text style={styles.title} numberOfLines={2}>
          {pinned?.title ?? notePath.slice(notePath.lastIndexOf("/") + 1)}
        </Text>
      </View>
      <View style={styles.toolbar}>
        <IconButton label="复制笔记绝对路径" onPress={() => void copyPath()} text="复制路径" styles={styles} />
        <IconButton label="刷新笔记" onPress={refresh} text="刷新" styles={styles} />
        <Chip label="切换大纲" active={tocOpen} onPress={() => setTocOpen((open) => !open)} styles={styles}>
          大纲
        </Chip>
        <Chip label="切换链出笔记" active={linksOpen} onPress={() => setLinksOpen((open) => !open)} styles={styles}>
          链出 ({links.length})
        </Chip>
        {pinned ? <Text style={styles.small}>{formatTime(pinned.mtimeMs)}</Text> : null}
      </View>

      {stale ? (
        <View style={styles.banner}>
          <Text style={styles.muted}>笔记已被外部修改。</Text>
          <View style={styles.toolbar}>
            <IconButton label="加载外部修改" onPress={refresh} text="刷新" styles={styles} />
            <IconButton
              label="忽略本次外部修改"
              onPress={() => latest && setDismissedMtime(latest.mtimeMs)}
              text="忽略"
              styles={styles}
            />
          </View>
        </View>
      ) : null}
      {deleted ? (
        <View style={styles.banner}>
          <Text style={styles.error}>笔记已被外部删除。</Text>
          {onBack ? (
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.button}>
              <Text style={styles.buttonText}>返回列表</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {tocOpen ? (
        <ScrollView style={styles.panel}>
          {headings.length === 0 ? <Text style={styles.muted}>没有标题</Text> : null}
          {headings.map(({ index, heading }) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`跳到 ${heading.text}`}
              onPress={() => scrollToSection(index)}
              style={[styles.row, { paddingLeft: 8 + (heading.level - 1) * INDENT }]}
            >
              <Text style={styles.rowText} numberOfLines={1}>
                {heading.text}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {linksOpen ? (
        <ScrollView style={styles.panel}>
          {links.length === 0 ? <Text style={styles.muted}>没有链出笔记</Text> : null}
          {links.map((link, index) => (
            <Pressable
              key={`${link.ref}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`打开链出笔记 ${link.title}`}
              disabled={link.path === null}
              onPress={() => link.path !== null && navigate(vault, link.path, link.heading)}
              style={styles.row}
            >
              <Text style={[styles.rowText, link.path === null && styles.rowTextDisabled]} numberOfLines={1}>
                {link.title}
                {link.heading ? ` #${link.heading}` : ""}
              </Text>
              <Text style={styles.small}>
                {link.path === null ? "未解析到目标" : link.kind === "wikilink" ? "wikilink" : "markdown 链接"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.toolbar}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={findQuery}
          onChangeText={(value) => {
            setFindQuery(value);
            setFindCursor(0);
          }}
          placeholder="文内查找…"
          placeholderTextColor={styles.muted.color}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.small}>{findQuery ? `${matches.length === 0 ? 0 : findCursor + 1}/${matches.length}` : ""}</Text>
        <IconButton
          label="上一个匹配"
          onPress={() => stepFind(-1)}
          disabled={matches.length === 0}
          icon="ChevronUp"
          styles={styles}
        />
        <IconButton
          label="下一个匹配"
          onPress={() => stepFind(1)}
          disabled={matches.length === 0}
          icon="ChevronDown"
          styles={styles}
        />
      </View>

      {note.isPending && pinned === null ? <Text style={styles.muted}>加载中…</Text> : null}
      {note.isError && pinned === null ? (
        <StatusBlock error={note.error} onRetry={() => void note.refetch()} styles={styles} />
      ) : null}
      {note.data && !note.data.ok && pinned === null ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.error}>{note.data.message}</Text>
          {note.data.code === "vault-missing" ? <Text style={styles.muted}>请在设置里修正该 vault 路径。</Text> : null}
        </View>
      ) : null}

      {pinned ? (
        <ScrollView ref={scrollRef} style={styles.readerScroll} contentContainerStyle={styles.readerContent}>
          {sections.map((section, index) => (
            <View
              key={index}
              onLayout={(event) => {
                const y = event.nativeEvent.layout.y;
                const previous = sectionY.current.get(index);
                sectionY.current.set(index, y);
                if (previous === undefined || Math.abs(previous - y) > 8) {
                  setLayoutTick((tick) => tick + 1);
                  if (lastScroll.current?.index === index && Math.abs(lastScroll.current.y - y) > 8) {
                    lastScroll.current = { index, y };
                    scrollRef.current?.scrollTo({ y, animated: false });
                  }
                }
              }}
            >
              <Markdown>{sectionTexts[index] ?? ""}</Markdown>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}