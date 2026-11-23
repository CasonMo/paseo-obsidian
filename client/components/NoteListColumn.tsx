import { FlatList, Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList as RNFlatList, Platform, Pressable, Text, View } from "react-native";
import { LIST_CAP } from "../../shared/contracts";
import type { NoteSummary, SearchHit } from "../../shared/contracts";
import { useNotes, useSearch } from "../data";
import { setUiState, useUiState } from "../store";
import { INDENT, type Styles } from "../styles";
import { buildTree, flattenTree, type TreeRow } from "../tree";
import { setHoverTitle } from "../web";
import { Chip, IconButton, IndentGuides, StatusBlock, formatTime, webHContent, webHScroll } from "./bits";

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
  const { expanded: expandedByVault } = useUiState();
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
          <IconButton label="展开 vault 栏" onPress={onExpandVault} icon="PanelLeftOpen" styles={styles} />
        ) : null}
        {onCollapse ? (
          <IconButton label="收起目录栏" onPress={onCollapse} icon="PanelLeftClose" styles={styles} />
        ) : null}
        {onBack ? <IconButton label="返回 vault 列表" onPress={onBack} text="返回" styles={styles} /> : null}
        <Text style={[styles.heading, { flex: 1 }]} numberOfLines={1}>
          {vault.slice(vault.lastIndexOf("/") + 1)}
        </Text>
      </View>
      <View style={styles.toolbar}>
        <Chip label="只搜本库" active={scope === "vault"} onPress={() => setScope("vault")} styles={styles}>
          本库
        </Chip>
        <Chip label="搜全部 vault" active={scope === "all"} onPress={() => setScope("all")} styles={styles}>
          全部
        </Chip>
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onKeyPress={Platform.OS === "web" ? onSearchKeyPress : undefined}
        placeholder={scope === "all" ? "全局模糊搜索 / #tag…" : "模糊搜索本库 / #tag…"}
        placeholderTextColor={styles.muted.color}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching ? null : (
        <View style={styles.toolbar}>
          <Chip label="按目录浏览" active={mode === "tree"} onPress={() => setMode("tree")} styles={styles}>
            目录
          </Chip>
          <Chip label="按修改时间浏览" active={mode === "recent"} onPress={() => setMode("recent")} styles={styles}>
            最近
          </Chip>
        </View>
      )}
      {active.isPending ? <Text style={styles.muted}>加载中…</Text> : null}
      {active.isError ? <StatusBlock error={active.error} onRetry={() => void active.refetch()} styles={styles} /> : null}
      {searching && hits ? (
        <Text style={styles.small}>
          命中 {hits.total} 篇{hits.truncated ? "（已截断，加词缩小范围）" : ""}
        </Text>
      ) : null}
      {!searching && data ? (
        <Text style={styles.small}>
          共 {data.total} 篇{data.truncated ? "（已截断，输入关键词缩小范围）" : ""}
        </Text>
      ) : null}
      {searching && hits && hits.hits.length === 0 ? <Text style={styles.muted}>无匹配笔记</Text> : null}
      {!searching && data && data.notes.length === 0 ? (
        <Text style={styles.muted}>这个 vault 里没有 markdown 笔记</Text>
      ) : null}
      {searching ? (
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
              accessibilityLabel={`打开 ${item.vaultLabel} 的笔记 ${item.title}`}
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
      ) : showTree ? (
        <FlatList
          style={[styles.list, webHScroll]}
          contentContainerStyle={[styles.listContent, webHContent]}
          data={rows}
          keyExtractor={(item: TreeRow) => item.key}
          renderItem={({ item }: { item: TreeRow }) =>
            item.kind === "folder" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.expanded ? "折叠" : "展开"}目录 ${item.name}`}
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
                accessibilityLabel={`打开笔记 ${item.name}`}
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
      ) : (
        <FlatList
          style={[styles.list, webHScroll]}
          contentContainerStyle={[styles.listContent, webHContent]}
          data={data?.notes ?? []}
          keyExtractor={(item: NoteSummary) => item.path}
          renderItem={({ item }: { item: NoteSummary }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`打开笔记 ${item.title}`}
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
      )}
    </View>
  );
}