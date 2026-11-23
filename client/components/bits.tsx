import { openExternalUrl } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ViewStyle } from "react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { INDENT, type Styles } from "../styles";
import { errorText, useT } from "../i18n";
import { attachResizeHandle } from "../web";

export function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 工具栏小按钮：icon 与 text 二选一；disabled 时半透明。 */
export function IconButton({
  label,
  onPress,
  disabled,
  icon,
  text,
  styles,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: string;
  text?: string;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      {icon !== undefined ? <Icon name={icon} size={14} color={styles.muted.color} /> : <Text style={styles.buttonText}>{text}</Text>}
    </Pressable>
  );
}

/** 胶囊切换：label 是无障碍文案，children 是可见文字。 */
export function Chip({
  label,
  active,
  onPress,
  styles,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: Styles;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{children}</Text>
    </Pressable>
  );
}

export function StatusBlock({ error, onRetry, styles }: { error: unknown; onRetry: () => void; styles: Styles }) {
  const t = useT();
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.error}>{t("common.readFailed", { message: errorText(error, t) })}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>{t("common.retry")}</Text>
      </Pressable>
    </View>
  );
}

export function EmptyBlock({ text, children, styles }: { text: string; children?: ReactNode; styles: Styles }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

const ISSUE_URL = "https://github.com/CasonMo/paseo-obsidian/issues/new";
const PULL_REQUEST_URL = "https://github.com/CasonMo/paseo-obsidian/pulls";

/** 开源共创展示条：提 Issue / 提 PR / 关闭；关闭状态由调用方写入 device 级 store。 */
export function CommunityBanner({ styles, onDismiss }: { styles: Styles; onDismiss: () => void }) {
  const t = useT();
  const open = (url: string) => {
    void openExternalUrl(url).catch((error) => {
      console.error("Failed to open community link", error);
    });
  };
  return (
    <View style={styles.communityBanner}>
      <View style={styles.communityBody}>
        <Icon name="Sparkles" size={15} color={styles.communityTitle.color} />
        <Text style={styles.communityText}>
          <Text style={styles.communityTitle}>{t("community.title")}</Text>
          {` · ${t("community.hint")}`}
        </Text>
      </View>
      <View style={styles.communityActions}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t("community.issueA11y")}
          hitSlop={6}
          onPress={() => open(ISSUE_URL)}
          style={styles.communityAction}
        >
          <Text style={styles.communityActionText}>{t("community.issue")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t("community.prA11y")}
          hitSlop={6}
          onPress={() => open(PULL_REQUEST_URL)}
          style={styles.communityAction}
        >
          <Text style={styles.communityActionText}>{t("community.pr")}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("community.dismissA11y")}
        hitSlop={8}
        onPress={onDismiss}
        style={styles.communityDismiss}
      >
        <Text style={styles.communityDismissText}>✕</Text>
      </Pressable>
    </View>
  );
}

export function IndentGuides({ depth, styles }: { depth: number; styles: Styles }) {
  return (
    <>
      {Array.from({ length: depth }, (_, index) => (
        <View key={index} style={[styles.guide, { left: 10 + index * INDENT + 6 }]} />
      ))}
    </>
  );
}

export interface DragHandlers {
  onStart: () => void;
  onDelta: (totalDx: number) => void;
  onEnd: () => void;
}

/** 列表横向滚动：名字单行不截断，超宽时左右滚看全；纵向滚动仍由 FlatList 自身负责。
 *  不用嵌套 horizontal ScrollView——RNW 会把纵向 wheel 劫持成横向滚动。 */
export const webHScroll = Platform.OS === "web" ? ({ overflowX: "auto" } as unknown as ViewStyle) : null;
export const webHContent = Platform.OS === "web" ? ({ minWidth: "100%", width: "max-content" } as unknown as ViewStyle) : null;

/** 标题宽度估算（CJK 全角≈13px，其余≈7.5px），供 native 横滚定宽。 */
export function estimateTitleWidth(title: string): number {
  let width = 40;
  for (const ch of title) {
    width += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 13 : 7.5;
  }
  return width;
}

/** native 横滚：onLayout 实测外框 W/H，horizontal ScrollView 定像素宽= max(W, 最长标题估算)，
 *  内层 FlatList 撑满该宽高的像素盒；H=0 时降级裸列表防塌缩。web 原样返回（FlatList 自身 overflowX）。 */
export function ListScroll({ children, styles, titles }: { children: ReactNode; styles: Styles; titles: string[] }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  if (Platform.OS === "web") return <>{children}</>;
  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) =>
    setBox({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height });
  if (!box || box.h === 0) {
    return (
      <View style={styles.list} onLayout={onLayout}>
        {children}
      </View>
    );
  }
  const contentWidth = Math.max(box.w, ...titles.map(estimateTitleWidth));
  return (
    <View style={styles.list} onLayout={onLayout}>
      <ScrollView horizontal style={{ width: box.w, height: box.h }}>
        <View style={{ width: contentWidth, height: box.h }}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** 列间拖拽把手；native 不渲染（宽屏平板不支持调宽）。 */
export function ColumnDivider({ handlers, styles }: { handlers: DragHandlers; styles: Styles }) {
  const ref = useRef<View | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  useEffect(
    () =>
      attachResizeHandle(ref.current, {
        onStart: () => handlersRef.current.onStart(),
        onDelta: (dx) => handlersRef.current.onDelta(dx),
        onEnd: () => handlersRef.current.onEnd(),
      }),
    [],
  );
  if (Platform.OS !== "web") return null;
  // RN typings 的 CursorValue 只有 auto/pointer；RNW 运行时接受任意 CSS cursor。
  return <View ref={ref} style={[styles.divider, { cursor: "col-resize" } as unknown as ViewStyle]} />;
}