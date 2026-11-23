import { useRpc } from "@getpaseo/plugin/client";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotesRpc, listVaultsRpc, readImageRpc, readNoteRpc, searchNotesRpc } from "../shared/contracts";
import type { NoteImage } from "../shared/contracts";

const KEY = ["paseo-obsidian"] as const;

export function useVaults() {
  const call = useRpc(listVaultsRpc);
  return useQuery({
    queryKey: [...KEY, "vaults"],
    queryFn: () => call({}),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}

export function useNotes(vault: string | null, limit: number) {
  const call = useRpc(listNotesRpc);
  return useQuery({
    queryKey: [...KEY, "notes", vault, limit],
    queryFn: () => {
      if (vault === null) throw new Error("未选择 vault");
      return call({ vault, limit });
    },
    enabled: vault !== null,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function useSearch(scope: "vault" | "all", vault: string | null, query: string) {
  const call = useRpc(searchNotesRpc);
  return useQuery({
    queryKey: [...KEY, "search", scope === "all" ? null : vault, query],
    queryFn: () => {
      if (scope === "vault" && vault === null) throw new Error("未选择 vault");
      return call({ query, vault: scope === "all" ? null : vault });
    },
    enabled: query !== "" && (scope === "all" || vault !== null),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}

export function useNote(vault: string | null, notePath: string | null) {
  const call = useRpc(readNoteRpc);
  return useQuery({
    queryKey: [...KEY, "note", vault, notePath],
    queryFn: () => {
      if (vault === null || notePath === null) throw new Error("未选择笔记");
      return call({ vault, path: notePath });
    },
    enabled: vault !== null && notePath !== null,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
  });
}

/** 返回结果与传入 images 中「可取字节」的那些一一对应，顺序一致。 */
export function useNoteImages(vault: string | null, images: NoteImage[]) {
  const call = useRpc(readImageRpc);
  const wanted = images.filter((image) => image.path !== null && image.problem === null);
  return useQueries({
    queries: wanted.map((image) => ({
      queryKey: [...KEY, "image", vault, image.path],
      queryFn: () => {
        if (vault === null || image.path === null) throw new Error("未选择图片");
        return call({ vault, path: image.path });
      },
      staleTime: Infinity,
      gcTime: 10 * 60_000,
      retry: 1,
    })),
  });
}

export function useInvalidateObsidian() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: KEY });
}

/** 只刷新当前笔记，不连带重取已缓存的图片字节。 */
export function useRefreshNote() {
  const queryClient = useQueryClient();
  return (vault: string, notePath: string) =>
    queryClient.invalidateQueries({ queryKey: [...KEY, "note", vault, notePath] });
}

/** 定向失效指定图片字节（外部改动刷新时用），不全量 invalidate。 */
export function useInvalidateImages() {
  const queryClient = useQueryClient();
  return (vault: string, paths: string[]) => {
    for (const imagePath of paths) {
      void queryClient.invalidateQueries({ queryKey: [...KEY, "image", vault, imagePath] });
    }
  };
}