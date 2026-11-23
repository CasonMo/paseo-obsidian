import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { clampWidth } from "../shared/contracts";
import { ColumnDivider, EmptyBlock, IconButton, type DragHandlers } from "./components/bits";
import { NoteListColumn } from "./components/NoteListColumn";
import { NoteReaderColumn } from "./components/NoteReaderColumn";
import { VaultColumn } from "./components/VaultColumn";
import { useVaults } from "./data";
import { useT } from "./i18n";
import { ObsidianSettingsScreen } from "./settings";
import { navigate, setUiState, useBrowsePersistence, useUiState } from "./store";
import { createStyles } from "./styles";

export function ObsidianScreen(props: PluginScreenProps) {
  const { theme, layout } = props;
  const t = useT();
  const compact = layout.compact;
  const styles = useMemo(() => createStyles(theme, compact), [theme, compact]);
  const { vault, notePath, vaultCollapsed, history, historyIndex, listCollapsed, vaultWidth, listWidth } = useUiState();
  const setVault = (value: string | null) => setUiState({ vault: value });
  const setNotePath = (value: string | null) => setUiState({ notePath: value });
  const setVaultCollapsed = (value: boolean) => setUiState({ vaultCollapsed: value });
  const [showSettings, setShowSettings] = useState(false);
  // 拖拽期间宽度只放实例 local state，pointerup 才 commit 到共享 store（避免每 move 全屏幕重渲染）。
  const [drag, setDrag] = useState<{ kind: "vault" | "list"; width: number } | null>(null);
  const dragRef = useRef<{ kind: "vault" | "list"; start: number } | null>(null);
  const dragWidthRef = useRef<number | null>(null);
  function dividerHandlers(kind: "vault" | "list"): DragHandlers {
    return {
      onStart: () => {
        dragRef.current = { kind, start: kind === "vault" ? vaultWidth : listWidth };
      },
      onDelta: (dx) => {
        const current = dragRef.current;
        if (!current) return;
        const width = clampWidth(kind, current.start + dx);
        dragWidthRef.current = width;
        setDrag({ kind, width });
      },
      onEnd: () => {
        const width = dragWidthRef.current;
        dragRef.current = null;
        dragWidthRef.current = null;
        setDrag(null);
        if (width !== null) setUiState(kind === "vault" ? { vaultWidth: width } : { listWidth: width });
      },
    };
  }
  const vaults = useVaults();
  const entries = vaults.data?.vaults ?? [];
  // entriesKey 是 entries 的稳定摘要，避免每次渲染都跑效应。
  const entriesKey = entries.map((entry) => `${entry.path}:${entry.exists}`).join("|");
  useBrowsePersistence({ entries, entriesKey, vaultsPending: vaults.isPending });

  function stepHistory(delta: number) {
    const alive = new Set(entries.filter((entry) => entry.exists).map((entry) => entry.path));
    let index = historyIndex;
    for (;;) {
      index += delta;
      if (index < 0 || index >= history.length) return;
      if (alive.has(history[index].vault)) break;
    }
    const entry = history[index];
    setUiState({ historyIndex: index, vault: entry.vault, notePath: entry.notePath });
  }

  if (showSettings) {
    return <ObsidianSettingsScreen {...props} onBack={() => setShowSettings(false)} />;
  }

  const openSettings = () => setShowSettings(true);
  const selectVault = (next: string) => {
    setVault(next);
    setNotePath(null);
  };
  const selectNote = (next: string) => {
    if (vault !== null) navigate(vault, next);
  };
  const openHit = (hitVault: string, hitPath: string) => navigate(hitVault, hitPath);
  const backToNotes = () => setNotePath(null);
  const backToVaults = () => setVault(null);

  if (!vaults.isPending && !vaults.isError && entries.length === 0) {
    return (
      <View style={[styles.screen, { flexDirection: "column" }]}>
        <EmptyBlock text={t("reader.noVaults")} styles={styles}>
          <Pressable accessibilityRole="button" onPress={openSettings} style={styles.button}>
            <Text style={styles.buttonText}>{t("reader.openSettings")}</Text>
          </Pressable>
        </EmptyBlock>
      </View>
    );
  }

  const vaultColumn = (
    <VaultColumn
      entries={entries}
      selected={vault}
      onSelect={selectVault}
      onOpenSettings={openSettings}
      onCollapse={compact ? undefined : () => setVaultCollapsed(true)}
      width={drag?.kind === "vault" ? drag.width : vaultWidth}
      styles={styles}
      isPending={vaults.isPending}
      isError={vaults.isError}
      error={vaults.error}
      onRetry={() => void vaults.refetch()}
    />
  );
  const readerProps = {
    onHistoryBack: () => stepHistory(-1),
    onHistoryForward: () => stepHistory(1),
    canBack: historyIndex > 0,
    canForward: historyIndex >= 0 && historyIndex < history.length - 1,
    onExpandVault: vaultCollapsed ? () => setVaultCollapsed(false) : undefined,
    onExpandList: listCollapsed ? () => setUiState({ listCollapsed: false }) : undefined,
  };
  const listVisible = vault !== null && !listCollapsed;

  if (compact) {
    if (vault !== null && notePath !== null) {
      return (
        <View style={styles.screen}>
          <NoteReaderColumn
            key={JSON.stringify([vault, notePath])}
            vault={vault}
            notePath={notePath}
            onBack={backToNotes}
            styles={styles}
            {...readerProps}
          />
        </View>
      );
    }
    if (vault !== null) {
      return (
        <View style={styles.screen}>
          <NoteListColumn
            vault={vault}
            selectedNote={notePath}
            onSelect={selectNote}
            onOpenHit={openHit}
            onBack={backToVaults}
            width={listWidth}
            styles={styles}
          />
        </View>
      );
    }
    return <View style={styles.screen}>{vaultColumn}</View>;
  }

  return (
    <View style={styles.screen}>
      {vaultCollapsed ? null : vaultColumn}
      {vaultCollapsed ? null : <ColumnDivider handlers={dividerHandlers("vault")} styles={styles} />}
      {listVisible ? (
        <NoteListColumn
          vault={vault}
          selectedNote={notePath}
          onSelect={selectNote}
          onOpenHit={openHit}
          onExpandVault={vaultCollapsed ? () => setVaultCollapsed(false) : undefined}
          onCollapse={() => setUiState({ listCollapsed: true })}
          width={drag?.kind === "list" ? drag.width : listWidth}
          styles={styles}
        />
      ) : null}
      {listVisible ? <ColumnDivider handlers={dividerHandlers("list")} styles={styles} /> : null}
      {vault !== null && notePath !== null ? (
        <NoteReaderColumn key={JSON.stringify([vault, notePath])} vault={vault} notePath={notePath} styles={styles} {...readerProps} />
      ) : (
        <View style={styles.readerColumn}>
          <View style={styles.toolbar}>
            {vaultCollapsed ? (
              <IconButton label={t("vault.expand")} onPress={() => setVaultCollapsed(false)} icon="Folder" styles={styles} />
            ) : null}
            {listCollapsed ? (
              <IconButton label={t("list.expand")} onPress={() => setUiState({ listCollapsed: false })} icon="PanelLeftOpen" styles={styles} />
            ) : null}
          </View>
          <EmptyBlock text={t("reader.pickNote")} styles={styles} />
        </View>
      )}
    </View>
  );
}