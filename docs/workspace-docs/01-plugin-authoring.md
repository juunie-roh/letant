# Plugin Authoring

A language plugin declares, for its language, _where scopes bound and where
names bind_. Core owns everything else: identity, containment, resolution,
traversal. A plugin is a package exporting a `Plugin.Descriptor`:

```ts
export default {
  language,      // tree-sitter grammar binding
  extensions,    // resolver probe suffixes
  query,         // QueryMap of .scm files, one per construct
  captureConfig, // per-tag options: bypass, maxStartDepth
  convertConfig, // per-tag handlers: captures → nodes
  references,    // identifiers within a node's range
} satisfies Descriptor;
```

Use `@letant/js` (many constructs) and `@letant/python` (non-path imports,
non-scoping blocks) as reference implementations.

## What belongs in the model

letant acquires; it never interprets (ADR 0005). Capture a construct only if
its name resolution is decided by syntax alone:

- Scope boundaries and name bindings the grammar exposes — yes.
- Anything decided only at run time — call-site receivers (`this`, `self`),
  members past a chain's root, scope built at run time (`eval`, `with`),
  module specifiers computed from values — no. Leave them unresolved; do not
  approximate them.
- Where your language's scoping diverges from textual containment
  (hoisting, `global`/`non-local`), choosing the attachment scope — or
  declining to model the rule — is the plugin's decision. Record it in the
  plugin's own docs.

## Capture

- One `.scm` file per construct, under `queries/{scope,binding,…}/`.
  Capture tags are a shared vocabulary — reuse existing names (`@name`,
  `@body`, `@source`, `@alias`, `@extends`, `@node`); a new tag requires
  asking first (see each package's `queries/CLAUDE.md`).
- Classify each capture in `QueryConfig`: **required** means _every_
  pattern in the file captures it. If one alternation lacks it, it is
  optional — the type of `c.<capture>` follows from this.
- Matches start at the captured node and its direct children
  (`maxStartDepth: 1` by default, per-tag configurable via
  `CaptureConfigOptions`). Descending into a nested scope is the convert
  handler's job: `convert(capture(body), path)`. A handler that forgets to
  recurse produces a silently shallow tree.
- Invalid node types fail at descriptor import time with the grammar's own
  error — the fastest feedback loop. Iterate on patterns with
  `pnpm dev:query`.

## Bypass

Wrappers that contain declarations without scoping them (`export …`,
decorators, Python's `if`/`for`/`try` blocks) hide matches from the
one-level default. A bypass supplements them:

- Contract: `(node) => QueryMatch[]`, called on every capture of the tag
  with the same node the main query ran on; results are appended and must
  match the tag's capture shape. Pure TS is fine — no `.scm` needed.
- Single-level unwrapping: `@letant/js` `bypassExport`.
- Recursive descent through arbitrarily nested non-scoping blocks:
  `@letant/python` `bypassCompound`.

## Emitting nodes

- **Paths are the tree.** Place nodes with `createChildPath(parent, name)`.
  Same path deduplicates (a `scope` replaces a non-`scope`; otherwise first
  wins). Emission order is free — children may precede parents.
- **Never emit the root module node** (path length 1); core appends it.
- **Scope nodes**: `at: getRange(node)` (full construct), `blockStartIndex`
  pointing at the inner block's start — position queries begin reading
  there.
- **Anonymous nodes are only for constructs that truly create scopes** in
  your language. Emitting them for non-scoping blocks breaks resolution:
  bindings inside become invisible to their actual scope. (This is why
  `@letant/python` has none — and a compound bypass instead.)
- **Bindings**: `at: getRange(node)` for local declarations; imports are
  different — see below.

## Imports

An import binding's `at` is a `NodeSource` string, not a range:

- Core resolves _path-shaped_ specifiers (`./`, `../`) against `rootDir`,
  probing the descriptor's `extensions` as suffixes — including
  directory-entry forms (`/index.mjs`, `/__init__.py`).
- Anything not path-shaped passes through untouched (external or
  unresolved, exactly as written in source).
- If your language's import syntax is not path-shaped, **pathification is
  the plugin's job** — see `@letant/python`'s dotted-name translation
  (`.mod` → `./mod`).
- Note the two `extensions`: the descriptor's (resolver probe suffixes)
  and the workspace config's `plugins[].extensions` (file-to-plugin
  dispatch).

## Conventions

- `kind` follows the tag's head (`module.binding` → `module`), plus
  language kinds like `parameter`.
- `props` names are shared across plugins — reuse before inventing:
  `alias_of`, `has_default`, `is_async`, `extends`.
- Core interprets neither `kind` nor `props`; they are consumer-facing metadata.

## Testing

Each package carries its own fixture test — no CLI involved:

- `__mocks__/fixture/` (sample sources) and `__tests__/fixture.test.ts`.
- Build a `Config` object in memory pointing at the package's `dist`,
  then `Workspace.create(config)` → `openSource(path, text)`. That's the
  whole harness.
- **Capture order is not deterministic.** Sort nodes (and remap ids) before
  snapshotting, or the snapshot will flake across runs.
