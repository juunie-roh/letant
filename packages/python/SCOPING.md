# Python scoping reference — `@letant/python`

This document lists the rules of the Python Language Reference that decide where a name is bound, maps each one to tree-sitter-python nodes, and records what the plugin does. The plugin's **boundary set**, **attachment rules** and **reference rules** come from here. §7 lists the rules that are decided by syntax but that the core model cannot express yet.

| | |
| --- | --- |
| Spec | The Python Language Reference, 3.15.2, [docs.python.org/3/reference][spec], read 2026-11-11. Section numbers change between versions; the anchors in the links do not. |
| Grammar | tree-sitter-python 0.25.0, `node_modules/tree-sitter-python/src/node-types.json`. Fields are written `field:`; "unfielded" means a positional child. Every shape claim was checked against a real parse. |
| letant | The scoping rewrite of 2026-11-11 (`src/queries/scoping/`, `src/scoping/`). Checked against CPython 3.14.7's own `symtable` on its standard library (see [Acceptance](#acceptance)) and by `__tests__/resolution.test.ts`. Links are relative to `packages/python/`. |
| Status | **OK** matches the spec · **DIFF** differs · **MISSING** not handled · **MISFIT** decided by syntax, but core cannot express it (§7) |

**In scope:** the names bound by the constructs of [4.2.1][binding].

**Excluded:**

- Whether a name is bound *yet*. `UnboundLocalError`, an `except … as` target deleted at the end of its clause, `del`, and a class body reading a global before its own assignment has run are run-time facts. They never change which block a name belongs to: "If a name binding operation occurs anywhere within a code block, all uses of the name within the block are treated as references to the current block" ([4.2.2][resolution]).
- Attributes and subscripts (`self.x`, `module.x`, `d[k]`). They depend on the receiver (§6).
- Builtins. A name no block binds ends in a terminal.

Two facts the rest of this document relies on:

- **Lookup does not depend on position inside a block.** The quotation above makes a block's locals a property of the whole block, so order only matters at run time. letant's `resolve` also ignores position ([cursor.ts](../../src/core/tree/cursor.ts)): **OK**.
- **In letant, a path segment is a binding.** `resolve(symbol)` matches `child.name === symbol` across *all* children, scopes included. The plugin therefore gives every scope a `label@start` segment, which can never equal an identifier; only real bindings carry a bare name.

**Terms:**

- *Block* means a module, a function body or a class definition ([4.1][structure]).
- *Function-like scope* means a function, a lambda, a comprehension or a type parameter scope: a scope whose names the scopes nested inside it can see. A class scope is not function-like (§4).

