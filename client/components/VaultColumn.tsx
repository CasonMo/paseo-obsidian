import { ScrollView } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { VaultEntry } from "../../shared/contracts";
import { errorText, useT } from "../i18n";
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
  const t = useT();
  return (
    <View style={[styles.column, styles.column.width !== undefined ? { width } : null]}>
      <View style={styles.toolbar}>
        <Text style={[styles.heading, { flex: 1 }]}>{t("vault.heading")}</Text>
        {onCollapse ? (
          <IconButton label={t("vault.collapse")} onPress={onCollapse} icon="PanelLeftClose" styles={styles} />
        ) : null}
        <IconButton label={t("vault.openSettings")} onPress={onOpenSettings} text={t("vault.settings")} styles={styles} />
      </View>
      {isPending ? <Text style={styles.muted}>{t("common.loading")}</Text> : null}
      {isError ? <StatusBlock error={error} onRetry={onRetry} styles={styles} /> : null}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {entries.map((entry) => (
          <Pressable
            key={entry.path}
            accessibilityRole="button"
            accessibilityLabel={t("vault.selectLabel", { label: entry.label })}
            disabled={!entry.exists}
            onPress={() => onSelect(entry.path)}
            style={[styles.row, selected === entry.path && styles.rowActive]}
          >
            <Text style={[styles.rowText, !entry.exists && styles.rowTextDisabled]}>{entry.label}</Text>
            <Text style={styles.small}>{entry.source === "manual" ? t("vault.manual") : t("vault.auto")}</Text>
            {entry.exists ? null : (
              <Text style={styles.error}>{entry.error === null ? t("vault.unavailable") : errorText(entry.error, t)}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}