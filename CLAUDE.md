# SysArch

Visual system-architecture editor for full stack, AI and hardware systems.
Pure logic in `packages/shared`; `apps/web` (Vite + React Flow), `apps/server`
(Hono + Drizzle/SQLite + Better Auth), `apps/mcp` (MCP server, from M2).

## Commands

- `pnpm dev` — web (5173, proxies `/api`) + server (8787)
- `pnpm check` — typecheck + lint + test; must pass before every commit
- `pnpm test` — vitest across all packages
- `pnpm format` — Prettier
- `pnpm e2e` — Playwright; starts its own API (8788), web (5174) and DB
- `pnpm --filter @sysarch/mcp build` — bundle the MCP server to
  `apps/mcp/dist/index.js` (needs `SYSARCH_URL`, `SYSARCH_API_KEY`)
- `pnpm --filter @sysarch/server db:generate` — Drizzle migration after a
  change to `apps/server/src/db/schema.ts`

## Role

Work as a senior engineer fluent in full stack TypeScript, embedded systems
(MCUs, buses, power) and ML/LLM systems.

- Read the code and flow a change touches before writing. Look up library
  APIs with `ctx7`, not memory.
- Prefer the simplest correct solution: existing helper > stdlib >
  installed dependency > new code. Mark known ceilings with `ponytail:`.
- Every logic change ships with its test. Verify (typecheck, tests, run the
  app) before calling something done; report failures plainly.
- Never trade away security: validate at trust boundaries, check ownership
  on every request, secrets stay on the server.
- Hardware values drift from datasheets: keep thresholds configurable.
- Code, identifiers, comments and commits in English. UI text in Turkish,
  kept in `apps/web/src/i18n/tr.ts`.
- Ask before hard-to-reverse actions (data deletion, force operations,
  remote changes other than the milestone push).

## Commits

- Conventional Commits in English: `type(scope): imperative subject`,
  subject ≤ 72 chars. Types: feat, fix, refactor, test, docs, build, ci,
  chore. Scopes: shared, web, server, mcp, ai, repo.
- Body required (except trivial chores): why, what, design decision,
  known limits. Explain intent, don't restate the diff.
- Atomic: one logical step, includes its tests, passes `pnpm check` alone.
  No WIP or "fix previous commit" commits — fold fixups in before pushing.
- Code written by the user (learning mode) goes in its own commit, noted
  in the body.
- Never `--no-verify`.
- End every message with:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- One branch per milestone (`feat/m1-core` …). Finish with
  `git merge --no-ff` into main, tag `v0.N.0`, update CHANGELOG, then push
  main with tags. Push only at milestone end.

## Architecture map

| Path                             | What lives there                                         |
| -------------------------------- | -------------------------------------------------------- |
| `packages/shared/src/schema.ts`  | `ArchDoc` zod schema and referential integrity           |
| `packages/shared/src/migrate.ts` | Doc version upgrades, run on every read                  |
| `packages/shared/src/edit.ts`    | Pure doc edits: connect, remove cascade, copy/paste      |
| `packages/shared/src/flows.ts`   | Flow tracing (latency, broken step), links to a path     |
| `packages/shared/src/pricing.ts` | Dated price table, overrides, `costReport`               |
| `packages/shared/src/catalog/`   | Types, presets, protocols, pin maps, effective catalog   |
| `packages/shared/src/validate/`  | Rule engine; one file per rule family in `rules/`        |
| `packages/shared/src/simulate/`  | Load, capacity, power, latency; their rules              |
| `packages/shared/src/export/`    | `ARCHITECTURE.md`/json, code generators, Wokwi and BOM   |
| `packages/shared/src/import/`    | compose, Mermaid, Wokwi → `Imported` → `importOps`       |
| `packages/shared/src/templates/` | Starter docs (Sera IoT, edge AI, RAG, SaaS), fixtures    |
| `apps/server/src/app.ts`         | Hono app; `ApiType` feeds the web RPC client             |
| `apps/server/src/routes/`        | Project CRUD with revision compare-and-swap              |
| `packages/shared/src/ops.ts`     | `Op` model, `applyOps`, `diffDocs`: every outside change |
| `apps/server/src/ai/`            | Assistant loop: model edits a draft through ops          |
| `apps/mcp/src/`                  | MCP server; reads via shared, writes only proposals      |
| `apps/server/src/db/`            | Drizzle schema; migrations in `apps/server/drizzle`      |
| `apps/server/src/test/`          | Test harness and session minting (tests, E2E)            |
| `apps/web/src/store.ts`          | zustand editor store with zundo undo                     |
| `apps/web/src/canvas/`           | React Flow view model, nodes, edges, elk layout          |
| `apps/web/src/panels/`           | Palette and schema-driven inspector                      |
| `apps/web/src/shell/`            | Editor frame, tabs, shortcuts, export menu               |
| `apps/web/src/analysis/`         | Issues, simulation and flows panel; flow playback        |
| `apps/web/src/code/`             | YAML code tab (Monaco): doc ↔ text with line errors      |
| `apps/web/src/sync/`             | Debounced autosave and conflict handling                 |
| `e2e/`                           | Playwright specs and session setup                       |

Gotchas:

- `pnpm deploy --prod` (used by the Dockerfile) also prunes the
  workspace's own `node_modules`; run `pnpm install` after using it
  locally.
- Git Bash rewrites `/data`-style arguments to `docker exec`; prefix with
  `MSYS_NO_PATHCONV=1`.

## Architecture rules

- `packages/shared` exports TS source (`./src/index.ts`), no build step.
- Node positions live in `View.positions`, never on the node.
- Grouping is three independent things: `domain` (tab), `parent`
  (drill-down), `Boundary` (trust zone, drawn as overlay).
- Every architecture change from AI, MCP, import or diff is an `Op[]`
  applied by `applyOps`; model output always goes op → zod → applyOps →
  user approval. Nothing writes the doc directly.
- The effective catalog is built-in catalog + `doc.customTypes`.

## Design ("Hassas cihaz")

Quiet, instrument-like UI. The one bold element is the channel color
system (fullstack cyan, ai magenta, hardware amber) on tab markers, node
stripes, ports and edges — never as decoration. Tokens live in
`apps/web/src/styles/tokens.css`; use them, not raw hex.

- Severity is shape, not color: error = filled red badge, warning = hollow
  triangle, info = ring.
- Mona Sans (width axis for titles); JetBrains Mono only for YAML, pin
  names and ids. `tabular-nums` for numbers.
- Shell panels: 0 radius, 1px lines, no shadow. Floating layers: 8px
  radius, one shadow. Nodes 4px, chips 2px.
- Motion only for proposal ghosts (150ms), flow pulses, panel toggles
  (120ms); respect `prefers-reduced-motion`.
- Copy: Turkish, sentence case, active verbs; button and toast use the same
  verb ("Öneriyi uygula" → "Öneri uygulandı").
- Before each UI commit, screenshot light and dark with Playwright and
  review.

Forbidden: cream/terracotta palettes, gradients, glassmorphism, identical
shadowed cards everywhere, ALL-CAPS eyebrow labels, emphasizing one word
in a heading, `→` in button text, `A · B · C` meta strings, emoji icons,
decorative monospace, per-section fade-up animations.
