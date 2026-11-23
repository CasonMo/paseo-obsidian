# AGENTS.md

Working rules for contributors and coding agents in this repository. They restate the
Paseo plugin requirements we must follow when developing, reviewing, and releasing.
Adapted from the sibling plugin conventions; plugin-specific mechanics below replace
the source repository's tooling.

## References

- Plugin quickstart: https://paseo.sh/docs/plugins
- Plugin reference: https://paseo.sh/docs/plugins/reference
- Publishing guide: https://paseo.sh/docs/plugins/publishing
- Registry review policy: https://github.com/getpaseo/plugins/blob/main/REVIEW.md

## Compliance

- Keep the standard plugin layout: `paseo-plugin.json`, `index.client.tsx`,
  `index.server.ts`, `client/`, `server/`, `shared/`, with a committed lockfile.
- Manifest paths are relative, use forward slashes, and must not contain `..` segments.
  Keep `requirements.paseo` accurate and the listed entry files present.
- Follow the plugin SDK contracts: client code must not reach into daemon-only APIs, and
  daemon code must not depend on the UI. Keep RPC contracts schema-validated.
- Dependencies must stay minimal and resolve through the committed lockfile. Any build or
  lifecycle script must have an understandable purpose and no hidden side effects.
- Registry review reads the pinned artifact without executing it; everything needed to
  understand the plugin must be inside the repository.
- `server/vault.ts` and `server/search.ts` are read-only by construction: they import only
  `readdir`, `stat`, `realpath`, `readFile`. `scripts/smoke.ts` asserts this with a source
  regex; keep that assertion when touching either file.

## Security

- This plugin handles no credentials. Never print, echo, log, quote, or otherwise output
  note contents, real vault paths, or any credential — not in UI text, agent prompts, tool
  output, errors, or documentation. Paseo logs are readable by connected users. Error
  messages must stay useful without echoing file contents or absolute user paths.
- The plugin is read-only: it never writes, renames, or deletes vault files. Any future
  mutation requires an explicit user action, a visible confirmation, and a backup outside
  the vault before writing.
- No hidden network calls, no telemetry, no `eval` of dynamic or remote code, no shell
  built from external data. The only data flow is daemon-local filesystem reads plus the
  plugin RPC/binary image channel to the connected client; document every network
  destination and data flow in `OVERVIEW.md`.
- The plugin runs trusted and unsandboxed; keep that trust justified by the rules above.

## Data sanitization

- Everything committed must be desensitized: no real names, account handles, workspace or
  item IDs, tokens, cookies, internal hostnames, absolute user home paths, or customer
  data in code, comments, docs, fixtures, examples, screenshots, or commit messages.
  Git history counts as committed content: never commit a secret and "fix it later".
- Use obvious placeholders such as `<vault-path>`, `<token>`, `example.com`, `12345678`.
  Test fixtures are built with `mkdtemp` and generic note names; never point tests or
  examples at a real vault.
- Screenshots and media: never capture or commit images of real vault data. `assets/`
  contains only brand marks (the Obsidian mark under referential use and the Paseo mark)
  and the rasterized plugin icon; any other image change must be supplied and confirmed
  desensitized by the author.
- Local verification artifacts (`node_modules/`, `.playwright-cli/`, logs) are gitignored
  and must never be committed.
- Internationalization: UI strings are currently Chinese-only. If a bilingual catalog is
  introduced, every user-facing string must go through it with matching `{{placeholders}}`
  in both locales before release; module-level tables store catalog keys and call `t()` at
  render/read time, never at import time.

## Code safety

- Reads by default; mutations hang off a user gesture and a visible confirmation.
- Validate and clamp external input (schema refine plus realpath containment for paths,
  `clampWidth` for layout numbers); keep error messages useful without echoing credentials
  or raw file contents.
- When behavior or data access changes, update `OVERVIEW.md` in the same change.

## Keeping docs in sync

Feature changes must update the user-facing documents in the same change:

- `README.md`: feature list, setup, and usage examples.
- `OVERVIEW.md`: capabilities, settings, permissions, and data access.
- `paseo-plugin.json`: description, media, icon, and requirements.

A release is not ready while these documents still describe older behavior.

## Publishing and releases

The registry at https://github.com/getpaseo/plugins pins one exact commit of this
repository, and that pinned artifact is what users install.

1. Push the finished change to `main` after the checklist below passes.
2. Request the update in the registry: open a submission issue (title = the plugin
   name, Source = this repository) naming the desired commit, or propose the new
   commit directly in the existing record with a hand-edited pull request. Git
   updates are manual; nothing is bumped automatically.
3. The reviewer verifies the pinned commit, runs the trusted registry validation,
   and merges. Approved listings appear on paseo.sh/plugins; no tag is required.
4. After merge, confirm the listing installs the new pin.

Checklist before pushing:

- `npm run typecheck` and `npm run smoke` pass.
- Grep the change for secrets and real identifiers (home paths, vault names, handles,
  tokens); confirm none, including in fixtures and commit messages.
- README, OVERVIEW, and the manifest are updated together (see above).
- Bump `package.json` version for user-visible changes.
- For visual changes, only author-supplied desensitized media; never capture real vault
  data.