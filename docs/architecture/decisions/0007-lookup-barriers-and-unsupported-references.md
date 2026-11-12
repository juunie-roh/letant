# 7. Lookup Barriers and Unsupported References

Date: 2026-11-12

## Status

Accepted

## Context

ADR 0003 and 0004 resolve a name by walking outward from the innermost scope
and taking the first binding with that name. ADR 0006 kept that walk and
noted that "lookup rules that skip a scope (a Python class body seen from its
methods) have no mechanism yet".

Moving `@letant/python` to ADR 0006 made the gap measurable. Compared with
CPython's own `symtable` on the 3.14.7 standard library (1,583,449 positions
in 1,861 files), letant gave 341 wrong answers. 325 of them came from one
rule: a class's names are visible in the class body only, not in the methods,
lambdas, comprehensions and classes nested in it. In `_pydatetime.py`,
`def date(self): return date(self._year, …)` calls the module's class `date`;
letant answered with the method being defined.

A wrong answer is the one failure letant cannot afford. ADR 0004 describes
resolution as a railway with deterministic stops; a stop that is wrong
without saying so is what that design was meant to replace. ADR 0005 already
answers `undefined` rather than guess where resolution depends on run-time
values. Here the rule is decided by syntax, so it is in reach; the tree simply
could not express it.

The rule is not peculiar to Python. Checked on the compilers and interpreters
themselves (PHP and Elixir from their documentation):

| Language   | Code nested in a function or class does not see                                    | The rest of the outer scopes                  |
| ---------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Python     | a class's names, from the functions, lambdas, comprehensions and classes inside it | visible                                       |
| Ruby       | local variables outside a `def`, `class` or `module`                               | constants stay visible; blocks see everything |
| PHP        | every variable outside a function (without `global` or `use`)                      | —                                             |
| Elixir     | a module body's variables, inside `def`                                            | —                                             |
| Rust       | the enclosing function's `let` bindings and generics, from a nested `fn`           | items (`const`, `fn`) stay visible            |
| Swift, C++ | the enclosing function's locals, from a local type                                 | globals stay visible                          |

Java, C#, Kotlin, Go, Lua and Haskell resolve by plain nesting, and
JavaScript's class members are never bare names (ADR 0006). The cases in the
table share one shape: leaving certain scopes makes certain bindings further
out invisible, while other bindings in the same outer scopes stay visible.

Two smaller gaps surfaced with it:

- `Workspace.origin` could say "here", "in that file" or `undefined`, and
  `undefined` already meant three things: not a reference, a name no scope
  binds, and an import cycle. A plugin that knew the tree would answer a
  reference wrongly had no way to say so.
- Core looked a name up by the text at the position. Python reads
  identifiers in NFKC normal form, and inside `class K` the name `__x` is
  `_K__x`.

## Decision

The outward walk stays. It gains one rule, and the plugin gains two optional
functions.

- **Barriers.** A scope node may carry `barrier: true`, and a binding node
  `visibility: "local"`. `TreeCursor.resolve` walks outward as before; once
  it has left a barrier scope, it passes over local bindings in every scope
  further out. A scope that is not a barrier leaves the walk unchanged, and a
  lookup that starts in the scope holding a local binding still finds it.
  Both fields are optional: a plugin that sets neither gets the walk of
  ADR 0003.
- **The rule is data in the tree, not a call into the plugin.** A serialized
  tree resolves the same way without the plugin, and every query built on
  `resolve` follows the rule without knowing of it.
- **Core still knows no language.** Which scopes are barriers and which
  bindings are local is the plugin's statement of its language's rule,
  recorded in its `SCOPING.md`. Core does not read `kind`.
- **A plugin may decline a reference.** `Descriptor.unsupported(node)` returns
  the rule that keeps the tree from answering a reference correctly, or
  `undefined`. `origin` asks it for every reference, before resolving, and
  answers `{ unsupported: rule }` (the `Unsupported` type) without resolving.
  The test may decline more positions than necessary. It must not decline
  fewer: where the plugin knows of a wrong answer, it declines.
- **A plugin may name what a reference looks up.** `Descriptor.nameOf(node)`
  returns the name a reference stands for where that is not its text. The
  plugin emits bindings under the same name.

`@letant/python` uses all three (`packages/python/SCOPING.md`):

- Functions, lambdas, comprehensions and classes are barriers; the type
  parameter scope is not, because an annotation scope directly inside a class
  does see the class's names. Every binding of a class scope is local.
- Bindings are stored under the name Python uses (`_K__x`, NFKC), and
  `nameOf` gives the same name for a reference.
- `unsupported` declines the positions where the tree is still wrong, all for
  rules this decision does not cover: a name in a comprehension's first
  iterable that is also one of its targets, or whose comprehension sits in a
  class body; a `global` name declared in a function nested in another; and a
  type parameter's name in a default value.

Considered and not taken:

- _Core asks the plugin for the scope a position resolves in._ It would
  express every rule above, but it moves resolution into the plugins and
  makes the tree alone insufficient to answer a query.
- _Segments that cannot match a name_ (`name@start`, as for JavaScript's
  class members). A method could then never resolve to a class-level name,
  but neither could the class body, where `@x.setter` and one constant built
  from another are ordinary Python.
- _Deciding barriers in core from a node's `kind`._ It puts a language's rule
  into core.

## Consequences

- Python: on the same corpus letant now disagrees with `symtable` at no
  position. The 325 wrong answers of the class rule and the 10 of the
  naming rules resolve correctly, and the plugin declines 62 positions.
- Declining is deliberately broader than the wrong answers it prevents: of
  the 62 positions declined, the tree would have answered 51 correctly. The
  tests read syntax alone and do not ask whether another scope binds the
  name first. Making them exact needs the scopes' bindings at query time:
  the plugin keeping its analysis of each file, or core passing the tree to
  `unsupported`.
- The barrier made five positions worse before they were declined: the
  first iterable of a comprehension in a class body does see the class's
  names, but its region lies inside the comprehension. A rule that hides
  bindings exposes every place where a scope's region and its evaluation
  differ.
- `origin` has a fourth answer. A caller that took everything except
  `undefined` and a `NodeSource` for a cursor must now check for
  `Unsupported`. `undefined` still covers a position that is not a
  reference, an unbound name and an import cycle.
- JavaScript and TypeScript set none of this and resolve as before:
  `@letant/js` still agrees with `eslint-scope` on every reference of a
  150-file sample (19,263 references).
- Within a file, the Python rules that remain inexpressible are now declined
  or unanswered, not wrong. A scope whose region is not one range (a
  parameter's own name in the header, a comprehension's first iterable) and
  a `global` name that skips enclosing functions still need a mechanism.
  Across files nothing changed: exports and module-valued imports are not
  modeled (ADR 0006), and an import can still be followed to the wrong
  place.
- Visibility is per binding, so one scope can hold both kinds (Ruby's locals
  and constants). A language in which different barriers hide different
  bindings would need more than one flag; none of the plugins needs it.
- ADR 0003's statement that resolution is a walk over containment now has an
  exception, and it is in the data model: two optional fields on `Node`.
- The experimental `trace` lists declined references under their rule.
