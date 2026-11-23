import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  ScrollView,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { Pressable, Text, View } from "react-native";
import { obsidianSettings } from "../shared/contracts";
import type { ObsidianSettingsValues } from "../shared/contracts";
import { useInvalidateObsidian } from "./data";

const MAX_VAULT_PATHS = 20;

function createStyles(theme: PluginSurfaceProps["theme"]) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    page: { gap: 12, paddingBottom: 24 },
    inlineTitle: { fontSize: 15, fontWeight: "600", color: theme.colors.foreground },
    backButton: {
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: theme.colors.surface0,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    backText: { fontSize: 12, color: theme.colors.foreground },
    muted: { fontSize: 12, color: theme.colors.foregroundMuted },
    error: { fontSize: 12, color: theme.colors.statusDanger },
    pathText: { fontSize: 12, color: theme.colors.foreground, flexShrink: 1 },
    addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    input: {
      flex: 1,
      backgroundColor: theme.colors.surface2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.foreground,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 12,
    },
    footerRow: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
    button: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: theme.colors.surface0,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    buttonPrimary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { fontSize: 12, color: theme.colors.foreground },
    buttonTextPrimary: { color: theme.colors.accentForeground },
    dangerText: { fontSize: 12, color: theme.colors.statusDanger },
    dirtyText: { fontSize: 11, color: theme.colors.statusWarning },
  } satisfies Record<string, ViewStyle | TextStyle>;
}

/**
 * 两处使用：注册为设置页（Settings → Plugins → Obsidian 笔记，无 onBack），
 * 以及主屏幕内联打开（带 onBack，自己负责滚动）。
 */
export function ObsidianSettingsScreen({ theme, onBack }: PluginSurfaceProps & { onBack?: () => void }) {
  const settingsState = useSettings(obsidianSettings);
  const toast = useToast();
  const invalidate = useInvalidateObsidian();
  const [draft, setDraft] = useState<{ values: ObsidianSettingsValues; revision: string } | null>(null);
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (settingsState.status !== "ready") return;
    setDraft((current) => {
      if (current === null) return { values: settingsState.values, revision: settingsState.revision };
      if (current.revision === settingsState.revision) return current;
      const sameValues = JSON.stringify(current.values) === JSON.stringify(settingsState.values);
      if (sameValues) return { values: settingsState.values, revision: settingsState.revision };
      return current;
    });
  }, [settingsState]);

  if (settingsState.status === "loading") {
    return (
      <View style={styles.page}>
        <Text style={styles.muted}>加载设置中…</Text>
      </View>
    );
  }

  if (settingsState.status === "error") {
    return (
      <View style={styles.page}>
        <Text style={styles.error}>设置读取失败：{settingsState.error}</Text>
        <Pressable accessibilityRole="button" onPress={() => void settingsState.reload()} style={styles.button}>
          <Text style={styles.buttonText}>重新加载</Text>
        </Pressable>
      </View>
    );
  }

  if (settingsState.status === "invalid") {
    return (
      <View style={styles.page}>
        <Text style={styles.error}>已保存的设置无法解析：{settingsState.error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void settingsState.reset().then((ok) => {
              setDraft(null);
              toast.show(ok ? "已恢复默认设置" : "恢复失败", { variant: ok ? "success" : "error" });
            });
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>恢复默认</Text>
        </Pressable>
      </View>
    );
  }

  const values = draft?.values ?? settingsState.values;
  const dirty = draft !== null && JSON.stringify(draft.values) !== JSON.stringify(settingsState.values);

  function patch(partial: Partial<ObsidianSettingsValues>) {
    setDraft((current) => (current ? { ...current, values: { ...current.values, ...partial } } : current));
  }

  function addPath() {
    const value = newPath.trim();
    if (!value) {
      toast.error("路径不能为空");
      return;
    }
    if (values.vaultPaths.includes(value)) {
      toast.error("该路径已存在");
      return;
    }
    if (values.vaultPaths.length >= MAX_VAULT_PATHS) {
      toast.error(`最多 ${MAX_VAULT_PATHS} 条路径`);
      return;
    }
    patch({ vaultPaths: [...values.vaultPaths, value] });
    setNewPath("");
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    const ok = await settingsState.save(draft.values, draft.revision);
    setSaving(false);
    if (ok) {
      toast.show("已保存", { variant: "success" });
      setDraft(null);
      invalidate();
    } else {
      toast.error(settingsState.saveError ?? "保存失败");
    }
  }

  const sections = (
    <View style={styles.page}>
      <SettingsSection title="Vault 路径" info="每台机器各自保存自己的路径。支持绝对路径或 ~/ 开头。">
        <SettingsCard>
          {values.vaultPaths.length === 0 ? (
            <SettingsRow label="还没有手工路径" hint="可以只靠下面的自动发现，或在下面添加同步目录。" />
          ) : (
            values.vaultPaths.map((vaultPath, index) => (
              <SettingsRow key={vaultPath} label={vaultPath}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除 ${vaultPath}`}
                  onPress={() => patch({ vaultPaths: values.vaultPaths.filter((_, position) => position !== index) })}
                  style={styles.button}
                >
                  <Text style={styles.dangerText}>删除</Text>
                </Pressable>
              </SettingsRow>
            ))
          )}
          <SettingsRow label="添加路径">
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={newPath}
                onChangeText={setNewPath}
                placeholder="/path/to/vault"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable accessibilityRole="button" onPress={addPath} style={styles.button}>
                <Text style={styles.buttonText}>添加</Text>
              </Pressable>
            </View>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="自动发现">
        <SettingsCard>
          <SettingsSwitch
            label="读本机 Obsidian 注册表"
            hint="自动列出 Obsidian 记录过的 vault。服务器没装 Obsidian 时为空，不影响手工路径。"
            value={values.autoDetect}
            onValueChange={(value) => patch({ autoDetect: value })}
          />
        </SettingsCard>
      </SettingsSection>

      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void save()}
          disabled={saving || !dirty}
          style={[styles.button, styles.buttonPrimary, (saving || !dirty) && styles.buttonDisabled]}
        >
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{saving ? "保存中…" : "保存"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraft(null);
            void settingsState.reload();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>重新加载</Text>
        </Pressable>
        {dirty ? <Text style={styles.dirtyText}>有未保存的修改</Text> : null}
      </View>
    </View>
  );

  if (onBack) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.inlineTitle}>Obsidian 设置</Text>
        {sections}
      </ScrollView>
    );
  }

  return sections;
}