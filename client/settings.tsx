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
import { errorText, useT } from "./i18n";

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
  const t = useT();
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
        <Text style={styles.muted}>{t("settings.loading")}</Text>
      </View>
    );
  }

  if (settingsState.status === "error") {
    return (
      <View style={styles.page}>
        <Text style={styles.error}>{t("settings.loadFailed", { message: errorText(settingsState.error, t) })}</Text>
        <Pressable accessibilityRole="button" onPress={() => void settingsState.reload()} style={styles.button}>
          <Text style={styles.buttonText}>{t("settings.reload")}</Text>
        </Pressable>
      </View>
    );
  }

  if (settingsState.status === "invalid") {
    return (
      <View style={styles.page}>
        <Text style={styles.error}>{t("settings.invalid", { message: errorText(settingsState.error, t) })}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void settingsState.reset().then((ok) => {
              setDraft(null);
              toast.show(ok ? t("settings.resetOk") : t("settings.resetFailed"), { variant: ok ? "success" : "error" });
            });
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{t("settings.reset")}</Text>
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
      toast.error(t("settings.pathEmpty"));
      return;
    }
    if (values.vaultPaths.includes(value)) {
      toast.error(t("settings.pathDuplicate"));
      return;
    }
    if (values.vaultPaths.length >= MAX_VAULT_PATHS) {
      toast.error(t("settings.pathLimit", { n: MAX_VAULT_PATHS }));
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
      toast.show(t("settings.saved"), { variant: "success" });
      setDraft(null);
      invalidate();
    } else {
      toast.error(settingsState.saveError === null ? t("settings.saveFailed") : errorText(settingsState.saveError, t));
    }
  }

  const sections = (
    <View style={styles.page}>
      <SettingsSection title={t("settings.pathsTitle")} info={t("settings.pathsInfo")}>
        <SettingsCard>
          {values.vaultPaths.length === 0 ? (
            <SettingsRow label={t("settings.noPaths")} hint={t("settings.noPathsHint")} />
          ) : (
            values.vaultPaths.map((vaultPath, index) => (
              <SettingsRow key={vaultPath} label={vaultPath}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.removePathLabel", { path: vaultPath })}
                  onPress={() => patch({ vaultPaths: values.vaultPaths.filter((_, position) => position !== index) })}
                  style={styles.button}
                >
                  <Text style={styles.dangerText}>{t("settings.remove")}</Text>
                </Pressable>
              </SettingsRow>
            ))
          )}
          <SettingsRow label={t("settings.addPath")}>
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
                <Text style={styles.buttonText}>{t("settings.add")}</Text>
              </Pressable>
            </View>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.autoTitle")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.autoLabel")}
            hint={t("settings.autoHint")}
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
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{saving ? t("settings.saving") : t("settings.save")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraft(null);
            void settingsState.reload();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{t("settings.reload")}</Text>
        </Pressable>
        {dirty ? <Text style={styles.dirtyText}>{t("settings.dirty")}</Text> : null}
      </View>
    </View>
  );

  if (onBack) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.inlineTitle}>{t("settings.title")}</Text>
        {sections}
      </ScrollView>
    );
  }

  return sections;
}