## 1. Boundaries

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| Module: one scope per file | [4.1][structure] | `module` | — | **OK**: core adds the file root ([plugin.ts](../../src/core/plugin.ts) `extract`) |
| Function definition: the body is a block and the parameters are its locals. The function's own name, its decorators, default values and annotations are evaluated in the enclosing scope | [8.7][funcdef] | `function_definition` (`name:`, `type_parameters:`, `parameters:`, `return_type:`, `body: block`) | Decorators are siblings, under `decorated_definition`. An `async def` is the same node with an anonymous `async` token | **OK** for the body, at any depth ([scope.scm](src/queries/scoping/scope.scm)). The scope's region is the body ([rules.ts](src/scoping/rules.ts) `regionOf`), so the parameter names lie outside it: **MISFIT** M2 |
| Lambda: a function whose body is one expression | [6.14][lambda] | `lambda` (`parameters: lambda_parameters`, `body:`) | `parameters:` is absent for `lambda: 0` | **OK**; parameter names as above |
| Class definition: the class body is a block. Base classes, keywords and decorators are evaluated in the enclosing scope | [8.8][classdef] | `class_definition` (`name:`, `type_parameters:`, `superclasses: argument_list`, `body: block`) | — | **OK** as a scope whose region is the body. Its names are also visible from the scopes nested in it: **MISFIT** M1 |
| Comprehensions and generator expressions: an implicitly nested function scope. The iterable of the first `for` is evaluated in the enclosing scope | [6.2.6.2][comprehension], [6.2.7][genexpr] | `list_comprehension`, `dictionary_comprehension`, `set_comprehension`, `generator_expression` (`body:`, then `for_in_clause` (`left:`, `right:`) and `if_clause` children) | The first iterable sits in the middle of the node, between the element and the later clauses | **OK** as a scope over the whole node; the first iterable cannot be left out: **MISFIT** M2 |
| Type parameter list: an annotation scope that wraps the generic function, class or type alias. Annotations, base classes and the alias value see the type parameters; default values and decorators do not | [4.2.3][annotation], [8.10][typeparams] | `type_parameter`, as `function_definition type_parameters:`, `class_definition type_parameters:`, or `type_alias_statement left: type` > `generic_type` | The same node type is the subscript of `list[int]` inside an annotation. The list of an alias is nested two levels below the statement | **OK**: a `generic@N` scope from the `[` to the end of the definition, with the function or class scope inside it. A default value written inside that region sees the type parameters: **MISFIT** M2 |
| Other annotation scopes (annotations, the value of a type alias, bounds and defaults of type parameters): they introduce no name, and their names are looked up as if used in the enclosing scope, an enclosing class included | [4.2.3][annotation], [4.2.4][lazy], [8.11][annotations] | `type` nodes | — | **OK**: no node; the position resolves in the enclosing scope |
| Compound statements open no scope: "Each assignment or import statement occurs within a block defined by a class or function definition or at the module level" | [4.2.1][binding] | `if_statement`, `for_statement`, `while_statement`, `try_statement`, `with_statement`, `match_statement` and their clauses; `block` | `block` is the body of every statement, a function and a class alike | **OK**: not listed, so walked through |

