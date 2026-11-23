import { Platform } from "react-native";

interface MinimalElement {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  setPointerCapture?(pointerId: number): void;
}

interface MinimalWindow {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

interface PointerLike {
  clientX: number;
  pointerId: number;
  preventDefault?(): void;
}

/** web-only：给行节点设原生 hover tooltip 显示完整名字；native no-op。 */
export function setHoverTitle(element: unknown, title: string): void {
  if (Platform.OS !== "web") return;
  const node = element as { title?: string } | null;
  if (node) node.title = title;
}

/** web-only 拖拽把手：pointer 事件 + capture；native 返回 undefined（no-op）。 */
export function attachResizeHandle(
  element: unknown,
  handlers: { onStart: () => void; onDelta: (totalDx: number) => void; onEnd: () => void },
): (() => void) | undefined {
  if (Platform.OS !== "web") return undefined;
  const node = element as MinimalElement | null;
  if (!node || typeof node.addEventListener !== "function") return undefined;
  const win = (globalThis as unknown as { window?: MinimalWindow }).window;
  if (!win) return undefined;

  let startX = 0;
  let dragging = false;
  const down = (event: unknown) => {
    const pointer = event as PointerLike;
    dragging = true;
    startX = pointer.clientX;
    node.setPointerCapture?.(pointer.pointerId);
    pointer.preventDefault?.();
    handlers.onStart();
  };
  const move = (event: unknown) => {
    if (!dragging) return;
    handlers.onDelta((event as PointerLike).clientX - startX);
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    handlers.onEnd();
  };

  node.addEventListener("pointerdown", down);
  win.addEventListener("pointermove", move);
  win.addEventListener("pointerup", up);
  win.addEventListener("pointercancel", up);
  return () => {
    node.removeEventListener("pointerdown", down);
    win.removeEventListener("pointermove", move);
    win.removeEventListener("pointerup", up);
    win.removeEventListener("pointercancel", up);
  };
}