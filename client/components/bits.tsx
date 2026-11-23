import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, type ReactNode } from "react";
import type { ViewStyle } from "react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { INDENT, type Styles } from "../styles";
import { attachResizeHandle } from "../web";

export function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.error}>读取失败：{errorMessage(error)}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>重试</Text>
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