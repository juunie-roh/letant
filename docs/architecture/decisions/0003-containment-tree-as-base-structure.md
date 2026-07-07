# 3. Containment Tree as the Base Structure

Date: 2026-07-06

## Status

Accepted

## Context

`Graph` currently stores two parallel representations of containment: node
paths (`NodePath` scope chains, used by `parent()` and `depth()`) and stored
edges (`defines`, `imports`, used by `children()`). They must agree, but
nothing enforces it — the first plugin that emits a non-containment edge
silently breaks cursor traversal, and a plugin can emit an edge that
contradicts its own paths.

The containment relation is inherently a tree:

- Scope intervals from a tree-sitter parse are strictly nested or disjoint.
  Byte-offset ranges of distinct scope constructs cannot tie, because an
  enclosing scope always owns at least one delimiter byte its inner scope
  does not.
- Every node has exactly one semantic parent. Cases where syntactic and
  semantic containment diverge (hoisting, `global`/`non-local`) are resolved
  by the plugin choosing the attachment scope — still exactly one parent.

Relational facts — references, cross-file provenance — are not tree-shaped
and cannot be forced into one.

Two alternatives were considered and rejected:

- **General graph as the base**: the right shape for heterogeneous
  many-to-many relations, but the base relation here is containment,
  which is laminar. Storing it as a graph created the dual source of truth above.
- **Pure object-identity tree** (nodes as objects, children keyed by
  segment, no paths): dissolves encoding entirely, but plugin-emitted edges
  identify nodes by path — an external party cannot name an object identity
  that core has not built yet. Any addressing layer added to fix this
  reintroduces path-keyed lookup.

## Decision

The base structure is a single-parent typed tree. The graph is a projection
of it — a traversed output — not the store.

- **Containment is derived, not stored.** Children come from a
  parent-prefix index over `NodePath`s (interned per ADR 0002); the tree
  invariant — every non-root node's parent path exists — is enforced at
  construction.
- **Parent→child edge kinds are attachment annotations on the child.** In a
  tree the incoming edge is unique, so `(parent, child, kinds)` carries no
  information beyond `(child, kinds)`. Cursor traversal
  filters on attachment kind.
- **Stored `Edge` is reserved for relational facts** that are genuinely not
  tree-shaped: references, and cross-file provenance at the workspace layer
  keyed by `[filePath, name]` (only root-level names are referable across
  files).
- **Serialized output remains a graph figure.** Containment edges are
  regenerated from the tree during serialization; relational edges are
  appended. The output schema does not change.
- **Position lookup stays runtime descent** over full scope intervals,
  half-open `[start, end)` matching tree-sitter semantics. A parent's
  "own" region is whatever no child claims — an emergent answer to a
  query, never a stored value.

## Consequences

- The dual source of truth is eliminated; a plugin can no longer emit a
  graph that contradicts its own paths, and traversal semantics cannot be
  broken by new edge kinds.
- Plugin contract: paths are the tree, non-negotiable; extensibility lives
  in attachment kinds and the relational edge vocabulary. Existing plugins
  keep emitting `{nodes, edges}` — core interprets a parent→direct-child
  edge as an attachment annotation and anything else as relational, so no
  descriptor break is required.
- `GraphCursor`'s public semantics (`parent`, `children`, `closest`,
  `resolve`, `at`) are unchanged; they were already pure tree operations.
- The Workspace-boundary snapshot test pins the serialized graph figure
  across this restructuring.
- Interval indexing (`GraphIndex`) remains deferred; when needed, it is a
  derived, re-buildable index over scope nodes only, mapping intervals
  many-to-one to nodes (declaration merging yields one node with several
  intervals).

> **Note (2026-07-07):** the relational-edge reservation above was vacated
> by ADR 0004 — provenance is enacted via positions and references are
> computed on demand, so the implementation stores no edges at all. `Edge`
> was removed from the project entirely: `children()` derives from a
> children index over interned paths, attachment kinds proved derivable
> from node data (`imports` ⟺ source-shaped `at`), and the cursor's
> `children` filter takes a node type (`scope`/`anonymous`/`binding`)
> instead of an edge kind.
