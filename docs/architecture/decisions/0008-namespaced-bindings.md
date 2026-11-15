# 8. Namespaced Bindings

Date: 2026-11-15

## Status

Accepted

## Context

Every decision so far assumes that a scope binds a name once. ADR 0002 makes
the path the durable identity of a node, and `[filePath, name]` the identity
across files. ADR 0003 derives the tree from paths. ADR 0006 gives a binding
its name as the last segment of its path. `Tree.addNode` followed from that:
of two nodes with one path it kept one.

JavaScript and Python hold to the assumption. TypeScript does not. A name
there has up to three meanings (a value, a type, a namespace), and one scope
may declare it once in each:

```ts
interface Shape {
  area: number;
} // Shape, a type
const Shape = { unit: { area: 1 } }; // Shape, a value

const a: Shape = Shape.unit; // the first, then the second
```

Which declaration a reference names is decided by where it is written: after
a colon it is a type, in an expression a value, before a dot in a type a
namespace. The decision is made by syntax alone, so ADR 0005 puts it in
reach. The earlier `@letant/ts` did not meet the problem because it emitted
no type declarations at all. Moving it to ADR 0006 brought interfaces, type
aliases, type parameters, enums and namespaces into the tree, and with them
two failures of a tree keyed by path:

- **A declaration is lost.** The interface and the constant above have the
  same path. One of them is not in the tree, and a reference to it lands on
  the other.
- **A scope answers for a meaning it does not bind.** The walk of ADR 0003
  stops at the first scope that binds the name. A type parameter `T` of a
  function then answers a value reference to an outer `const T`, where the
  compiler passes the function and continues outward.

Both are wrong answers given without notice, which ADR 0007 names as the one
failure letant cannot afford.

Measured by replaying each lookup without regard to meaning (the nearest
scope that binds the name at all, and its first binding), against the tree as
it is now:

|                                                  | 964 files of the workspace's dependencies | This repository (61 files) |
| ------------------------------------------------ | ----------------------------------------- | -------------------------- |
| Names one scope binds in more than one meaning   | 136, in 70 files                          | 8, in 6 files              |
| References compared                              | 57,375                                    | 6,922                      |
| Landing on another declaration                   | 110                                       | 3                          |
| — the other binding of the same scope            | 107                                       | 3                          |
| — a nearer scope that binds another meaning      | 1                                         | 0                          |
| — a binding where the meaning asked for has none | 2                                         | 0                          |

The dependencies are a sample of 1,000 files; the grammar rejects 36 of them.
References the plugin declines are left out of both columns.

The rate is low, about two references in a thousand, and none of them is
marked in any way. They come from ordinary declarations: an interface beside
the `var` that holds its constructor (the web globals of `@types/node`), a
type alias beside a function or constant of its name (this repository's
`NodePath` and its constructor), a namespace beside a value.

The shape is not TypeScript's alone. By their language definitions (not
checked on a compiler here): C keeps `struct`, `union` and `enum` tags apart
from ordinary identifiers; Haskell allows `data T = T`, a type and a
constructor; Rust has a type, a value and a macro namespace; Java decides
between a type, a variable and a method of one name by context. In each, one
scope binds one name several times, and the position of a reference chooses.

ADR 0007's means do not cover it. A barrier hides a binding from a lookup
that comes from a certain place; here the lookup comes from the same place
and differs in what it asks for. `nameOf` could keep the meanings apart only
by storing some of them under a name that is not the declared one.

## Decision

A binding may be bound in a _space_, and a lookup names the spaces it is
made in. The outward walk stays.

- **A binding carries its space.** `Node.space` is an optional string on
  binding nodes. Left out, the name is a value. A scope node has no space.
- **Path and space together identify a node.** Two bindings of one name in
  one scope have the same path and differ in their space only. A name keeps
  one spelling: nothing is added to the segment.
- **A lookup lists spaces, in order of preference.**
  `TreeCursor.resolve(name, spaces)` walks outward as before. A scope answers
  with its binding of the name in the earliest listed space, and a scope that
  binds the name in none of them is passed. Without `spaces` the lookup is
  for a value, so a plugin that sets no space resolves as it did.
- **The plugin says which spaces a reference is looked up in.**
  `Descriptor.spacesOf(node)` is optional and asked for a node `references`
  returned, like `nameOf` and `unsupported`. `Workspace.origin` passes its
  answer to `resolve`, in the file and in every file an import leads to.
- **Core knows no language's spaces.** A space is the plugin's string; core
  compares it for equality and knows one default, `"value"`. Which spaces a
  language has is recorded in the plugin's `SCOPING.md`.
- **A declaration is in exactly one space.** A declaration with several
  meanings (a class is a value and a type) is not emitted once per meaning.
  It gets a space of its own, which every reference asking for one of its
  meanings lists. A reference to a class from an expression and from a type
  annotation lands on the same node.
