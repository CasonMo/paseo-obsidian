# Obsidian 笔记 (paseo-obsidian)

Read-only Obsidian vault browser inside Paseo. Point it at one or more vaults on any
machine running a Paseo daemon and read the notes without creating workspaces or
logging into servers.

Independent third-party plugin, not affiliated with or endorsed by Obsidian. The gem
mark in the icon is used referentially to indicate compatibility; the corner badge is
the Paseo platform mark. See `OVERVIEW.md` for the full disclaimer.

## Features

- Per-host vault configuration: manual absolute paths (with `~/`) plus optional
  auto-discovery from the local Obsidian registry.
- File tree with indent guides, collapse/expand, per-directory note counts; a "recent"
  flat view sorted by modification time.
- Global fuzzy search across all configured vaults on the selected host: subsequence
  filename matching (substring hits rank first), whitespace-token AND content matching
  with snippets, `#tag` / `tag:xx` filters (frontmatter tags and inline tags).
- Outgoing-links panel (`[[wikilinks]]` with aliases and `#heading` anchors, relative
  markdown links) with session back/forward history.
- Outline (ATX headings) with jump-to-section, and in-note find with match count,
  prev/next cycling and a collapsible match list (section title + snippet, click to jump).
- Search filters `path:fragment`, `ext:extension`, `re:regex` (no spaces, 200-char source cap,
  128KB per-file scan truncation); recent-search chips remembered per device.
- External-change notice: polled note mtime shows a refresh/dismiss banner; deleted
  notes show a deleted banner.
- Inline screenshots and images, including Obsidian `![[image.png]]` embeds, transferred
  over the plugin binary RPC and inlined as data URLs.
- Collapsible vault and list columns with draggable widths; browse state (vault, note,
  collapse states, expanded folders, column widths) remembered per device.
- Single-line note names with horizontal scrolling on web (hover shows the full name) and
  on native (measured pixel-width horizontal container); column resizing is web-only.
- Bilingual interface (English / Simplified Chinese) following the app language.
- Command Center (⌘K) entry: "打开 Obsidian 笔记".

## Setup

Requires Paseo >= 0.16.0 on each daemon that hosts a vault.

```bash
paseo plugin install github:CasonMo/paseo-obsidian
# or from a local checkout:
paseo plugin install /absolute/path/to/paseo-obsidian
```

Enable plugins on each daemon (Settings → Plugins), then open the sidebar entry and add
vault paths in the plugin settings. Remote daemons need their own install and their own
vault paths; the screen's host picker switches between machines.

## Usage

- Browse: tree / recent toggle; click a note to read it.
- Search: type in the list column; scope chips switch between the current vault and all
  vaults; on web, ArrowUp/ArrowDown select a hit and Enter opens it.
- Read: outline and outgoing-links chips open panels; the find box cycles matches;
  copy-path copies the absolute note path for handing to an agent.
- Columns: collapse buttons hide a column; drag the divider between columns to resize
  (web only). Everything is remembered per device.

## Development

```bash
npm install
npm run typecheck
npm run smoke
```

`scripts/smoke.ts` builds throwaway vaults with `mkdtemp` and asserts path containment,
symlink-escape rejection, read-only source constraints, search/tag/fuzzy behavior, and
layout clamping. No test ever touches a real vault.

## Layout

- `shared/`: zod RPC contracts and pure markdown/fuzzy helpers shared by both runtimes.
- `server/`: read-only filesystem access (`vault.ts`) and search (`search.ts`).
- `client/`: screens, hooks, and the web-only pointer/tooltip helpers (`web.ts`).
- `assets/`: brand marks and the rasterized plugin icon (`icon.svg` → `rsvg-convert`).

## License

MIT. See `LICENSE`.