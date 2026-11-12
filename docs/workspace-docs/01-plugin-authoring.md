# Plugin Authoring

A language plugin declares, for its language, _where scopes open, where
names bind, and which positions refer to a name_. Core owns everything
else: identity, containment, resolution, traversal. A plugin is a package
exporting a `Plugin.Descriptor`:

```ts
export default {
  language, // tree-sitter grammar binding
  extensions, // resolver probe suffixes
  query, // QueryMap registered with core: the entry query
  captureConfig, // per-tag capture options; empty for a whole-file plugin
  convertConfig, // per-tag handlers: captures → nodes
  references, // nodes that name a binding within a node's range
  nameOf, // optional: the name a reference looks up, if not its text
  unsupported, // optional: references the tree would resolve incorrectly
} satisfies Descriptor;
```

`@letant/js` is the reference implementation of this guide (ADR 0006), and
`@letant/python` follows it. `@letant/ts` still uses the earlier depth-gated
model — see [The earlier model](#the-earlier-model).

## Start from the specification

Scoping rules come from the language specification, not from how code is
usually written. Before writing a query, record the rules in a `SCOPING.md`
beside the plugin's source — see
[`packages/js/SCOPING.md`](../../packages/js/SCOPING.md). For each rule:
the section of the specification, the grammar's node types and fields it
maps to, and where the grammar's shape and the specification disagree. The
grammar supplies node types; it says nothing about scoping.

There are four kinds of rule:

| Kind              | Question                                                                 | JavaScript example                                                                          |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Boundaries**    | Which syntax opens a scope?                                              | functions, classes, blocks, `for` heads, `catch`, `switch` bodies                           |
| **Binding forms** | Which syntax introduces a name?                                          | declarators, parameters, declaration names, imports                                         |
| **Attachment**    | Which scope does a name go into, where that is not its nearest boundary? | `var` goes to the nearest function; a declared function's name goes to the scope outside it |
| **References**    | Which positions name a binding at all?                                   | an identifier — not a property after a dot, a label, or the inside of a string              |

## What belongs in the model

letant acquires; it never interprets (ADR 0005). Model a rule only if it is
decided by syntax alone:

- Scope boundaries and name bindings the grammar exposes — yes.
- Anything decided only at run time — call-site receivers (`this`, `self`),
  members past a chain's root, scope built at run time (`eval`, `with`),
  module specifiers computed from values — no. Leave them unresolved; do not
  approximate them.
- A rule the plugin declines to model (JavaScript's Annex B, for instance)
  is recorded in `SCOPING.md` with the reason.

## Queries

Queries are classified by what they establish, not by construct, and run
over the whole file — there is no depth limit:

| Query                   | Establishes                          | Captures                 |
| ----------------------- | ------------------------------------ | ------------------------ |
| `scoping/program.scm`   | the entry point registered with core | `@node` on the file root |
| `scoping/scope.scm`     | boundaries                           | `@scope`                 |
| `scoping/binding.scm`   | binding forms                        | `@binding.<rule>`        |
| `utility/reference.scm` | references                           | `@reference`             |

- Only the entry query goes in the descriptor's `query`; its handler in
  `convertConfig` receives the file root and emits every node. The scope and
  binding queries live in the plugin's own `QueryMap`.
- List boundaries, not the syntax to look through. The set of scope-opening
  node types is short and closed; the set of everything else (wrappers,
  every expression form) has no end. Anything not listed is walked through,
  so `export`, labels, `try` and nested expressions need no handling.
- What a query cannot express is a rule in code beside the queries
  (`scoping/rules.ts`): which blocks belong to their parent's scope, which
  scopes a hoisted name stops at, where a scope's region starts.
- Capture tags are a shared vocabulary; a new tag requires asking first
  (see each package's `queries/CLAUDE.md`).
- Invalid node types fail at descriptor import time with the grammar's own
  error — the fastest feedback loop. Iterate on patterns with
  `pnpm dev:query` (raise `--max-start-depth` to see nested matches).

## Extraction

One handler builds the whole file's nodes in three passes (see
`packages/js/src/scoping/extract.ts`):

1. **Scopes.** Collect every `@scope` node, skipping a block that belongs
   to its parent (a function's own body). A scope's parent is the nearest
   scope above it in the syntax tree.
2. **Bindings.** For every binding form, walk up to the nearest scope, then
   apply the attachment rule. Destructuring patterns yield one binding per
   name.
3. **Emit** one node per scope and one per name.

Keep one node per name per scope. Where a name is declared more than once,
pick the declaration the specification initializes it from, and record the
choice.

## Emitting nodes

- **Paths are the tree.** Place nodes with `createChildPath(parent, name)`.
  Emission order is free — children may precede parents.
- **Never emit the root module node** (path length 1); core appends it.
- **A scope is never a name.** A scope node (`type: "anonymous"`) takes the
  segment `<name or label>@<startIndex>`, which cannot equal an identifier;
  lookup therefore never lands on a scope. The name a function or class is
  known by is a separate binding node, in whichever scope the language binds
  it.
- **A scope's `at` is the region where its names are visible** — position
  lookup descends through it. Leave out a head or tail evaluated outside
  the scope: a declared function's own name, a computed method key.
  `blockStartIndex` points at the inner block's start.
- **A binding's segment is its name, and its `at` is the declaring
  identifier** — the exact position an answer lands on (ADR 0004).
- **Members that are not lexically visible** (a public class field or
  method) take a scope-style `<name>@<startIndex>` segment, so a bare name
  cannot resolve to them. Put the plain name in `props`.
- Core matches a lookup against the last path segment of _every_ child, so
  any segment equal to an identifier is a binding of that identifier,
  whatever its `type`.

## References

`origin` resolves a position only if `references(node)` returns the node at
that position; otherwise it answers `undefined`. `references` receives a
node and returns every node within its range that names a binding — the
node itself included.

- List the node types in `utility/reference.scm`. Include declaring
  positions: pointing at a declaration answers with itself.
- Some grammars already type non-references differently (JavaScript's
  `property_identifier`, `statement_identifier`); others use one identifier
  type throughout (Python's attribute and keyword-argument names), and the
  plugin must decide by parent and field.
- Filter what node type cannot tell apart in code: JavaScript drops
  lowercase JSX tags and the non-local side of import and export
  specifiers.

## Lookup that is not a plain outward walk

Core resolves a name by walking from the innermost scope outward and taking
the first binding with that name. Three things adjust the walk (ADR 0007).
Use them only for a rule in your `SCOPING.md`.

- **Barriers.** Some languages hide certain bindings from the code nested
  inside a function or class: a Python class's names from its methods, a
  Ruby method's surroundings from its body. Set `barrier: true` on the
  scopes whose inside is cut off, and `visibility: "local"` on the bindings
  that stop being visible. Once a lookup has left a barrier scope, it
  passes over `"local"` bindings in every scope further out. A scope that
  is not a barrier (a block, an annotation scope) lets a lookup through
  unchanged. Both fields are optional; a language with plain lexical
  scoping sets neither.
- **`nameOf(node)`.** Core looks up the text at the position. If your
  language rewrites or normalizes names (Python mangles `__x` inside
  `class K` to `_K__x`, and reads identifiers in NFKC form), return the
  name the reference stands for, and emit bindings under that same name.
- **`unsupported(node)`.** If the tree would answer a reference
  incorrectly and none of the above can express the rule, return the rule
  as a string; `origin` then answers `{ unsupported: rule }` and does not
  resolve. A wrong answer is worse than none. The test may decline more
  positions than strictly necessary, never fewer; record in `SCOPING.md`
  what it declines and what that costs.

Both functions are asked only for nodes `references` returned.

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
- When the local name differs from the imported one, record the imported
  name in `props.alias_of`; core follows it into an opened file.
- Files outside `rootDir` are out of bounds: following an import into one
  is an error, by design.
- Note the two `extensions`: the descriptor's (resolver probe suffixes)
  and the workspace config's `plugins[].extensions` (file-to-plugin
  dispatch).
- Exports are not modeled yet: across files, core matches the imported name
  against the target file's top-level names.

## Conventions

- `kind` names what the node is (`function`, `block`, `variable`,
  `parameter`, `module`, …).
- `props` names are shared across plugins — reuse before inventing:
  `alias_of`, `has_default`, `is_async`, `extends`, `name`.
- Core interprets neither `kind` nor `props` (apart from `alias_of`); they
  are consumer-facing metadata.

## Testing

Each package carries its own tests — no CLI involved. Build a `Config`
object in memory pointing at the package's `dist`, then
`Workspace.create(config)` → `openSource(path, text)`. That's the whole
harness; rebuild the plugin before running.

- **Resolution tests** (`__tests__/resolution.test.ts`) pin the rules. Each
  source marks the position to resolve with `‹name›` and the identifier it
  must land on with `«name»`; a source without `«»` must resolve to
  nothing. Shadow with an outer name wherever a wrong scope would otherwise
  go unnoticed, and add the opposite case for every boundary.
- **Break each rule once** and check that a test fails. A rule no test
  catches is not pinned.
- **Pin what the plugin declines**, with a neighbouring case it must still
  resolve, so that `unsupported` neither leaks nor spreads.
- **Compare against an independent implementation** when one exists.
  `@letant/js` was accepted by agreeing with `eslint-scope` on every
  reference in 1,501 files. Agreement is not proof against the
  specification where both simplify the same way.
- **Fixture test** (`__mocks__/fixture/`, `__tests__/fixture.test.ts`)
  snapshots a tree and exercises imports. Capture order is not
  deterministic: sort nodes (and remap ids) before snapshotting.

## The earlier model

`@letant/ts` predates ADR 0006. It registers one query per construct
(`queries/{anonymous,binding,scope}/`), and core runs each with
`maxStartDepth: 1`: a handler matches the direct children of a body and
recurses with `convert(capture(body), path)`. Wrappers that add depth
without a scope are reached through a per-tag `bypass` in `captureConfig`
(`bypassExport`). Named scopes are single nodes of type `"scope"` that serve
as both region and name.

That model cannot reach scopes nested inside expressions, which is why it
was replaced. Do not start a new plugin on it.