## 2. Binding forms

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| Assignment target | [7.2][assignment] | `assignment left:` — `identifier`, `pattern_list`, `tuple_pattern`, `list_pattern`, `list_splat_pattern` | `a = b = 1` nests the second assignment in `right:`. `(a) = 1` parses as a one-element `tuple_pattern`. `attribute` and `subscript` targets bind nothing | **OK** ([binding.scm](src/queries/scoping/binding.scm), [utility/pattern.ts](src/scoping/utility/pattern.ts)) |
| Augmented assignment | [7.2.1][augassign] | `augmented_assignment left:` | — | **OK** |
| Annotated assignment. With a value it assigns. Without one, a bare name is still local to its block; a parenthesized name is not | [7.2.2][annassign] | `assignment` with `type:`, with or without `right:` | The reference states the rule for function scope. CPython applies it to every block (P4) | **OK** |
| Assignment expression | [6.12][walrus] | `named_expression name:` | — | **OK**; attachment in §3 |
| `for` target, in the statement and in a comprehension | [8.3][for], [6.2.6.2][comprehension] | `for_statement left:`, `for_in_clause left:` | Same target shapes as an assignment | **OK** |
| `with … as` target | [8.5][with] | `with_item value: as_pattern alias: as_pattern_target` | The target is parsed as an expression (`tuple`, `list`, `list_splat`). A single parenthesized item, `with (a as b):`, puts the `as_pattern` under a `parenthesized_expression` | **OK** |
| `except … as` target, `except*` included | [8.4.1][except] | `except_clause value: as_pattern alias: as_pattern_target` | — | **OK** |
| `match` captures: capture, `as`, star and double-star patterns. `_` binds nothing | [8.6.4.4][capture], [8.6.4.2][aspattern], [8.6.4.5][wildcard] | Capture: `case_pattern` > `dotted_name` with one `identifier`. In a class pattern's keyword: `keyword_pattern` > `identifier` (the attribute), `dotted_name`. `as`: `as_pattern` > `case_pattern`, unfielded `identifier`. Star: `splat_pattern` > `identifier` | A `dotted_name` with two or more segments is a value pattern, a reference. A wildcard is a `case_pattern` with no child | **OK** |
| `del` target: "also considered bound" | [4.2.1][binding], [7.5][del] | `delete_statement` > `identifier`, `expression_list`, `tuple` | — | **OK** |
| Parameters | [8.7][funcdef] | Children of `parameters` / `lambda_parameters`: `identifier`, `default_parameter` (`name:`, `value:`), `typed_parameter` (first child, `type:`), `typed_default_parameter`, `list_splat_pattern`, `dictionary_splat_pattern` | `positional_separator` (`/`) and `keyword_separator` (`*`) bind nothing. `*args: int` is a `typed_parameter` holding a `list_splat_pattern` | **OK** ([utility/parameter.ts](src/scoping/utility/parameter.ts)) |
| Function and class name | [8.7][funcdef], [8.8][classdef] | `function_definition name:`, `class_definition name:` | — | **OK**: a binding in the enclosing scope, separate from the scope node |
| Type alias name | [7.14][typestmt] | `type_alias_statement left: type` > `identifier`, or > `generic_type` > `identifier` | **Grammar gap:** a statement that starts with a call of the builtin, `type(x).attr = v`, also parses as a `type_alias_statement`, and its `type` is then a keyword, not an `identifier` (19 places in the standard library). No name is bound, and that `type` cannot be resolved | **OK** |
| Type parameters | [8.10][typeparams] | `type_parameter` > `type` > `identifier`, or > `constrained_type` > `type` > `identifier` (`T: bound`), or > `splat_type` > `identifier` (`*Ts`, `**P`) | **Grammar gap:** a default, `[T = int]` (3.13), parses to `ERROR`, so letant rejects the whole file with `CORE_SYNTAX_ERROR` | **OK**; the gap remains |
| `import a.b.c` binds `a`; `import a.b.c as d` binds `d`; `from m import n as k` binds `k` | [7.11][import] | `import_statement name:`\* and `import_from_statement` (`module_name:`, `name:`\*); each name is a `dotted_name` or an `aliased_import` (`name:`, `alias:`). A relative module is a `relative_import` (`import_prefix`, optional `dotted_name`) | **Grammar gap:** `lazy import` (3.15) parses to `ERROR` | **OK** for the names bound. What they land on: **DIFF** (M5) |
| A future statement also binds the feature name | [7.11.2][future] | `future_import_statement name:` | `__future__` is an anonymous token | **OK** |
| `from m import *` binds every public name of `m` | [7.11][import] | `wildcard_import` | Module level only | **MISSING**: binds nothing (M5) |
| Names nothing declares: `__class__` in a method (and the cell behind `super()`), the module's `__name__`, `__file__`, `__doc__`, and builtins | [4.2.2][resolution], [4.2.5][builtins] | plain `identifier` | — | **MISSING**: unresolved, a terminal |

`global` and `nonlocal` are not binding forms: they move a name to another scope (§3).

## 3. Attachment (where a name does not simply go to the nearest block)

| Rule | Spec | Node types / fields | letant today |
| --- | --- | --- | --- |
| The name of a function, class or type alias goes to the scope the definition is in — for a generic one, outside its own type parameter scope | [8.7][funcdef], [8.10][typeparams] | `name:`, `type_alias_statement left:` | **OK** ([extract.ts](src/scoping/extract.ts) `binding.declaration`) |
| Parameters go to the function or lambda; type parameters to the type parameter scope | [8.7][funcdef], [8.10][typeparams] | `parameters`, `lambda_parameters`, `type_parameter` | **OK** |
| A name bound in a default value or a base class goes to the enclosing scope. Only an assignment expression can bind there | [8.7][funcdef], [8.8][classdef] | `default_parameter value:`, `class_definition superclasses:` | **OK** ([rules.ts](src/scoping/rules.ts) `isOutsideOf`) |
| An assignment expression inside a comprehension binds in the scope that contains the outermost comprehension, honoring a `global` or `nonlocal` there | [PEP 572][pep572] | `named_expression` | **OK** |
| `global x`: every binding form of `x` in the block binds the module's `x`, and the statement applies to the whole block | [7.12][global], [4.2.2][resolution] | `global_statement` > `identifier` | **OK** for where the name is bound. Reading it past an enclosing function that binds the same name: **MISFIT** M3 |
| `nonlocal x`: binding forms of `x` in the block rebind the `x` of the nearest enclosing function | [7.13][nonlocal] | `nonlocal_statement` > `identifier` | **OK**: no node in the block, so lookup walks outward |
| A name bound more than once in a block is one binding | [4.2.1][binding] | — | **OK**: one node, at the first binding form in the source (P3) |
| An import binds in the block the statement is in | [7.11][import] | `import_statement` anywhere | **OK** |

