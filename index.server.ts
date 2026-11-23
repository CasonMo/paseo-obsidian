import type { PluginServerContext } from "@getpaseo/plugin/server";
import { searchNotes } from "./server/search";
import { listNotes, listVaults, readImage, readNote } from "./server/vault";
import {
  listNotesRpc,
  listVaultsRpc,
  obsidianSettings,
  obsidianSettingsSchema,
  readImageRpc,
  readNoteRpc,
  searchNotesRpc,
} from "./shared/contracts";
import type { ObsidianSettingsValues } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(obsidianSettings);

  async function currentSettings(): Promise<ObsidianSettingsValues> {
    const state = await settings.read();
    return state.status === "ready" ? state.values : obsidianSettingsSchema.parse({});
  }

  server.handle(listVaultsRpc, async () => ({ vaults: await listVaults(await currentSettings()) }));
  server.handle(listNotesRpc, async ({ vault, limit }) => listNotes(vault, await currentSettings(), limit));
  server.handle(readNoteRpc, async ({ vault, path }) => readNote(vault, path, await currentSettings()));
  server.handle(readImageRpc, async ({ vault, path }) => readImage(vault, path, await currentSettings()));
  server.handle(searchNotesRpc, async ({ query, vault }) => searchNotes(query, vault, await currentSettings()));

  return () => {};
}