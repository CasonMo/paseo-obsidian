import { Markdown, ScrollView, TextInput, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { NoteImage, NoteLink } from "../../shared/contracts";
import { findMatchSpans, makeSnippet, rewriteImages, splitSections } from "../../shared/markdown";
import { useInvalidateImages, useNote, useNoteImages, useRefreshNote } from "../data";
import { errorText, useT } from "../i18n";
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
  const t = useT();
  const latest = note.data?.ok ? note.data : null;
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [dismissedMtime, setDismissedMtime] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCursor, setFindCursor] = useState(0);
  const [findListOpen, setFindListOpen] = useState(false);
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
    () =>
      buildReplacements(images, imageQueries, vault, dataUrls.current, {
        // 占位符原样回填取模板串（SDK 要求有占位符必须传值）；真正的插值在 buildReplacements 内做。
        missing: t("preview.missing", { ref: "{{ref}}" }),
        tooLarge: t("preview.tooLarge", { mb: "{{mb}}", ref: "{{ref}}" }),
        tooMany: t("preview.tooMany", { n: "{{n}}", ref: "{{ref}}" }),
        loading: t("preview.loading"),
        failed: t("preview.failed", { ref: "{{ref}}" }),
      }),
    [images, signature, vault, t],
  );
  const sectionTexts = useMemo(
    () => sections.map((section) => rewriteImages(section.text, replacements)),
    [sections, replacements],
  );
  const matches = useMemo(
    () =>
      sections.flatMap((section, index) =>
        findMatchSpans(section.text, findQuery).map((span) => ({ section: index, at: span.at, length: span.length })),
      ),
    [sections, findQuery],
  );

  // sections 变化（refresh/外部改动）后 clamp cursor，防越界。
  useEffect(() => {
    setFindCursor((current) => Math.min(current, Math.max(0, matches.length - 1)));
  }, [matches.length]);

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
    scrollToSection(matches[next].section);
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
      toast.show(t("reader.copied"), { variant: "success" });
    } catch {
      toast.error(t("reader.copyFailed"));
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
          <IconButton label={t("vault.expand")} onPress={onExpandVault} icon="Folder" styles={styles} />
        ) : null}
        {onExpandList ? (
          <IconButton label={t("list.expand")} onPress={onExpandList} icon="PanelLeftOpen" styles={styles} />
        ) : null}
        {onBack ? <IconButton label={t("reader.backToListLabel")} onPress={onBack} text={t("common.back")} styles={styles} /> : null}
        <IconButton label={t("reader.historyBack")} onPress={onHistoryBack} disabled={!canBack} icon="ArrowLeft" styles={styles} />
        <IconButton label={t("reader.historyForward")} onPress={onHistoryForward} disabled={!canForward} icon="ArrowRight" styles={styles} />
        <Text style={styles.title} numberOfLines={2}>
          {pinned?.title ?? notePath.slice(notePath.lastIndexOf("/") + 1)}
        </Text>
      </View>
      <View style={styles.toolbar}>
        <IconButton label={t("reader.copyPathLabel")} onPress={() => void copyPath()} text={t("reader.copyPath")} styles={styles} />
        <IconButton label={t("reader.refreshLabel")} onPress={refresh} text={t("reader.refresh")} styles={styles} />
        <Chip label={t("reader.tocToggle")} active={tocOpen} onPress={() => setTocOpen((open) => !open)} styles={styles}>
          {t("reader.toc")}
        </Chip>
        <Chip label={t("reader.linksToggle")} active={linksOpen} onPress={() => setLinksOpen((open) => !open)} styles={styles}>
          {t("reader.links", { n: links.length })}
        </Chip>
        <Chip label={t("reader.matchesToggle")} active={findListOpen} onPress={() => setFindListOpen((open) => !open)} styles={styles}>
          {t("reader.matches", { n: matches.length })}
        </Chip>
        {pinned ? <Text style={styles.small}>{formatTime(pinned.mtimeMs)}</Text> : null}
      </View>

      {stale ? (
        <View style={styles.banner}>
          <Text style={styles.muted}>{t("reader.stale")}</Text>
          <View style={styles.toolbar}>
            <IconButton label={t("reader.loadExternal")} onPress={refresh} text={t("reader.refresh")} styles={styles} />
            <IconButton
              label={t("reader.dismissStale")}
              onPress={() => latest && setDismissedMtime(latest.mtimeMs)}
              text={t("reader.dismiss")}
              styles={styles}
            />
          </View>
        </View>
      ) : null}
      {deleted ? (
        <View style={styles.banner}>
          <Text style={styles.error}>{t("reader.deleted")}</Text>
          {onBack ? (
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.button}>
              <Text style={styles.buttonText}>{t("reader.backToList")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {tocOpen ? (
        <ScrollView style={styles.panel}>
          {headings.length === 0 ? <Text style={styles.muted}>{t("reader.noHeadings")}</Text> : null}
          {headings.map(({ index, heading }) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={t("reader.jumpToHeading", { heading: heading.text })}
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
          {links.length === 0 ? <Text style={styles.muted}>{t("reader.noLinks")}</Text> : null}
          {links.map((link, index) => (
            <Pressable
              key={`${link.ref}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={t("reader.openLinkLabel", { title: link.title })}
              disabled={link.path === null}
              onPress={() => link.path !== null && navigate(vault, link.path, link.heading)}
              style={styles.row}
            >
              <Text style={[styles.rowText, link.path === null && styles.rowTextDisabled]} numberOfLines={1}>
                {link.title}
                {link.heading ? ` #${link.heading}` : ""}
              </Text>
              <Text style={styles.small}>
                {link.path === null ? t("reader.linkUnresolved") : link.kind === "wikilink" ? t("reader.linkWikilink") : t("reader.linkMarkdown")}
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
          placeholder={t("reader.findPlaceholder")}
          placeholderTextColor={styles.muted.color}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.small}>{findQuery ? `${matches.length === 0 ? 0 : findCursor + 1}/${matches.length}` : ""}</Text>
        <IconButton
          label={t("reader.prevMatch")}
          onPress={() => stepFind(-1)}
          disabled={matches.length === 0}
          icon="ChevronUp"
          styles={styles}
        />
        <IconButton
          label={t("reader.nextMatch")}
          onPress={() => stepFind(1)}
          disabled={matches.length === 0}
          icon="ChevronDown"
          styles={styles}
        />
      </View>

      {findListOpen && findQuery ? (
        <ScrollView style={styles.panel}>
          {matches.length === 0 ? <Text style={styles.muted}>{t("reader.noMatches")}</Text> : null}
          {matches.map((match, index) => (
            <Pressable
              key={`${match.section}-${match.at}`}
              accessibilityRole="button"
              accessibilityLabel={t("reader.jumpToMatch", { n: index + 1 })}
              onPress={() => {
                setFindCursor(index);
                scrollToSection(match.section);
              }}
              style={[styles.row, index === findCursor && styles.rowActive]}
            >
              <Text style={styles.small} numberOfLines={1}>
                {sections[match.section].heading?.text ?? pinned?.title ?? ""}
              </Text>
              <Text style={styles.snippet}>{makeSnippet(sections[match.section].text, match.at, match.length)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {note.isPending && pinned === null ? <Text style={styles.muted}>{t("common.loading")}</Text> : null}
      {note.isError && pinned === null ? (
        <StatusBlock error={note.error} onRetry={() => void note.refetch()} styles={styles} />
      ) : null}
      {note.data && !note.data.ok && pinned === null ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.error}>{errorText(note.data.message, t)}</Text>
          {note.data.code === "vault-missing" ? <Text style={styles.muted}>{t("reader.fixVaultPath")}</Text> : null}
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