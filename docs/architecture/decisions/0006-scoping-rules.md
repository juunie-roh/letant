# 6. Scoping Rules from the Language Specification

Date: 2026-11-11

## Status

Accepted

## Context

ADR 0005 states that plugins translate a language's syntax into scopes and
bindings, and that the language-specific rules are recorded with the plugin.
It does not say where those rules come from or how a plugin finds the syntax
they apply to.

Until now the plugins found constructs with tree-sitter queries gated to one
level of depth: a handler matched the direct children of a body, emitted a
node, and recursed into the next body. Queries were grouped by construct
(`anonymous/`, `binding/`, `scope/`), and a per-query "bypass" looked through
wrappers such as `export`. The depth of a match stood in for "its nearest
enclosing scope".

That stand-in holds only where a scope boundary sits directly above a
declaration, which is how statements are laid out. It fails where syntax adds
depth without adding a scope:

- A scope nested inside an expression (a callback, an object-literal method,
  a default-exported function) sits at an unbounded depth. A tree-sitter
  pattern has a fixed shape and no "any descendant" operator, so no finite
  set of gated patterns reaches it.
- Every wrapper that is not a scope (`export`, a label, `try`) needs its own
  bypass, per query. The list of such syntax has no end; the list of syntax
  that opens a scope is short and closed.
- The gate bounds where a match starts, not how often a node is matched, so
  nested blocks were captured twice.

The gate also encoded a habit rather than the language: which constructs got
a handler followed how the author writes code. Measured against
`eslint-scope` on 1,498 JavaScript files, the gated plugin agreed on at most
56% of references; in most of the rest the name was not found, and in some
it resolved to an outer variable of the same name.

## Decision

A plugin's scoping rules are taken from the language specification and
applied without regard to depth.

- **The specification is the source.** A plugin records its rules in a
  `SCOPING.md` beside its source: each rule, the section of the specification
  it comes from, the grammar's node types it maps to, and the rules the
  plugin declines to model. The grammar supplies node types, not scoping.
- **Four kinds of rule.**
  1. _Boundaries_ — which syntax opens a scope.
  2. _Binding forms_ — which syntax introduces a name.
  3. _Attachment_ — which scope a name goes into, where that is not its
     nearest boundary (hoisting, a declaration's own name).
  4. _References_ — which positions name a binding at all.
- **Scopes first, then bindings, at any depth.** Queries run over the whole
  file. One collects every boundary; another collects every binding form.
  Each binding walks up its parents to the nearest boundary, and the
  attachment rules adjust the result. Anything that is not a boundary is
  walked through, so wrappers need no special handling.
- **Queries are classified by what they establish** — scope, binding,
  reference — not by construct. What a query cannot express (which blocks
  merge into their parent, where `var` stops) is a rule in the plugin's code,
  next to the queries.
- **A scope is never a name.** A scope node's path segment is
  `<label>@<start>`, which cannot equal an identifier. Each name is its own
  binding node, and its `at` is the declaring identifier — the exact position
  ADR 0004 asks for. A member that is not lexically visible (a public class
  field or method) gets a scope-style segment for the same reason.
- **Core asks the plugin what a reference is.** `origin` resolves a position
  only if the plugin's `references` returns the node there. A property, a
  label, or the inside of a string shares its text with a name, not its role,
  and which is which differs by language and grammar.

`@letant/js` implements this decision. `@letant/ts` and `@letant/python`
still use the gated model and are to follow.

## Consequences

- For JavaScript, name resolution within a file now agrees with
  `eslint-scope` on every reference compared (440,975 across 1,501 files).
  That comparison, together with the plugin's resolution tests, is the
  acceptance check for changes to the rules.
- Agreement with another implementation is not agreement with the
  specification. Where both simplify the same way (Annex B function
  declarations), the comparison proves nothing; `SCOPING.md` records those
  choices.
- Core needed one change (the reference check). The containment tree and the
  outward walk of ADR 0003 and 0004 are unchanged, which shows the earlier
  inaccuracy came from extraction. It does not validate them beyond a single
  JavaScript file: cross-file exports are not modeled, and lookup rules that
  skip a scope (a Python class body seen from its methods) have no mechanism
  yet.
- Paths are less readable: `["main.js", "parse@12", "input"]` rather than
  `["main.js", "parse", "input"]`. Every scope within a file is of type
  `anonymous`; the `scope` type remains only for the file root and for
  plugins still on the gated model. Whether core keeps that distinction is
  open.
- Nodes for `if`, `else`, `while` and `do` are gone from the JavaScript tree,
  with the conditions they carried; only their braced bodies remain, as
  blocks.
- The per-construct handler, the depth gate and the bypass remain in core for
  the plugins that still use them, and can be removed once none does.
- Lookup is unchanged and scans a scope's children at each step. It is sized
  for pointed queries (ADR 0004), not for resolving a whole file at once.
