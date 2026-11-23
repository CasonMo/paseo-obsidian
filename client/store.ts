import { useSettings } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clampWidth, obsidianUiSettings } from "../shared/contracts";
import type { VaultEntry } from "../shared/contracts";

export interface HistoryEntry {
  vault: string;
  notePath: string;
}

/**
 * 浏览状态放模块级：host 会保留旧屏幕实例不卸载，实例级 state 会让隐藏实例
 * 拿着旧状态与可见实例互相覆盖写（ping-pong）。共享 store 保证所有实例意图一致。
 * 历史栈只记「打开笔记」，不持久化。
 */
export interface UiState {
  vault: string | null;
  notePath: string | null;
  vaultCollapsed: boolean;
  expanded: Record<string, string[]>;
  history: HistoryEntry[];
  historyIndex: number;
  listCollapsed: boolean;
  vaultWidth: number;
  listWidth: number;
  searchHistory: string[];
  communityDismissed: boolean;
}

let uiState: UiState = {
  vault: null,
  notePath: null,
  vaultCollapsed: false,
  expanded: {},
  history: [],
  historyIndex: -1,
  listCollapsed: false,
  vaultWidth: 200,
  listWidth: 320,
  searchHistory: [],
  communityDismissed: false,
};
let uiRestored = false;
let uiAutoSelected = false;
let pendingAnchor: { vault: string; notePath: string; heading: string } | null = null;
const uiListeners = new Set<() => void>();

export function setUiState(patch: Partial<UiState>) {
  uiState = { ...uiState, ...patch };
  for (const listener of uiListeners) listener();
}

function subscribeUi(listener: () => void) {
  uiListeners.add(listener);
  return () => {
    uiListeners.delete(listener);
  };
}

export function useUiState(): UiState {
  return useSyncExternalStore(subscribeUi, () => uiState);
}

export function navigate(vault: string, notePath: string, heading?: string | null) {
  const current = uiState.history[uiState.historyIndex];
  if (!current || current.vault !== vault || current.notePath !== notePath) {
    const history = [...uiState.history.slice(0, uiState.historyIndex + 1), { vault, notePath }].slice(-50);
    setUiState({ history, historyIndex: history.length - 1, vault, notePath });
  } else {
    setUiState({ vault, notePath });
  }
  if (heading) pendingAnchor = { vault, notePath, heading };
}

/**
 * 链接锚点一次性消费：匹配 vault/notePath 时，目标段 y 未就绪返回 null 等待（不清除）；
 * 就绪则清除并返回段索引；无匹配 heading 也清除（返回 -1），防残留日后误跳。
 */
export function consumeAnchor(
  vault: string,
  notePath: string,
  headings: (string | null)[],
  isReady: (index: number) => boolean,
): number | null {
  if (!pendingAnchor || pendingAnchor.vault !== vault || pendingAnchor.notePath !== notePath) return null;
  const index = headings.indexOf(pendingAnchor.heading);
  if (index >= 0 && !isReady(index)) return null;
  pendingAnchor = null;
  return index;
}