## 4. Lookup and references

| Rule | Spec | Node types / fields | letant today |
| --- | --- | --- | --- |
| Default: search the block, then every enclosing function-like scope outward, then the module, then builtins | [4.2.2][resolution] | `identifier` | **OK** ([cursor.ts](../../src/core/tree/cursor.ts) `resolve`); builtins are a terminal |
| "The scope of names defined in a class block is limited to the class block; it does not extend to the code blocks of methods", nor to comprehensions, lambdas and nested classes | [4.2.2][resolution] | everything nested in `class_definition body:` | **MISFIT** M1: a nested scope sees the class's names |
| An annotation scope directly inside a class does see the class's names | [4.2.3][annotation] | `type` in a class body, a method's annotations | **OK** today, because nothing hides the class scope. A mechanism for M1 must keep it |
| Default values, decorators, base classes and annotations are resolved where the definition is, not inside it | [8.7][funcdef], [8.8][classdef] | `default_parameter value:`, `type:`, `return_type:`, `decorator`, `superclasses:` | **OK**: they lie outside the scope's region |
| A parameter is declared in the function, but its name is written before the body | [8.7][funcdef] | names in `parameters` | **MISFIT** M2: the position is not offered as a reference, so it resolves to nothing rather than to an outer name |
| The first iterable of a comprehension is resolved outside the comprehension | [6.2.6.2][comprehension] | first `for_in_clause right:` | **MISFIT** M2: a name there that equals a target resolves to the target |
| A name declared `global` is resolved in the module, past any enclosing function | [4.2.2][resolution] | — | **MISFIT** M3 |
| Inside a class, `__name` is looked up as `_Class__name`. Names are converted to NFKC normal form while parsing | [6.2.2.1][mangling], [2.3.4][identifiers] | `identifier` | **MISFIT** M4: core looks up the text as written |
| Positions that are not references must not resolve: an attribute after `.`, a keyword argument's name, a class keyword (`metaclass=`), the attribute in a class pattern (`Point(x=…)`), every segment of a dotted name after the first, the module path of an import and the imported side of `import … as`, the inside of a string | — | `attribute attribute:`, `keyword_argument name:`, `keyword_pattern` first child, `dotted_name` after its first child, `aliased_import name:`, `relative_import`, `import_from_statement module_name:`, `member_type` | **OK**: the grammar types all of them `identifier`, so `isReference` decides by parent and field ([rules.ts](src/scoping/rules.ts)) |
| A string annotation (`x: "Tree"`) names a type by a convention of typing tools, not by the language | [8.11][annotations] | `type` > `string` | Not resolved (§6) |

## 5. Boundary set

| Node type | Opens | Region (`at`) |
| --- | --- | --- |
| `module` | the module scope | the file root, created by core |
| `function_definition`, `lambda` | a function scope: the parameters and the body's locals | the body. The header is evaluated outside (M2 for the parameter names) |
| `class_definition` | a class scope | the body |
| `list_comprehension`, `dictionary_comprehension`, `set_comprehension`, `generator_expression` | a comprehension scope: the `for` targets | the whole node (M2 for the first iterable) |
| `type_parameter` of a function, class or type alias | a type parameter scope | from the list to the end of the definition |

**Not boundaries:** every compound statement and its clauses, `block`, `decorated_definition`, `parameters`, `argument_list`, `type`. Anything not listed is walked through.

