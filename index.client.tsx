import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { logoSvg } from "./client/logo";
import { messages } from "./client/i18n";
import { ObsidianScreen } from "./client/reader";
import { ObsidianSettingsScreen } from "./client/settings";

function ObsidianSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon={{ svg: logoSvg }}
      active={currentScreen?.screenId === "obsidian"}
      onPress={() => openScreen({ screenId: "obsidian" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addScreen({ id: "obsidian", title: messages.message("app.title"), Component: ObsidianScreen }),
    client.addSidebarHeaderItem({ id: "obsidian", title: messages.message("app.title"), Component: ObsidianSidebarItem }),
    client.addSettingsScreen({
      id: "obsidian-settings",
      title: messages.message("app.title"),
      icon: { svg: logoSvg },
      Component: ObsidianSettingsScreen,
    }),
    client.addCommandCenterItem({
      id: "open-obsidian",
      title: messages.message("app.openCommand"),
      icon: { svg: logoSvg },
      context: "global",
      keywords: ["obsidian", "vault", "笔记", "文档", "markdown"],
      onSelect(context) {
        context.openScreen({ screenId: "obsidian" });
      },
    }),
  ];
  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // host 已经在 teardown
      }
    }
  };
}