/** 浏览状态持久化：一次性恢复、无记忆时自动选 vault、失效回落、历史栈 prune、防抖串行写回。 */
export function useBrowsePersistence(opts: { entries: VaultEntry[]; entriesKey: string; vaultsPending: boolean }) {
  const { entries, entriesKey, vaultsPending } = opts;
  const { vault, notePath, vaultCollapsed, expanded, history, listCollapsed, vaultWidth, listWidth, searchHistory, communityDismissed } = useUiState();
  const setVault = (value: string | null) => setUiState({ vault: value });
  const setNotePath = (value: string | null) => setUiState({ notePath: value });
  const ui = useSettings(obsidianUiSettings);
  const [restored, setRestored] = useState(uiRestored);
  const firstUsable = entries.find((entry) => entry.exists)?.path ?? null;

  // 进屏幕时一次性恢复上次的浏览状态；恢复完成前禁止自动选择覆盖记忆。
  useEffect(() => {
    if (uiRestored || ui.status === "loading") return;
    const values =
      ui.status === "ready"
        ? ui.values
        : { vault: null, notePath: null, vaultCollapsed: false, expanded: {}, listCollapsed: false, vaultWidth: 200, listWidth: 320, searchHistory: [], communityDismissed: false };
    const history = values.vault !== null && values.notePath !== null ? [{ vault: values.vault, notePath: values.notePath }] : [];
    setUiState({
      vault: values.vault,
      notePath: values.notePath,
      vaultCollapsed: values.vaultCollapsed,
      expanded: values.expanded,
      listCollapsed: values.listCollapsed,
      vaultWidth: clampWidth("vault", values.vaultWidth),
      listWidth: clampWidth("list", values.listWidth),
      searchHistory: values.searchHistory,
      communityDismissed: values.communityDismissed,
      history,
      historyIndex: history.length - 1,
    });
    uiRestored = true;
    if (values.vault !== null) uiAutoSelected = true;
    setRestored(true);
  }, [restored, ui]);

  // 只在没有记忆时自动选一个 vault；否则 compact 返回 vault 列表会被立刻弹回笔记列表。
  useEffect(() => {
    if (!restored || uiAutoSelected || firstUsable === null) return;
    uiAutoSelected = true;
    setVault(firstUsable);
  }, [restored, firstUsable]);

  // 设置改动让已选 vault 失效时回落到第一个可用 vault，避免阅读区 stranded。
  useEffect(() => {
    if (!restored || vault === null || vaultsPending) return;
    if (entriesKey.split("|").includes(`${vault}:true`)) return;
    if (firstUsable !== null) {
      setVault(firstUsable);
      setNotePath(null);
    }
    // entriesKey 是 entries 的稳定摘要，避免每次渲染都跑效应。
  }, [restored, vault, entriesKey, firstUsable, vaultsPending]);

  // 历史栈 prune 死 vault，避免 back/forward 落到已移除的库。
  useEffect(() => {
    if (!restored || vaultsPending) return;
    const alive = new Set(entries.filter((entry) => entry.exists).map((entry) => entry.path));
    const pruned = history.filter((entry) => alive.has(entry.vault));
    if (pruned.length === history.length) return;
    const currentKey = JSON.stringify([vault, notePath]);
    let index = pruned.findIndex((entry) => JSON.stringify([entry.vault, entry.notePath]) === currentKey);
    if (index < 0) index = pruned.length - 1;
    setUiState({ history: pruned, historyIndex: index });
  }, [restored, entriesKey, vaultsPending, history, vault, notePath]);

  // 浏览状态变化时写回 device 级设置。防抖合并连续变化，且在途串行：
  // 并发 save 会撞 revision，失败后 reload 拿新 revision 再由效应重试。
  // deps 用序列化字符串：ui 对象与 values 的对象身份每渲染都变，会把防抖 timer 饿死。
  // 历史栈不进 device 文档。
  const uiSaveInFlight = useRef(false);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const uiReady = ui.status === "ready" ? ui : null;
  const uiValuesKey = JSON.stringify(uiReady?.values ?? null);
  const uiRevision = uiReady?.revision ?? "";
  useEffect(() => {
    if (!restored || uiReady === null) return;
    const next = { vault, notePath, vaultCollapsed, expanded, listCollapsed, vaultWidth, listWidth, searchHistory, communityDismissed };
    if (JSON.stringify(next) === uiValuesKey) return;
    const timer = setTimeout(() => {
      const current = uiRef.current;
      if (current.status !== "ready" || uiSaveInFlight.current) return;
      if (JSON.stringify(next) === JSON.stringify(current.values)) return;
      uiSaveInFlight.current = true;
      void current.save(next, current.revision).then((ok) => {
        uiSaveInFlight.current = false;
        if (!ok) void uiRef.current.reload();
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [restored, ui.status, uiValuesKey, uiRevision, vault, notePath, vaultCollapsed, expanded, listCollapsed, vaultWidth, listWidth, searchHistory, communityDismissed]);
}