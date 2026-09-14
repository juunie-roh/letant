# 5. Acquisition as the Problem Scope

Date: 2026-09-14

## Status

Accepted

## Context

The README and CLAUDE.md describe letant as a "structural code comprehension
tool". ADR 0004 already states something narrower: letant "focuses only on
positional acquisition". The design decisions followed the narrower
statement — forward-only lookup, a bare position as the answer, no metadata
narration, no ranking, one level of disclosure — while the self-description
kept the broader one. Judged as comprehension, those decisions read as
missing features; judged as acquisition, they are the definition.

Reading code interleaves two activities:

- **Acquisition** — locating where a name at a position was bound.
- **Interpretation** — working out what the code at that location means.

The usual method (read, grep, triage candidates) performs acquisition through
interpretation: choosing among grep hits, judging enclosure by indentation,
filtering re-declarations by hand, counting lines from unnumbered excerpts.
Its errors are silent. A probe of `three.module.js` L9608 resolved all six
names in one call and returned exact lines; the same task by reading and
grep took three calls, surfaced 176 undifferentiated hits for `renderer`,
misplaced four of six declarations by one or two lines, and had to rule out
identical declaration text in unrelated scopes (L17701, L17716, a second
`renderObject` at L17953). In the same file `i` is bound in 95 distinct
scopes with 720 grep hits; all 360 sampled references resolved to a binding
in an enclosing scope.

The two activities are separable because of lexical scoping. What a name
refers to is fixed by where it is written, before the program runs; the
language itself must settle it without interpretation. The scope/binding
structure letant extracts is therefore not an approximation of the code — it
is the model name resolution runs on (lexical environments in a language
specification, symbol tables in a compiler). letant replays that resolution
rather than inferring it, which is why the answer needs no justification
attached (ADR 0004).

## Decision

letant's problem is **acquisition**: given a position, return where the name
there was bound, computed on the scope/binding model extracted from syntax.
Interpretation is out of scope.

- **Mechanism.** Every step of acquisition is decided by syntax:
  1. A language plugin parses the source and captures scope boundaries and
     name bindings — nothing else.
  2. Core stores them as a containment tree addressed by name paths
     (ADR 0003).
  3. A query locates the innermost scope containing the position, then walks
     outward through enclosing scopes until a binding of that name is found —
     the same lookup the language performs.
  4. The walk ends in a position, a frontier, or a terminal (ADR 0004).

  No step ranks candidates, estimates likelihood, or reads meaning into the
  code.
- **Admission test.** A construct belongs in the model if and only if its
  name resolution is determined by syntax alone. Anything else is a terminal,
  not a gap.
- **Runtime-dependent behavior cannot be solved by this mechanism.** The
  mechanism reads syntax and nothing else, so it has no access to what is
  known only while the program runs: the binding of a call-site receiver, the
  value or type of an object whose members are accessed, scope constructed or
  altered at run time, module specifiers computed from values. For these the
  source text does not contain the answer, and no refinement of capture or
  resolution can recover it without executing or inferring about the program
  — which is interpretation. This is a boundary of the approach, not a
  shortcoming of an implementation; such positions end in a terminal.
- **Answers stay forward-only.** "Who uses this" is a cartographic question,
  already served by existing tools, and is not taken.
- **The model is language-independent; syntax is not.** Plugins translate a
  language's syntax into scopes and bindings, including the choice of
  attachment scope (ADR 0003). Core computes on the model and knows no
  language. Language-specific scoping rules — and which of them a plugin
  declines to model — are recorded with the plugin, not here.

## Consequences

- **Success is measured on chains, not on coverage of declarations.** The
  metric is the fraction of reference positions that yield a complete answer.
  A census of declarations present in the tree measures a map, which letant
  does not claim to be.
- **A missing scope boundary severs a lineage.** Traversal descends only
  through captured scopes, so an uncaptured construct removes its entire
  subtree from resolution, at any depth. Completeness of scope-boundary
  capture takes priority over breadth of binding kinds.
- **Acquisition becomes auditable.** The sequence of `(position → address)`
  pairs a reader followed is a replay-able record of what was looked up —
  and, by omission, of what was assumed. Because answers are positional
  fixtures, replaying the record after an edit separates two cases: the
  address resolves but its range moved (excerpts held are mis-located), or
  the address no longer resolves (conclusions drawn from it are invalid).
  letant holds no exploration state (ADR 0004); the record is client-owned.
- **Positioning follows the definition.** Project descriptions should state
  acquisition as what letant does, with comprehension as the outcome it
  serves. letant sits beneath interpretation tools, human or automated, and
  does not compete with them.
- **New languages are translations, not new tools.** Differences in scoping
  rules between languages become placement rules in each plugin; core is
  unchanged.

## Open Questions

- **Terminal kinds.** ADR 0004 defers naming terminals as minor. Under this
  decision a lineage must end legibly: leaving the workspace, reaching a
  name outside the model, and a construct the plugin failed to capture
  currently all return `undefined` and demand different responses. Whether
  this is still minor is to be decided.
- **Entry points.** A file's top-level disclosure can be large (518 children
  for `three.module.js`). Narrowing it requires ranking, which acquisition
  excludes; whether the entry point is the source-ordered index or a client
  concern is undecided.
- **Batch shape.** Resolving every reference in a reader's visible range is
  bounded by attention rather than by scope, unlike the removed
  all-references-upfront `trace`. Whether it becomes part of the interface is
  undecided.