**Tree parent.** Positions descend through the tree by range, so a scope's parent is the scope whose region contains it ([extract.ts](src/scoping/extract.ts) `container`). That is the scope it is evaluated in, except for a scope written in a comprehension's first iterable (M2).

## 6. Out of reach (ADR 0005)

| Construct | Why |
| --- | --- |
| `exec`, `eval`, `compile` | They bind and read names from strings built at run time ([4.2.6][dynamic]) |
| `globals()`, `locals()`, `vars()`, `setattr(module, …)` | A namespace written through an object |
| Attribute access, `self.x` and `cls.x` included | Depends on the receiver. A class's names are reached this way from its methods, which is why M1 matters |
| Builtins and names the interpreter injects | The `builtins` module is a run-time object and can be replaced ([4.2.5][builtins]) |
| Which file an absolute import names | Decided by `sys.path`, which the host sets |
| `__all__` | A run-time list; it decides what `from m import *` binds |
| String annotations | Evaluated by typing tools, if ever |
| `importlib.import_module(name)`, `__import__` | The module is computed |

## 7. What does not fit the core model

Each rule below is decided by syntax alone, so ADR 0005 admits it, but the core model has no way to express it. Each is pinned by a test in the last block of [`resolution.test.ts`](__tests__/resolution.test.ts) that fails today (`it.fails`) and must pass once core can express the rule. "Standard library" counts are from the [acceptance](#acceptance) run.

**M1 — A scope whose names its nested scopes cannot see.**

- Rule: a class's names are visible in the class body only ([4.2.2][resolution]). A method, lambda, comprehension or nested class inside it skips the class and continues in the scope around it. An annotation scope directly inside the class is the exception: it sees them ([4.2.3][annotation]).
- Core: `resolve` walks every ancestor. The tree that positions descend through is also the lookup chain.
- Today: class-level names are bindings of the class scope, so the class body resolves them (`@x.setter`, one constant built from another). A nested scope that uses a bare name the class also binds gets the class's binding, which is wrong. In the standard library's `_pydatetime.py`, the method `datetime.date` is `def date(self): return date(self._year, self._month, self._day)`: the `date` it calls is the module's class, and letant answers with the method itself.
- Standard library: 325 wrong answers.
- Needs: a way for a scope to be skipped by lookups that started in a function-like scope nested in it. ADR 0006 already names this gap; `packages/js/SCOPING.md` D6 option A is the same mechanism.

**M2 — A scope whose region is not one range.**

- Rule: a function's parameters belong to the function, but their names are written in the header, between default values and annotations that belong to the scope outside ([8.7][funcdef]). A comprehension's first iterable belongs to the scope outside, but is written in the middle of the comprehension ([6.2.6.2][comprehension]). A generic function's default values lie outside its type parameter scope ([8.10][typeparams]).
- Core: a scope has one `at` range, and `TreeCursor.at` picks the scope of a position by descending through ranges.
- Today, three consequences:
  - A function's region is its body, so everything in the header resolves correctly, and a parameter's own name does not. Its position is not offered as a reference, so it resolves to nothing rather than to an outer name that happens to match (P1).
  - A comprehension's region is the whole node. A name in the first iterable that equals a target (`{path for path in path.glob(…)}`, from the standard library's tests) resolves to the target, and a scope written there (a lambda, another comprehension) is parented to the comprehension, so its free names pass through the comprehension's targets.
  - A default value of a generic function sees the type parameters.
- Standard library: 97,435 parameter declarations get no answer (6.2% of all positions compared); 3 wrong answers in a first iterable.
- Needs: a scope's region as several ranges, or core asking the plugin which scope a position is evaluated in, as it already asks which positions are references.

**M3 — A name that skips scopes.**

- Rule: after `global x`, every use of `x` in the block is the module's `x`, even when an enclosing function binds `x` ([4.2.2][resolution]).
- Core: lookup has no per-name redirect.
- Today: binding forms under a `global` statement attach to the module, and a use walks outward. That is right unless a function between the block and the module binds the same name.
- Standard library: 3 wrong answers (`test/test__interpreters.py`).
- Needs: a binding that answers with another scope's binding. An import of the file's own top-level name would do it, but `Workspace.origin` treats that as a cycle.

