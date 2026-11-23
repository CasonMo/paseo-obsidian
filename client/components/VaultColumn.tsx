import { ScrollView } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { VaultEntry } from "../../shared/contracts";
import type { Styles } from "../styles";
import { IconButton, StatusBlock } from "./bits";

export function VaultColumn({
  entries,
  selected,
  onSelect,
  onOpenSettings,
  onCollapse,
  width,
  styles,
  isPending,
  isError,
  error,
  onRetry,
}: {
  entries: VaultEntry[];
  selected: string | null;
  onSelect: (vault: string) => void;
  onOpenSettings: () => void;
  onCollapse?: () => void;
  width: number;
  styles: Styles;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <View style={[styles.column, styles.column.width !== undefined ? { width } : null]}>
      <View style={styles.toolbar}>
        <Text style={[styles.heading, { flex: 1 }]}>Vault</Text>
        {onCollapse ? (
          <IconButton label="收起 vault 栏" onPress={onCollapse} icon="PanelLeftClose" styles={styles} />
        ) : null}
        <IconButton label="打开 Obsidian 设置" onPress={onOpenSettings} text="设置" styles={styles} />
      </View>
      {isPending ? <Text style={styles.muted}>加载中…</Text> : null}
      {isError ? <StatusBlock error={error} onRetry={onRetry} styles={styles} /> : null}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {entries.map((entry) => (
          <Pressable
            key={entry.path}
            accessibilityRole="button"
            accessibilityLabel={`选择 vault ${entry.label}`}
            disabled={!entry.exists}
            onPress={() => onSelect(entry.path)}
            style={[styles.row, selected === entry.path && styles.rowActive]}
          >
            <Text style={[styles.rowText, !entry.exists && styles.rowTextDisabled]}>{entry.label}</Text>
            <Text style={styles.small}>{entry.source === "manual" ? "手工路径" : "Obsidian 自动发现"}</Text>
            {entry.exists ? null : <Text style={styles.error}>{entry.error ?? "不可用"}</Text>}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}