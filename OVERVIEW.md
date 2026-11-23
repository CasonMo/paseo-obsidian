# Obsidian Notes

Independent third-party plugin, not affiliated with or endorsed by Obsidian. The purple gem in
the icon is the Obsidian mark used referentially to indicate compatibility; the black corner
badge with the white loop is the Paseo platform mark (vector approximation in menus, official
raster in the listing icon). Adding the Paseo badge is not a trademark disclaimer; stop using
the gem if the trademark owner objects.

Point the plugin at an Obsidian vault and browse its markdown notes read-only inside Paseo.
Install it on whichever machine hosts the vault; the host picker at the top of the screen
selects the machine, and each machine keeps its own vault paths. Suited to notes spread across
a laptop and several servers without creating a workspace per vault or logging into machines.
Editing stays in Obsidian itself or its official CLI (Obsidian 1.12+); this plugin never writes.

Requires Paseo 0.16.0 or newer: device-scoped settings for remembered browse state and the
binary image RPC both arrive in 0.16; older APIs exist earlier but these two set the floor.

## Setup

Configure in Settings → Plugins → Obsidian Notes, or the settings button in the vault column:

- Vault paths: absolute paths, `~/` supported, up to 20 entries. On servers without Obsidian,
  point these at the synced markdown directory.
- Auto-discovery: reads the local Obsidian registry (macOS
  `~/Library/Application Support/obsidian/obsidian.json`, Linux
  `$XDG_CONFIG_HOME/obsidian/obsidian.json` or `~/.config/obsidian/obsidian.json`, Windows
  `%APPDATA%/obsidian/obsidian.json`) and lists recorded vaults. Missing Obsidian or a failed
  probe yields an empty list, not an error.

A path that does not exist or is not a directory is greyed out with a reason and does not
affect other vaults. Settings are stored per host.

## Capabilities

- Vault list; notes browse as a file tree (plain rows with per-level indent guides, collapsible,
  per-directory note counts, name-sorted) or a "recent" flat view sorted by modification time.
- Global fuzzy search with a current-vault / all-vaults scope switch (all = every configured
  vault on the selected host). Filenames match by subsequence with substring hits ranked first;
  body text matches when all whitespace-separated tokens occur (order-independent). Hits carry
  a context snippet and vault label and open the note in the right vault. `#tag` / `tag:xx`
  filters cover frontmatter tags and inline tags (pure numbers are not tags) and combine with
  words; on web the search box supports ArrowUp/ArrowDown selection and Enter to open.
- Outgoing-links panel: resolves `[[wikilinks]]` (aliases and `#heading` anchors) and relative
  markdown links into jump targets, with a session back/forward history. In-text link clicks
  cannot be intercepted by the host, so navigation lives in this panel.
- Outline and in-note find: sections split on ATX headings; the outline jumps to a section
  (re-measured after images change section height); find shows a match count and cycles
  prev/next by jumping to the containing section.
- External-change notice: the open note's mtime is polled every 10s; an external edit shows a
  refresh/dismiss banner, a deletion shows a deleted banner with a way back to the list; the
  note list polls every 15s.
- Markdown rendering uses Paseo's own renderer: headings, tables, code blocks, task lists, links.
- Screenshots and images inline, covering standard `![](path)` and Obsidian `![[image.png]]`
  embeds; spaces are covered via angle brackets, percent-encoding or embeds (markdown forbids
  bare spaces in link targets); bare filenames resolve across the vault; image syntax inside
  code fences is left untouched.
- Copy the absolute note path (handy for passing to an agent) and manual refresh.
- Browse state remembered per device: last vault, open note, vault/list column collapse,
  per-vault folder expansion, both column widths; restored on re-entry and app restart
  (a collapsed column stays collapsed).
- Both left columns resize by dragging (vault 140-400px, list 220-560px); dragging uses web
  pointer events, native wide layouts (tablets) do not resize.
- Three columns on wide screens (vault / list / reader); single column with stepwise back on
  narrow screens and mobile.

## Data access and permissions

Read-only plugin: only `readdir`, `stat`, `realpath`, `readFile` are used
(`server/vault.ts`, `server/search.ts`); no file is written and no Obsidian configuration is
modified.

Only paths inside configured vaults are readable: the vault must be a listed member, relative
paths pass schema validation (absolute paths, `..`, backslashes rejected) and then realpath
containment against the vault root, blocking symlink escape and traversal. Dot entries
(`.obsidian`, `.git`, `.trash`, iCloud placeholders) and symlinks are skipped while walking.

Search and browse share a 30s directory-list cache; body scans run 16-wide, skip notes over
2MB, and cap results at 100. The tree is built from the full path set (not the recent view's
1000-note cap); the recent view marks truncation.

Image bytes travel over the plugin's binary RPC from daemon to client and are inlined as data
URLs; no third-party service is involved. No network egress, no telemetry, no credentials.
Command Center (⌘K) offers a global "open Obsidian Notes" entry.

## Known limitations

- Read-only; edit in Obsidian or its official CLI.
- In-text link clicks are not interceptable (host Markdown exposes no link handler and ignores
  relative links without workspace context); navigation uses the outgoing-links panel;
  wikilinks remain plain text in the body.
- In-note find jumps to sections with a count; no render-layer highlighting; setext headings
  (`===`/`---`) unsupported; cross-section reference links `[t][ref]` and footnotes are not
  guaranteed to render.
- External-change detection is polling: note ≤10s, list ≤15s, directory/bare-name caches ≤30s;
  an external edit to an image file alone (note mtime unchanged) is not detected.
- No graph/backlink analysis beyond outgoing links; `![[image.png]]` embeds render.
- Global search covers configured vaults on the selected host only, not across hosts.
- Note body cap 2MB; image cap 8MB each, 40 images per note; overflow shows a placeholder note
  instead of silently dropping.
- SVG images render on desktop/web only; Paseo strips SVG on iOS/Android.
- Horizontal scrolling and column resizing are web-only; native (including wide tablets)
  ellipsizes single-line names and keeps fixed column widths.
- No file watching; use refresh after external edits.
- Each remote machine needs its own install and its own plugin enable switch in
  Settings → Plugins; daemon version must satisfy the manifest requirements.