**M4 — A lookup key that is not the text at the position.**

- Rule: inside a class, `__name` is the name `_Class__name` ([6.2.2.1][mangling]). All names are converted to NFKC normal form while parsing, so `ｗｉｄｔｈ` is `width` ([2.3.4][identifiers]).
- Core: `origin` looks up `target.text`.
- Today: names resolve as written. Mangling goes unnoticed while a name stays inside one class, which is the normal use.
- Standard library: 2 and 9 wrong answers, all in tests of these two rules.
- Needs: the plugin supplying the name to look up for a reference.

**M5 — Imports.**

- A binding whose value is a module (`import a.b as m`, `from . import sibling`) has no declaration to land on in the target file: core looks for a top-level name there and finds none. This is the namespace-import gap of `packages/js/SCOPING.md` D7.
- `from pkg import name` binds an attribute of `pkg/__init__.py` if there is one, and otherwise the submodule `pkg/name.py` ([7.11][import]). A binding has one `NodeSource`. Today `from . import name` is taken as a submodule and `from .pkg import name` as an attribute.
- `from m import *` needs a lookup that misses at module level to continue in `m`'s top-level names. There is no such step.
- An absolute import of a workspace module (`from mypkg.util import f`) is left as written. The `paths` aliases match the written specifier, which is dotted, not path-shaped.

## 8. Modeling decisions for the user

**Taken in the rewrite (2026-11-11), open to revision:**

| # | Decision | Taken | Alternative |
| --- | --- | --- | --- |
| P1 | A function's region, given M2 | The body. Header positions are exact; a parameter's declaration answers nothing | Parameters and body, as in JavaScript. Declarations answer themselves, and `def f(x=x)`, `lambda i=i: …`, `def f(date: date)` resolve to the parameter, wrongly |
| P2 | Class-level names, given M1 | Bindings of the class scope: right in the class body, wrong from a nested scope that reuses the name | `name@start` segments, as for JavaScript's public class elements: never wrong from a method, but `@x.setter` and constants built from each other no longer resolve |
| P3 | Which binding form stands for a name bound several times | The first in the source | The last `def`, as JavaScript does for hoisted functions. Python has no hoisting, so there is no such rule to follow |
| P4 | An annotation without a value at class or module level | A binding, as in a function. CPython's `symtable` marks it local in every block; the reference states it for functions only | Not a binding outside functions |
| P5 | Segment labels and kinds | `name@N` for functions and classes; `lambda@N`, `listcomp@N`, `dictcomp@N`, `setcomp@N`, `genexpr@N`, `generic@N`. Kinds `function`, `class`, `comprehension`, `generic`; bindings `variable`, `parameter`, `function`, `class`, `type`, `module` | — |
| P6 | Capture tags for `global` and `nonlocal` | `@binding.global`, `@binding.nonlocal` (confirmed 2026-11-11). They are not binding forms; the suffix names the attachment rule | — |

**Declined:** star imports, `__class__` and the other implicit names, string annotations. Each needs a decision before it is modeled.

**Open:** M1 to M5 need a decision on core. M1 and M2 affect ordinary code; M3 and M4 are rare.

## Acceptance

`eslint-scope` plays this role for JavaScript; for Python it is CPython's own `symtable`, through [`scripts/compare-symtable.mjs`](scripts/compare-symtable.mjs):

```bash
pnpm python build
pnpm python compare --python <python 3.14 or later> --files 100000
```

Every name the compiler resolves in a file was compared with the scope letant's answer lies in: each `Name` node of the `ast` and each parameter, against the binding `Workspace.origin` answers with. Attribute names and keyword-argument names were checked not to be references.

Corpus: the standard library of CPython 3.14.7, tests included.

