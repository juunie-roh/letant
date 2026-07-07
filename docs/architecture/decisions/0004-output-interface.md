# 4. Output Interface

Date: 2026-07-07

## Status

Accepted

## Context

The problem scope, mechanics, and architecture of letant are established
(parsing, scope tree, deterministic name resolution — ADR 0002, 0003). What
was not designed is the output: what letant emits, and how it gets used.

Early candidates were all document-shaped: an upfront serialized graph
(flat `{nodes, edges}`), a nested scope tree, a node-link format for
force-directed visualization. None settled, because the product is not an
upfront dismantled graph. The result letant produces is **on-demand answers
to "where did this name come from?"** — interactive, anchored to the user's
position in raw source text. A document interface cannot express a dialogue.

Two external references shaped the decision:

- **Structurizr's _view_ concept** (not its model): a view has a subject,
  belongs to a finite vocabulary of question-shapes, is derived and
  ephemeral, and selects into the model rather than duplicating it.
- **LSP, as contrast**: go-to-definition is a teleport to the endpoint —
  heuristic, through-resolving, opaque when wrong. letant is a railway with
  stations: every intermediate binding is a deterministic stop, and the
  genealogy emerges from riding the line, not from a report.

The current `workspace.trace` — which brings all references used in a scope
upfront — is experimental and is the antithesis of on-demand; it will not
survive in this form.

## Decision

The intent of letant: **replace the searching, using the programming
language's deterministic syntax.** It focuses only on positional
acquisition.

- **The answer unit is an exact position** — `{ file, range }`. To
  understand is to read from that position. Whether the name is exported,
  aliased, or imported is nothing letant reports; the source at the
  position says so itself. Lineage is _enacted_ by reading, not _narrated_
  by metadata. Determinism replaces annotation: when every answer is the
  provably-nearest declaration, the step needs no justification attached.
- **Queries are pointed.** One `(file, offset)` in, one answer out. No
  upfront dumps.
- **Auto-follow within explored territory, station-by-station at the
  frontier.** If resolution lands on an import binding whose source file is
  already opened in the workspace, letant follows through and answers with
  the declaration position in that file. If the file is not open, the
  answer stops at the import binding — following it is what expands the
  territory. Answers are therefore deterministic _given the explored
  region_, and the region grows monotonically within a session.
- **Terminals are positions' two honest absences**: the trail leaves the
  workspace (bare/external specifier), or the name is unresolved. Both are
  discriminated by the shape of the resolved path (`rootDir`-based
  normalization, ADR 0002). Emitting named terminal kinds is deferred —
  minor for now.
- **What to explore is the user's decision; letant never decides.**
  Answers are one level deep: a scope's own bindings plus its child scope
  _boundaries_ (name, kind, range) — never child interiors. Children remain
  unexplored frontier until the user expands them. This is the
  residual-interval rule (ADR 0003) applied to disclosure, and it coincides
  with lexical visibility: a scope's self-content is exactly the set of
  names visible at that level, so letant never shows a name that could not
  be referenced from that position. The explored set is client state;
  letant holds no exploration state beyond the workspace open-set.
- **The reference graph is not a letant output.** It emerges client-side as
  an _expandable_ graph — progressive disclosure, one node per answer the
  user followed, stable landmarks — growing exactly as the user's
  understanding scope expands. Force-directed dynamic re-layout was
  considered and rejected: re-layout on each expansion destroys the spatial
  memory the user is building.
- **`serialize()` is a development surface**, not a product interface: it
  dumps the scope tree for inspection and snapshot tests. It carries no
  compatibility promise to end users.
- **Two transport layers.** In-process: live `GraphCursor`s — chainable,
  workspace-scoped. Wire (editor plugin, CLI): plain positions — file plus
  half-open `[start, end)` range — so a client can highlight raw text with
  no further interpretation.

## Consequences

- The output interface is one function-sized contract:
  `(file, offset) → position | frontier station | terminal`.
- `workspace.trace` is to be replaced by pointed queries; its
  all-references-upfront output is removed. `references` may survive as a
  separate pointed question (the inverse direction).
- There is no graph serialization format to design, version, or maintain.
- Editor integration is thin — position in, position out — and sits
  alongside LSP as a distinct contract, not a replacement.
- The plugin contract is unchanged: positions already come from captures;
  cross-file continuation uses `[filePath, name]` identity (ADR 0002) and
  `topLevelNames`.

## Open Questions

- **Landing range**: does an answer point at the identifier, or at the
  start of the declaring statement? Small, but it defines the reading
  experience; to be decided deliberately, not inherited from whatever the
  capture produces.
- Terminal kind emission (deferred above).