- **The rule is data in the tree**, as in ADR 0007: the space is stored with
  the binding and `resolve` applies it. What the tree does not hold is the
  meaning a position asks for; that is read from syntax by the plugin.

`@letant/ts` uses it (`packages/ts/SCOPING.md` §2). It has six spaces besides
value, one for each set of meanings a declaration can have: `type`, `class`
(value and type), `enum` (all three), `namespace`, `module` (namespace and
value) and `alias` (an import, whose meanings are those of what it imports).
A value reference is looked up in value, `class`, `enum`, `module`, `alias`;
a type reference in `type`, `class`, `enum`, `alias`.

Considered and not taken:

- _Mangled names through `nameOf`._ The type side would be stored under
  another name, and a class would be two bindings under two names. A name in
  letant is what identifies a declaration to its user; one declaration with
  several names gives that up.
- _A suffix on the segment_ (`Shape-type`). It keeps the path as the whole
  identity, and puts something into the name that is not in the source. Every
  consumer of a path would have to know how to take it off again.
- _One tree per space._ No node changes, but a class belongs in two trees, a
  lookup for `export { x }` asks all of them, and scopes are repeated in each.
- _Meanings known to core_ (value, type, namespace as an enumeration). It
  puts TypeScript's model into core; C's tags or Rust's macros would need
  another change there.

## Consequences

- TypeScript: compared with the compiler (`pnpm ts compare`, `typescript`
  6.0.3, run of 2026-11-13) on 4,906 files of the workspace's dependencies,
  letant agrees on 172,786 of 174,134 references, declines 1,348 and
  disagrees on none. On this repository it agrees on 7,841 of 7,881 and
  declines 40.
- JavaScript and Python set no space and resolve as before. On the runs of
  2026-11-14, `@letant/js` agrees with `eslint-scope` on 19,263 of 19,263
  references in 150 files, and `@letant/python` disagrees with `symtable` at
  no position in 300.
- ADR 0002's "the path is the durable identity" and ADR 0004's
  `[filePath, name]` across files now hold for values only. Elsewhere the
  identity is the path and the space.

Core changed in these places:

- **`Node`** (`src/models/global.ts`). `space?: string` on a binding;
  excluded on a scope.
- **`Tree`.** The intern key of ADR 0002 is the path for a value and the
  path with the space otherwise, so trees without spaces intern as before.
  `id` and `getNode` take a space; `addNode` and `removeNode` use the node's.
  `addNode` deduplicates by path and space. `children(path)` can now return
  one path more than once, so `childNodes(path)` was added to return the
  nodes. `topLevelNames` lists a name once, however many spaces bind it.
- **`TreeCursor`.** A cursor at a binding that is not a value is constructed
  with its space, and `children` does so. `resolve` takes `spaces`. Barriers
  are applied first: a local binding is passed over in every space once a
  barrier has been left.
- **`Workspace`.** `origin` asks `spacesOf` after `unsupported` and `nameOf`.
  Following an import, it no longer builds `[file, name]` and fetches the
  node; it resolves the name at the root of the file the import names, in the
  same spaces. A type reference through an import therefore lands on the
  type of that file, and a value reference to a name the file binds only as
  a type answers `undefined`. `trace` passes the spaces as well.
- **`Plugin.Descriptor`.** `spacesOf` is the fourth optional function, after
  `nameOf` and `unsupported`.

What follows for callers and plugins:

- A path alone no longer addresses every node. `getNode(path)` and
  `resolve(name)` without a space see values only: in a TypeScript file they
  do not find a class, whose space is `class`. A caller needs the node's
  space, or the plugin's `spacesOf` for the position it asks about.
- The number of spaces is the number of sets of meanings, not of meanings:
  three meanings give TypeScript six spaces. A language where the sets
  multiply would be served badly by this.
- A position that asks for any meaning (`export { x }`) lists every space and
  gets one answer, the first space that binds the name, values first. Where a
  scope binds the name in two meanings, the other is not reported.
- An import's meanings are in another file, so `@letant/ts` lists `alias` in
  every lookup. Within the importing file a value reference to a type-only
  import resolves to the import, where the compiler finds nothing. It is
  corrected only when the import is followed into an opened file.
- Several declarations of one name in one space are still one node. Where
  the compiler merges them (two interfaces, a class and a namespace), the
  plugin declines the references through `unsupported`: the 1,348 and 40
  positions above. Merging is the compiler's work and stays out of range.
- `resolve` does more at each scope: it collects the children with the name,
  then searches them once for each listed space. It still scans a scope's
  children at every step (ADR 0006).
- ADR 0003's walk over containment has a second exception in the data model,
  after ADR 0007's two fields: one optional field on a binding.