| | |
| --- | --- |
| Files compared | ACCEPT_FILES of 1,870 (ACCEPT_SKIPPED) |
| Positions compared | ACCEPT_TOTAL |
| Agreeing | ACCEPT_AGREE |
| Parameter declarations, not offered (M2, P1) | ACCEPT_PARAM |
| Agreement on every other position | ACCEPT_REST |

ACCEPT_BREAKDOWN

Limits of the comparison:

- `symtable` reports scopes, not declarations, so the comparison says the answer is in the right scope, not that it is the right identifier in that scope (P3 is not checked by it).
- Since Python 3.12 the compiler inlines list, set and dictionary comprehensions, and `symtable` no longer reports them as scopes. For those the comparison takes the targets from the syntax, so it is not independent there; generator expressions are checked against the compiler.
- Names used only inside annotations are in tables the comparison does not pair; they are resolved as if used in the enclosing scope, which is what [4.2.4][lazy] specifies.
- Imports, `global` statements and the names of definitions carry no position in the `ast` and are covered by the resolution tests only.

[spec]: https://docs.python.org/3/reference/
[structure]: https://docs.python.org/3/reference/executionmodel.html#structure-of-a-program
[binding]: https://docs.python.org/3/reference/executionmodel.html#binding-of-names
[resolution]: https://docs.python.org/3/reference/executionmodel.html#resolution-of-names
[annotation]: https://docs.python.org/3/reference/executionmodel.html#annotation-scopes
[lazy]: https://docs.python.org/3/reference/executionmodel.html#lazy-evaluation
[builtins]: https://docs.python.org/3/reference/executionmodel.html#builtins-and-restricted-execution
[dynamic]: https://docs.python.org/3/reference/executionmodel.html#interaction-with-dynamic-features
[identifiers]: https://docs.python.org/3/reference/lexical_analysis.html#non-ascii-characters-in-names
[mangling]: https://docs.python.org/3/reference/expressions.html#private-name-mangling
[comprehension]: https://docs.python.org/3/reference/expressions.html#complex-comprehensions
[genexpr]: https://docs.python.org/3/reference/expressions.html#generator-expressions
[walrus]: https://docs.python.org/3/reference/expressions.html#assignment-expressions
[lambda]: https://docs.python.org/3/reference/expressions.html#lambda
[assignment]: https://docs.python.org/3/reference/simple_stmts.html#assignment-statements
[augassign]: https://docs.python.org/3/reference/simple_stmts.html#augmented-assignment-statements
[annassign]: https://docs.python.org/3/reference/simple_stmts.html#annotated-assignment-statements
[del]: https://docs.python.org/3/reference/simple_stmts.html#the-del-statement
[import]: https://docs.python.org/3/reference/simple_stmts.html#the-import-statement
[future]: https://docs.python.org/3/reference/simple_stmts.html#future-statements
[global]: https://docs.python.org/3/reference/simple_stmts.html#the-global-statement
[nonlocal]: https://docs.python.org/3/reference/simple_stmts.html#the-nonlocal-statement
[typestmt]: https://docs.python.org/3/reference/simple_stmts.html#the-type-statement
[for]: https://docs.python.org/3/reference/compound_stmts.html#the-for-statement
[except]: https://docs.python.org/3/reference/compound_stmts.html#except-clause
[with]: https://docs.python.org/3/reference/compound_stmts.html#the-with-statement
[aspattern]: https://docs.python.org/3/reference/compound_stmts.html#as-patterns
[capture]: https://docs.python.org/3/reference/compound_stmts.html#capture-patterns
[wildcard]: https://docs.python.org/3/reference/compound_stmts.html#wildcard-patterns
[funcdef]: https://docs.python.org/3/reference/compound_stmts.html#function-definitions
[classdef]: https://docs.python.org/3/reference/compound_stmts.html#class-definitions
[typeparams]: https://docs.python.org/3/reference/compound_stmts.html#type-parameter-lists
[annotations]: https://docs.python.org/3/reference/compound_stmts.html#annotations
[pep572]: https://peps.python.org/pep-0572/#scope-of-the-target
