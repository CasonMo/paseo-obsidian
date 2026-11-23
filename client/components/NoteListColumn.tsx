import { FlatList, Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList as RNFlatList, Platform, Pressable, Text, View } from "react-native";
import { LIST_CAP } from "../../shared/contracts";
import type { NoteSummary, SearchHit } from "../../shared/contracts";
import { useNotes, useSearch } from "../data";
import { errorText, useT } from "../i18n";
import { setUiState, useUiState } from "../store";
import { INDENT, type Styles } from "../styles";
import { buildTree, flattenTree, type TreeRow } from "../tree";
import { setHoverTitle } from "../web";
import { Chip, IconButton, IndentGuides, ListScroll, StatusBlock, formatTime, webHContent, webHScroll } from "./bits";

export function NoteListColumn({
  vault,
  selectedNote,
  onSelect,
  onOpenHit,
  onBack,
  onExpandVault,
  onCollapse,
  width,
  styles,
}: {
  vault: string;
  selectedNote: string | null;
  onSelect: (notePath: string) => void;
  onOpenHit: (vault: string, notePath: string) => void;
  onBack?: () => void;
  onExpandVault?: () => void;
  onCollapse?: () => void;
  width: number;
  styles: Styles;
}) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"vault" | "all">("all");
  const [mode, setMode] = useState<"tree" | "recent">("tree");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const t = useT();
  const { expanded: expandedByVault, searchHistory } = useUiState();
  const expanded = useMemo(() => new Set(expandedByVault[vault] ?? []), [expandedByVault, vault]);
  const notes = useNotes(vault, mode === "tree" ? 0 : LIST_CAP);
  const search = useSearch(scope, vault, query);
  const hitsRef = useRef<RNFlatList<SearchHit> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const searching = query !== "";
  const active = searching ? search : notes;
  const data = notes.data;
  const hits = search.data;
  const showTree = !searching && mode === "tree";
  const tree = useMemo(() => buildTree(data?.notes ?? []), [data]);
  const rows = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [hits, scope]);

  const hitTitles = useMemo(() => (hits?.hits ?? []).map((hit) => hit.title), [hits]);
  const treeTitles = useMemo(() => rows.map((row) => row.name), [rows]);
  const recentTitles = useMemo(() => (data?.notes ?? []).map((note) => note.title), [data]);

  // 有真实结果时记录搜索历史；placeholder 数据不算，队首相同跳过防写放大。
  useEffect(() => {
    if (!searching || search.isPlaceholderData || !hits || hits.total === 0) return;
    if (searchHistory[0] === query) return;
    setUiState({ searchHistory: [query, ...searchHistory.filter((item) => item !== query)].slice(0, 20) });
  }, [searching, query, hits, search.isPlaceholderData, searchHistory]);

  function toggleFolder(folderPath: string) {
    const next = new Set(expanded);
    if (next.has(folderPath)) next.delete(folderPath);
    else next.add(folderPath);
    setUiState({ expanded: { ...expandedByVault, [vault]: [...next] } });
  }

  function onSearchKeyPress(event: { nativeEvent: { key: string }; preventDefault?: () => void }) {
    const list = hits?.hits ?? [];
    if (list.length === 0) return;
    const key = event.nativeEvent.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault?.();
      setSelectedIndex((current) => {
        const next = Math.min(Math.max(current + (key === "ArrowDown" ? 1 : -1), 0), list.length - 1);
        hitsRef.current?.scrollToIndex({ index: next, animated: false });
        return next;
      });
    } else if (key === "Enter") {
      event.preventDefault?.();
      const hit = list[Math.min(selectedIndex, list.length - 1)];
      if (hit) onOpenHit(hit.vault, hit.path);
    }
  }

  return (
    <View style={[styles.listColumn, styles.listColumn.width !== undefined ? { width } : null]}>
      <View style={styles.toolbar}>
        {onExpandVault ? (
          <IconButton label={t("vault.expand")} onPress={onExpandVault} icon="PanelLeftOpen" styles={styles} />
        ) : null}
        {onCollapse ? (
          <IconButton label={t("list.collapse")} onPress={onCollapse} icon="PanelLeftClose" styles={styles} />
        ) : null}
        {onBack ? <IconButton label={t("list.backToVaults")} onPress={onBack} text={t("common.back")} styles={styles} /> : null}
        <Text style={[styles.heading, { flex: 1 }]} numberOfLines={1}>
          {vault.slice(vault.lastIndexOf("/") + 1)}
        </Text>
      </View>
      <View style={styles.toolbar}>
        <Chip label={t("list.scopeVaultLabel")} active={scope === "vault"} onPress={() => setScope("vault")} styles={styles}>
          {t("list.scopeVault")}
        </Chip>
        <Chip label={t("list.scopeAllLabel")} active={scope === "all"} onPress={() => setScope("all")} styles={styles}>
          {t("list.scopeAll")}
        </Chip>
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onKeyPress={Platform.OS === "web" ? onSearchKeyPress : undefined}
        placeholder={scope === "all" ? t("list.searchAllPlaceholder") : t("list.searchVaultPlaceholder")}
        placeholderTextColor={styles.muted.color}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching ? null : (
        <View style={styles.toolbar}>
          <Chip label={t("list.modeTreeLabel")} active={mode === "tree"} onPress={() => setMode("tree")} styles={styles}>
            {t("list.modeTree")}
          </Chip>
          <Chip label={t("list.modeRecentLabel")} active={mode === "recent"} onPress={() => setMode("recent")} styles={styles}>
            {t("list.modeRecent")}
          </Chip>
        </View>
      )}
      {!searching && searchHistory.length > 0 ? (
        <View style={styles.toolbar}>
          {searchHistory.slice(0, 5).map((item) => (
            <Chip key={item} label={t("list.historyLabel", { query: item })} active={false} onPress={() => setText(item)} styles={styles}>
              {item}
            </Chip>
          ))}
        </View>
      ) : null}
      {active.isPending ? <Text style={styles.muted}>{t("common.loading")}</Text> : null}
      {active.isError ? <StatusBlock error={active.error} onRetry={() => void active.refetch()} styles={styles} /> : null}
      {searching && hits?.problem ? <Text style={styles.error}>{errorText(hits.problem, t)}</Text> : null}
      {searching && hits && !hits.problem ? (
        <Text style={styles.small}>
          {t("list.hits", { count: hits.total, n: hits.total })}
          {hits.truncated ? t("list.hitsTruncated") : ""}
        </Text>
      ) : null}
      {!searching && data ? (
        <Text style={styles.small}>
          {t("list.total", { count: data.total, n: data.total })}
          {data.truncated ? t("list.totalTruncated") : ""}
        </Text>
      ) : null}
      {searching && hits && hits.hits.length === 0 ? <Text style={styles.muted}>{t("list.noHits")}</Text> : null}
      {!searching && data && data.notes.length === 0 ? (
        <Text style={styles.muted}>{t("list.empty")}</Text>
      ) : null}
      {searching ? (
        <ListScroll styles={styles} titles={hitTitles}>
        <FlatList
          ref={hitsRef}
          style={[styles.list, webHScroll]}
          contentContainerStyle={[styles.listContent, webHContent]}
          data={hits?.hits ?? []}
          keyExtractor={(item: SearchHit) => `${item.vault}/${item.path}`}
          onScrollToIndexFailed={({ index }) => {
            hitsRef.current?.scrollToOffset({ offset: index * 64, animated: false });
          }}
          renderItem={({ item, index }: { item: SearchHit; index: number }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("list.openHitLabel", { vault: item.vaultLabel, title: item.title })}
              onPress={() => onOpenHit(item.vault, item.path)}
              ref={(node) => setHoverTitle(node, item.title)}
              style={[styles.row, (selectedIndex === index || (vault === item.vault && selectedNote === item.path)) && styles.rowActive]}
            >
              <Text style={styles.small}>{item.vaultLabel}</Text>
              <Text style={styles.rowText} numberOfLines={1}>
                {item.title}
              </Text>
              {item.snippet ? <Text style={styles.snippet}>{item.snippet}</Text> : null}
            </Pressable>
          )}
        />
        </ListScroll>
      ) : showTree ? (
        <ListScroll styles={styles} titles={treeTitles}>
        <FlatList
          style={[styles.list, webHScroll]}
          contentContainerStyle={[styles.listContent, webHContent]}
          data={rows}
          keyExtractor={(item: TreeRow) => item.key}
          renderItem={({ item }: { item: TreeRow }) =>
            item.kind === "folder" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(item.expanded ? "list.collapseFolderLabel" : "list.expandFolderLabel", { name: item.name })}
                onPress={() => toggleFolder(item.path)}
                ref={(node) => setHoverTitle(node, item.name)}
                style={[styles.row, styles.folderRow, { paddingLeft: 10 + item.depth * INDENT }]}
              >
                <IndentGuides depth={item.depth} styles={styles} />
                <View style={styles.folderLine}>
                  <Icon name={item.expanded ? "ChevronDown" : "ChevronRight"} size={14} color={styles.muted.color} />
                  <Icon name="Folder" size={14} color={styles.muted.color} />
                  <Text style={[styles.rowText, { flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.small}>{item.count}</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("list.openNoteLabel", { name: item.name })}
                onPress={() => onSelect(item.path)}
                ref={(node) => setHoverTitle(node, item.name)}
                style={[
                  styles.row,
                  selectedNote === item.path && styles.rowActive,
                  { paddingLeft: 10 + item.depth * INDENT + 18 },
                ]}
              >
                <IndentGuides depth={item.depth} styles={styles} />
                <Text style={styles.rowText} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.note ? <Text style={styles.small}>{formatTime(item.note.mtimeMs)}</Text> : null}
              </Pressable>
            )
          }
        />
        </ListScroll>
      ) : (
        <ListScroll styles={styles} titles={recentTitles}>
        <FlatList
          style={[styles.list, webHScroll]}
          contentContainerStyle={[styles.listContent, webHContent]}
          data={data?.notes ?? []}
          keyExtractor={(item: NoteSummary) => item.path}
          renderItem={({ item }: { item: NoteSummary }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("list.openNoteLabel", { name: item.title })}
              onPress={() => onSelect(item.path)}
              ref={(node) => setHoverTitle(node, item.title)}
              style={[styles.row, selectedNote === item.path && styles.rowActive]}
            >
              <Text style={styles.rowText} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.small}>{formatTime(item.mtimeMs)}</Text>
            </Pressable>
          )}
        />
        </ListScroll>
      )}
    </View>
  );
}