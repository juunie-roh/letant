# Go scoping reference — `@letant/go`

This document lists the rules of the Go specification that decide where a name is bound, maps each one to tree-sitter-go nodes, and records what the plugin does. The plugin's **boundary set**, **attachment rules** and **reference rules** come from here. §7 lists the rules the core model cannot express yet, and the positions the plugin declines to answer because of them.

| | |
| --- | --- |
| Spec | The Go Programming Language Specification, language version go1.27 (May 26, 2026), [go.dev/ref/spec][spec], read 2026-11-15. Where the spec leaves the exact start of a scope open, the position is taken from the type checker of Go 1.27.4 (`go/types`), read as source: [`decl.go`][decl.go], [`assignments.go`][assignments.go], [`stmt.go`][stmt.go], [`range.go`][range.go], [`signature.go`][signature.go]. |
| Grammar | tree-sitter-go 0.25.0, `node_modules/tree-sitter-go/src/node-types.json`. Fields are written `field:`; "unfielded" means a positional child. Every shape claim was checked against a real parse. |
| letant | Written 2026-11-15 on ADR 0006 to 0008 (`src/queries/scoping/`, `src/scoping/`). Checked by `__tests__/resolution.test.ts`. Compared with Go's type checker on 2026-11-15: see [Acceptance](#acceptance). Links are relative to `packages/go/`. |
| Status | **OK** matches the spec · **DIFF** differs · **MISSING** not handled · **MISFIT** decided by syntax, but core cannot express it (§7) · **DECLINED** the tree would answer wrongly, or cannot know, so the plugin answers `unsupported` |

**In scope:** the names bound by the declarations of [Declarations and scope][scope].

**Excluded:**

- Fields and methods (`x.f`, `T.m`). They are selected from a value or a type, never looked up in a scope (§6).
- Labels. "In contrast to other identifiers, labels are not block scoped and do not conflict with identifiers that are not labels" ([Label scopes][labels]).
- Predeclared identifiers (`int`, `len`, `nil`, …). A name no block of the file binds ends in a terminal.

Three facts the rest of this document relies on:

- **Go has one namespace.** A constant, a type, a variable, a function and a package are all "identifiers" of the same blocks ([Declarations and scope][scope]). No binding carries a `space` (ADR 0008), and none is hidden from nested scopes (no `barrier`, ADR 0007).
- **Lookup depends on position inside a block.** A name declared in a function is visible from a point in its block, not in the whole block (§3). letant's `resolve` ignores position ([cursor.ts](../../src/core/tree/cursor.ts)): **MISFIT** G1.
- **In letant, a path segment is a binding.** `resolve(symbol)` matches `child.name === symbol` across _all_ children, scopes included. The plugin therefore gives every scope a `label@start` segment, which can never equal an identifier; only real bindings carry a bare name.

## 1. Boundaries

"Go is lexically scoped using blocks" ([Declarations and scope][scope]). The blocks are listed in [Blocks][blocks]: explicit ones in braces, and the implicit ones numbered below as there.

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| 1. The universe block | [Blocks][blocks] | — | — | No node: a predeclared name is unresolved |
| 2. "Each package has a package block containing all Go source text for that package" | [Blocks][blocks] | — | A package is every file of a directory with the same package clause | **MISFIT** G3: a tree holds one file. The file root stands for the part of the package block written in this file |
| 3. "Each file has a file block containing all Go source text in that file": it holds the imports | [Blocks][blocks] | `source_file` | — | **OK**: core adds the file root. File block and package block are one node, which is exact because "no identifier may be declared in both the file and package block" |
| A block in braces | [Blocks][blocks] | `block` | `block` is also the body of a function, an `if`, a `for` and a function literal | **OK** ([scope.scm](src/queries/scoping/scope.scm)); a function's body is not a scope of its own, see the next row |
| A function: "The scope of an identifier denoting a method receiver, function parameter, or result variable is the function body" | [Declarations and scope][scope] rule 4, [Function declarations][funcdecl], [Function literals][funclit] | `function_declaration`, `method_declaration` (`receiver:`), `func_literal`; each with `parameters:`, `result:`, `body: block` | `body:` is absent for a function implemented outside Go | **OK**: one scope for parameters and body ([rules.ts](src/scoping/rules.ts) `isMergedBody`). `go/types` uses one scope as well, which is why `func f(x int) { var x int }` is a redeclaration |
| A function type and an interface's method: their parameter names are declared, and nothing can refer to them | [Function types][functype], [Interface types][interface] | `function_type`, `method_elem` | Same `parameters:` and `result:` as a function, no body | **OK**: a scope, so that pointing at a parameter's name answers with itself and not with an outer name |
| A type's type parameters: "begins after the name of the type and ends at the end of the TypeSpec" | [Declarations and scope][scope] rule 6 | `type_spec` and `type_alias` with `type_parameters:` | Without `type_parameters:` the same nodes open nothing | **OK**: a scope from the type parameter list to the end of the spec |
| 4. "Each "if", "for", and "switch" statement is considered to be in its own implicit block" | [Blocks][blocks] | `if_statement`, `for_statement`, `expression_switch_statement`, `type_switch_statement` | The `else` of an `if` is its child (`alternative:`), so an `else if` is inside the first statement's block | **OK** |
| 5. "Each clause in a "switch" or "select" statement acts as an implicit block" | [Blocks][blocks] | `expression_case`, `type_case`, `default_case`, `communication_case` | `default_case` serves all three statements. A `select_statement` itself is no block | **OK** |

## 2. Binding forms

"A declaration binds a non-blank identifier to a constant, type, type parameter, variable, function, label, or package" ([Declarations and scope][scope]).

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| Variable and constant declarations | [Variable declarations][vardecl], [Constant declarations][constdecl] | `var_spec name:`\*, `const_spec` > `identifier`\* | A `var_spec` repeats the `name:` field for each name. A `const_spec` puts one `name:` field over its whole list, and a query pattern with the field matches the first name only, so the pattern asks for its `identifier` children: the type and the values are never one. A grouped declaration wraps its specs in `var_spec_list`; a `const_spec` without a value (`b` after `a = iota`) is only its name | **OK** ([binding.scm](src/queries/scoping/binding.scm)) |
| Short variable declaration | [Short variable declarations][shortvar] | `short_var_declaration left: expression_list` > `identifier` | Also the initializer of an `if`, `for` or `switch` | **OK** |
| Range clause with `:=` | [For statements][for] | `range_clause left: expression_list` > `identifier`, then the token `:=` | With `=` the clause assigns to existing variables; the node type is the same and only the token differs | **OK**: the query asks for the token |
| Receive statement with `:=` in a `select` clause | [Select statements][select] | `receive_statement left: expression_list`, then `:=` | As for the range clause | **OK** |
| Type switch guard: "the variable is declared at the end of the TypeSwitchCase in the implicit block of each clause" | [Type switches][typeswitch] | `type_switch_statement alias: expression_list` > `identifier` | One identifier in the source for one variable per clause | **OK** in the clauses: every `type_case` and `default_case` gets a binding whose `at` is the guard's identifier. The guard itself: **DECLINED** (§4) |
| Parameters, results and the receiver | [Function types][functype], [Method declarations][methoddecl] | `parameter_declaration name:`\*, `variadic_parameter_declaration name:` | `func f(a, b int)` is one declaration with two names; `func f(a, b)` is two declarations without names, whose `type:` is `a` and `b`. **Grammar gap:** of ten names or more that share a type, the grammar keeps the last nine as names and reads the ones before them as declarations without a name | **OK**: "the names must either all be present or all be absent" ([Function types][functype]), so a declaration without a name that stands before one with a name is a name, and is bound as one |
| Type parameters of a function or a type | [Type parameter declarations][typeparams] | `type_parameter_declaration name:`\* | — | **OK** |
| Type parameters declared by a receiver: "the receiver specification must declare corresponding type parameters for the method to use" | [Method declarations][methoddecl] | `method_declaration receiver:` > `parameter_declaration type:` > `generic_type type_arguments:` > `type_elem` > `type_identifier` | The `generic_type` may be inside a `pointer_type` and any number of `parenthesized_type`. What declares here is written as a type argument | **OK** ([analyze.ts](src/scoping/analyze.ts) `receiverTypeParameters`) |
| Function name | [Function declarations][funcdecl] | `function_declaration name:` | — | **OK**: a binding of the package block, separate from the scope node |
| Type name, defined or alias | [Type declarations][typedecl] | `type_spec name:`, `type_alias name:` | — | **OK** |
| An import with a name binds that name in the file block | [Import declarations][import] | `import_spec` (`name: package_identifier`, `path:`) | — | **OK**: a binding whose `at` is the import path |
| An import without a name: "it defaults to the identifier specified in the package clause of the imported package" | [Import declarations][import] | `import_spec` with `path:` only | — | **MISFIT** G2: the name is in another package. Recorded as a `module@N` node, not bound; references to the name it is assumed to have are **DECLINED** |
| `import . "p"` declares every exported identifier of `p` in the file block | [Import declarations][import] | `import_spec name: dot` | — | **MISSING**: recorded as a `module@N` node, binds nothing (§6) |
| `import _ "p"` binds nothing | [Import declarations][import] | `import_spec name: blank_identifier` | — | **OK**: recorded as a `module@N` node |
| The blank identifier "does not introduce a binding and thus is not declared" | [Declarations and scope][scope], [Blank identifier][blank] | `identifier` or `type_identifier` with the text `_`; `blank_identifier` in an import | — | **OK**: never bound, so it resolves to nothing |
| "In the package block, the identifier `init` may only be used for `init` function declarations, and like the blank identifier it does not introduce a new binding" | [Declarations and scope][scope], [Package initialization][init] | `function_declaration name:` with the text `init` | — | **OK**: not bound |
| A method's name is not an identifier of any block: "(but not method)" | [Declarations and scope][scope] rule 2 | `method_declaration name: field_identifier` | — | **OK**: not bound; the method's scope node carries the name in `props` |
| "The package clause is not a declaration; the package name does not appear in any scope" | [Declarations and scope][scope] | `package_clause` > `package_identifier` | — | **OK**: not bound, not a reference |
| Predeclared identifiers that the grammar gives node types of their own | [Predeclared identifiers][predeclared] | `nil`, `true`, `false`, `iota` | Go lets a program declare these names again (`func f(true bool)`, `nil := 1`). Where the grammar expects a name the node is an `identifier`; in a list of expressions (the left side of `:=`, a use) it is a `nil`, `true`, `false` or `iota` node | **OK**: the four node types are references, and the binding forms written as a list of expressions accept them |

## 3. Attachment (which block, and from where)

In Go every name goes to its innermost block; what differs is the position its scope begins at. Each binding therefore has a start, kept by the plugin ([analyze.ts](src/scoping/analyze.ts) `from`).

| Rule | Spec, and `go/types` where the spec is not exact | Start of the scope | letant today |
| --- | --- | --- | --- |
| A constant, type, variable or function "declared at top level (outside any function)" is in scope in the whole package block | [Declarations and scope][scope] rule 2 | The whole file, in any order | **OK** within the file. The other files of the package: **MISFIT** G3 |
| An import's name is in scope in the whole file block | rule 3 | The whole file | **OK** |
| A receiver, parameter or result is in scope in the function body | rule 4; `go/types`: `scopePos := ftyp.End() // all parameter's scopes start after the signature` | The end of the signature | **OK** in the body. A use of the same name inside the signature (`func f(url *url.URL)`): **MISFIT** G1, **DECLINED** |
| A type parameter of a function "begins after the name of the function and ends at the end of the function body" | rule 5; `go/types`: `scopePos := list.Pos()` | The start of the type parameter list, so a constraint can name a later parameter (`[S ~[]E, E any]`) | **OK** |
| A type parameter declared by a receiver | rule 5; `go/types`: "The scope of the type parameter T in "func (r T[T]) f() {}" starts after f, not at r" | Its own identifier. The only name written before it is the receiver's base type | **OK**. A base type with the name of its own type parameter: **MISFIT** G1, **DECLINED** |
| A type parameter of a type | rule 6 | The start of the type parameter list | **OK** |
| A constant or variable declared inside a function "begins at the end of the ConstSpec or VarSpec (ShortVarDecl for short variable declarations) and ends at the end of the innermost containing block" | rule 7 | The end of the spec or statement | **OK** after that point. A use before it in the same block (`x := x + 1`): **MISFIT** G1, **DECLINED** |
| A range variable: "their scope is the block of the "for" statement" | [For statements][for]; `go/types`: `scopePos := rangeStmt.Body.Pos()` | The start of the loop body, so the range expression does not see it | **OK** in the body. A range expression with the variable's name (`for _, x := range x`): **MISFIT** G1, **DECLINED** |
| A type switch variable, in each clause | [Type switches][typeswitch]; `go/types`: `check.declare(check.scope, nil, obj, clause.Colon)` | The colon of the clause | **OK** |
| A received value declared in a `select` clause | [Select statements][select] | The end of the receive statement, as for any short variable declaration | **OK** |
| A type declared inside a function "begins at the identifier in the TypeSpec" | rule 8 | Its own identifier, so the type can name itself | **OK**. A use before it in the same block: **MISFIT** G1, **DECLINED** |
| A short variable declaration "may redeclare variables provided they were originally declared earlier in the same block (or the parameter lists if the block is the function body)… Redeclaration does not introduce a new variable" | [Short variable declarations][shortvar] | — | **OK**: one node per name per scope, the first declaration in the source |
| The name of a function or a generic type is declared outside the scope it opens | rules 2, 5, 6 | — | **OK**: the scope's region starts after the name ([rules.ts](src/scoping/rules.ts) `isOutsideOf`, `regionOf`) |

## 4. Lookup and references

| Rule | Spec | Node types / fields | letant today |
| --- | --- | --- | --- |
| A name is looked up in its innermost block and then in each block around it: "An identifier declared in a block may be redeclared in an inner block. While the identifier of the inner declaration is in scope, it denotes the entity declared by the inner declaration" | [Declarations and scope][scope] | `identifier`, `type_identifier`, `package_identifier` | **OK** ([cursor.ts](../../src/core/tree/cursor.ts) `resolve`), except where the inner declaration is not in scope yet: **MISFIT** G1 |
| An identifier in a type position and one in an expression are the same kind of name | [Declarations and scope][scope] | The grammar gives `type_identifier` where it expects a type and `identifier` elsewhere; an instantiation `F[int]` can make a function a `type_identifier` | **OK**: all three node types are references, looked up alike ([reference.scm](src/queries/utility/reference.scm)) |
| A qualified identifier `pkg.Name` names a package and one of its exported identifiers | [Qualified identifiers][qualified] | In a type: `qualified_type` (`package: package_identifier`, `name: type_identifier`). In an expression: `selector_expression` (`operand: identifier`, `field: field_identifier`) | **OK**: the package is a reference; the name after the dot is not ([rules.ts](src/scoping/rules.ts) `isReference`) |
| A field or a method after a dot, a field's name in a struct type, a method's name in its declaration or in an interface | [Selectors][selectors], [Struct types][struct] | `field_identifier` | **OK**: the node type is not in the reference query |
| An embedded field names a type | [Struct types][struct] | `field_declaration type:` without `name:` | **OK**: a reference to the type |
| Labels | [Label scopes][labels] | `label_name` | **OK**: not in the reference query |
| The key of a composite literal's element: "interpreted as a field selector for struct literals, an index for array and slice literals, and a key for map literals" | [Composite literals][composite] | `keyed_element key: literal_element` > `identifier` | Decided by the literal's type. Written as `struct{…}`: a field, not a reference. Written as an array, slice or map type: an expression, a reference. Written as a name (`T{…}`, `pkg.T{…}`, `T[int]{…}`): it depends on what the name is declared as, which syntax does not show: **DECLINED** ([rules.ts](src/scoping/rules.ts) `keyKind`) |
| An element or key that is itself a literal "may elide the respective literal type if it is identical to the element or key type of T", and `&T` likewise | [Composite literals][composite] | `literal_value` directly inside a `literal_element` | **OK**: the type is taken from the element or key type of the literal around it, when that is written as an array, slice or map type ([rules.ts](src/scoping/rules.ts) `literalType`) |
| The symbolic variable of a type switch guard is not a variable itself | [Type switches][typeswitch] | `type_switch_statement alias:` | **DECLINED**: it stands for one variable per clause, and a lookup from the guard would find an outer name |
| A declaring identifier resolves to itself | — | every binding form of §2 | **OK**. A second `:=` of a name answers with the first |

## 5. Boundary set

| Node type | Opens | Region (`at`) | Kind, segment |
| --- | --- | --- | --- |
| `source_file` | the file's part of the package block, and the file block | the file root, created by core | — |
| `function_declaration` | a function scope: type parameters, parameters, results, and the body's declarations | from the type parameter list, or else the parameter list, to the end | `function`, `<name>@N` |
| `method_declaration` | the same, with the receiver and the type parameters it declares | the whole node | `method`, `<name>@N`; `props.name` |
| `func_literal` | a function scope | the whole node | `function`, `func@N` |
| `function_type`, `method_elem` | the parameter names of a signature | the whole node | `signature`, `func@N` / `<name>@N`; `props.name` for a method |
| `type_spec`, `type_alias` with type parameters | the type parameters | from the type parameter list to the end | `generic`, `<name>@N` |
| `block` that is not a function's body | a block | the whole node | `block`, `block@N` |
| `if_statement` | the initializer's names | the whole node | `if`, `if@N` |
| `for_statement` | the initializer's or the range clause's names | the whole node | `for`, `for@N` |
| `expression_switch_statement`, `type_switch_statement` | the initializer's names | the whole node | `switch`, `switch@N` |
| `expression_case`, `type_case`, `communication_case`, `default_case` | the clause's declarations; in a type switch, the guard's variable | the whole node | `case`, `case@N` / `default@N` |

Binding kinds: `variable`, `constant`, `type` (types and type parameters), `function`, `parameter` (parameters and receivers; a named result is a `variable`), `module` (imports).

**Not boundaries:** `select_statement`, `labeled_statement`, `go_statement`, `defer_statement`, struct and interface types, composite literals, and every expression. Anything not listed is walked through.

**Tree parent.** A scope's parent is the nearest scope above it in the syntax tree. No scope lies in the part of a node that is outside its region (the name of a function or generic type), so this is also the scope whose region contains it.

## 6. Out of reach (ADR 0005)

| Construct | Why |
| --- | --- |
| Fields and methods, `x.f`, promoted fields included | They depend on the type of `x` |
| The key of a literal whose type is a name | A field or an expression, depending on the type the name is declared as, which may be in another file or package |
| The name of a package imported without one | Declared by the package clause of the imported package (G2) |
| The names a dot import declares | The exported identifiers of another package |
| Which directory an import path names | Decided by the module graph (`go.mod`, the module cache, `GOROOT`). An import's `at` is its path as written. Core takes a path that starts with `./` or `../` for a file; Go rejects such a path in module mode, where it could name a directory at most |
| Predeclared identifiers | The universe block has no source |
| A file the grammar cannot parse | Core rejects a file with a syntax error, so it has no tree. `tree-sitter-go` 0.25.0 does not parse `new(expr)` with an expression for its operand (Go 1.26) |
| Build constraints | Which files make up the package depends on the target platform (`_linux.go`, `//go:build`) |
| Names a program reaches through `reflect`, `go:linkname` or `cgo` (`C.name`) | Not bound by any declaration in Go source |

## 7. What does not fit the core model

Where the tree would give a wrong answer, the plugin declines the position through `unsupported` ([unsupported.ts](src/scoping/unsupported.ts)), and `origin` answers `{ unsupported: rule }`. The right answer for each is pinned by a test in the last block of [`resolution.test.ts`](__tests__/resolution.test.ts) that fails today (`it.fails`) and must pass once core can express the rule.

**G1 — A name that is visible from a point in its block.**

- Rule: a constant, variable or type declared in a function is in scope from the end of its declaration (a type: from its own identifier), not from the start of its block; a parameter from the end of the signature; a range variable from the loop body ([Declarations and scope][scope] rules 4, 7, 8). Before that point the name denotes whatever an outer block declares.
- Core: `resolve` takes the first scope that binds the name. It does not know where in the scope the lookup comes from, nor where the binding begins.
- Today: the tree has one binding per name per block. A reference is **declined** exactly when the nearest scope that binds its name binds it from a later point. Everything else is answered.
- This is ordinary Go, not a corner:

  ```go
  func handle(ctx context.Context, url *url.URL) {   // url: the package, not the parameter
      if v, ok := v.(T); ok { … }                    // the second v: the outer one
      for _, tc := range tests { tc := tc; … }       // the second tc: the loop variable
      ctx, cancel := context.WithCancel(ctx)         // in a nested block, the last ctx: the outer one
  }
  ```

- The test is exact, not broader than needed: `unsupported` reads the same bindings and starts the tree was built from (decision D4), and follows the walk `resolve` makes.
- Needs: a binding that carries the position it is visible from, and a `resolve` that is given the position of the lookup and passes over a binding that has not begun. That is how `go/types` does it (`Scope.LookupParent(name, pos)`). A language that lets one block declare a name twice (Rust's `let x = x + 1;`) needs more: several bindings of one name in one scope.

**G2 — A name that is declared in another package.**

- Rule: `import "net/http"` binds the name in the package clause of the imported package. By convention that is the last element of the path; the language does not require it (`gopkg.in/yaml.v3` is package `yaml`, `k8s.io/api/core/v1` is package `v1`).
- Core: a binding's name is its path segment, read from the file.
- Today: the import is recorded as a `module@N` node and binds nothing. The plugin computes the name the import is _assumed_ to have (the last path element that is not a major version, without a `go-` prefix, cut at the first character an identifier cannot hold: `ImportPathToAssumedName` of `golang.org/x/tools`, which `goimports` uses) and **declines** a reference with that name that nothing else in the file binds. A local or package-level declaration of the name is answered as usual.
- Cost: this is the usual form of an import, so the package in `fmt.Println`, `http.Client`, `strings.Split` is declined throughout. An import with a name (`import f "fmt"`) resolves.
- If the assumed name is not the real one, a use of the real name is unanswered instead of declined. Neither is a wrong answer.
- Needs: a decision (D2), or the imported package's clause, which is outside the file and often outside the workspace.

**G3 — A scope that spans files.**

- Rule: the package block contains every file of the package. A name declared at top level in `a.go` is in scope in `b.go` with no import ([Blocks][blocks] 2, [Declarations and scope][scope] rule 2).
- Core: a tree is one file, and `origin` leaves a file only through an import binding.
- Today: a reference to a name declared in another file of the package finds nothing and answers `undefined`. It cannot land on a wrong declaration: the file root is the outermost scope of the tree, and a name the package declares cannot also be declared by the file block.
- Cost: every use of a package-level name from another file of its package. In a package of many files this is a large share of the references.
- Needs: a lookup that misses at the file root to continue in the other opened files of the same directory and package clause. The Python plugin's `from m import *` (its M5) needs the same step.

**What declining costs.** Measured by the comparison with `go/types` (see [Acceptance](#acceptance)): it reports each rule's count, and for each declined position whether the tree would have answered correctly.

| Declined | Test | Exact? |
| --- | --- | --- |
| G1, order | The nearest scope binding the name binds it from a point after the reference, and the reference is not that binding's own declaration | Exact: the tree's answer would be wrong |
| G2, package name | No scope of the file binds the name, and an import without a name is assumed to have it | Broader than necessary only where the assumption is wrong |
| Literal key (§4) | The key is an identifier and the literal's type is written as a name | Broader: a field needs no answer, and for a map or array type behind the name the tree would have been right |
| Type switch guard (§4) | The identifier is the guard's | Broader where no outer block binds the name |

## 8. Modeling decisions for the user

**Taken on 2026-11-15, open to revision:**

| # | Decision | Taken | Alternative |
| --- | --- | --- | --- |
| D1 | A name visible from a point in its block (G1) | One binding per name per block; positions before the binding begins are declined | (a) A scope per declaration, from the end of the declaration to the end of the block: exact and needs no change to core, but a function with 50 declarations is 50 scopes deep, a local's path depends on what was declared before it, and a declaring identifier lies outside its own scope. (b) A start position on the binding and a position-aware `resolve` in core |
| D2 | An import without a name (G2) | Not bound; references to the assumed name are declined | Bind the assumed name. It is right for the whole standard library and for nearly every package, and makes `fmt.Println` resolve. It gives a wrong answer when a package's name differs from its path _and_ the file uses the assumed name for something declared in another file. The change is one branch in [analyze.ts](src/scoping/analyze.ts) (`binding.import`) |
| D3 | The package block (G3) | The file root holds this file's part | Needs core |
| D4 | How exact the tests for declining are | Exact: the plugin keeps the scopes and bindings of each syntax tree (a `WeakMap` by tree, [analyze.ts](src/scoping/analyze.ts) `analysisOf`), and `unsupported` reads them. The Python plugin decided otherwise (its P8: syntax only, broader than needed) | Syntax only. For G1 that means scanning the enclosing blocks for a later declaration of the name on every reference, which is the same analysis done again |
| D5 | Capture tags | The four existing ones: `@binding.variable`, `@binding.parameter`, `@binding.declaration`, `@binding.import`. No new tag. A receiver's type is captured as `@binding.parameter` although the node is a type: its type arguments are the parameters | A tag of its own for the receiver's type and for the type switch guard |
| D6 | Imports that bind no name the file spells (no name, `.`, `_`) | A `module@N` node of type `anonymous` whose `at` is the path, as `@letant/js` records an import without a clause | No node |
| D7 | Function types and interface methods | Scopes of kind `signature`, holding parameter names nothing can refer to | No scope and no bindings, with the parameter names declared not to be references |
| D8 | Fields and methods | A method declaration is a scope with `props.name`; struct fields and interface methods' names emit no node | Member nodes with `name@N` segments, as for JavaScript's class elements |
| D9 | Kinds and segments | §5 | — |

**Open:** G1, G2 and G3 need a decision. G1 and G3 are about core; G2 is about how strict "no wrong answer" is for an assumption that is nearly always right.

## Acceptance

`eslint-scope` plays this role for JavaScript and CPython's `symtable` for Python; for Go it is the type checker of the Go distribution, `go/types`, through [`scripts/compare-gotypes.mjs`](scripts/compare-gotypes.mjs) and [`scripts/gotypes_reference.go`](scripts/gotypes_reference.go):

```bash
pnpm go build
pnpm go compare --files 700   # --go <exe> for a `go` command that is not on the PATH (Go 1.24 or later)
```

For every identifier of a file the reference reports what `go/types` resolves it to: the declaring identifier in the file, an import, nothing in the file (a predeclared name, another file of the package), or not a name (a field, a method, a label). The file is checked together with the rest of its package, with imports loaded from source, so the name of a package imported without one is the real one. The comparison is on the declaring identifier, not only on the scope.

**Status: run on 2026-11-15** against Go 1.27.4, on 700 files sampled from its standard library (`--files 700`, seed 42; about ten minutes). One file is skipped: the grammar cannot parse it (§6).

| Outcome | Names | Share |
| --- | --- | --- |
| Agreed with `go/types` | 381,557 | 91.4% |
| Declined: the name of an import without one (G2) | 24,256 | 5.8% |
| Declined: a key in a literal of a named type (§4) | 11,227 | 2.7% |
| Declined: a name used before its declaration in a function (G1) | 197 | 0.05% |
| Declined: a type switch guard (§4) | 115 | 0.03% |
| Unrecorded by the type checker | 7 | — |
| **Disagreed** | **0** | |
| Total | 417,360 | |

- No identifier is at a different position for the two parsers (`misaligned: 0`).
- Every import without a name has the name the plugin assumes (`unnamedAssumedOtherName: 0`), in the standard library.
- What declining buys: the tree alone would have answered all 197 of the G1 positions wrongly, and 454 of the 11,227 keys. The other 10,773 keys it would have answered correctly.
- The 7 unrecorded names are declarations the type checker rejected as duplicates, in files that are alternatives of one another under build constraints; the plugin answers each with itself.

The first run reported 104 disagreements. Three were defects, each now fixed and pinned by tests: the second and later names of a `const_spec` were not bound, the first names of a parameter list of ten or more were read as types (§2), and `true`, `false`, `nil` and `iota` were not followed when a program declares them (§2). The fourth was the comparison's: the type checker gives a vendored package its directory as path, and the reference now reports the path as written.

What the comparison does not show:

- [`resolution.test.ts`](__tests__/resolution.test.ts) has a case for every rule above and the opposite case for every boundary. Each rule was broken once (single changes to the queries and the rules), and a test failed for every one of them. The three defects above passed that check: it shows that the tests notice a rule that is removed, not that a rule is missing.
- The sample is the standard library, written by one group in one style. Code outside it has not been compared.

Limits of the comparison:

- `go/types` needs the whole package and its imports. A file whose imports cannot be loaded is still checked; identifiers the checker could not resolve are counted as "unrecorded", not as disagreements.
- Which files form the package follows the build constraints of the machine the comparison runs on.
- An import's answer is compared as a path. Whether that path is the right directory is not checked (§6).

[spec]: https://go.dev/ref/spec
[blocks]: https://go.dev/ref/spec#Blocks
[scope]: https://go.dev/ref/spec#Declarations_and_scope
[labels]: https://go.dev/ref/spec#Label_scopes
[blank]: https://go.dev/ref/spec#Blank_identifier
[predeclared]: https://go.dev/ref/spec#Predeclared_identifiers
[constdecl]: https://go.dev/ref/spec#Constant_declarations
[vardecl]: https://go.dev/ref/spec#Variable_declarations
[shortvar]: https://go.dev/ref/spec#Short_variable_declarations
[typedecl]: https://go.dev/ref/spec#Type_declarations
[typeparams]: https://go.dev/ref/spec#Type_parameter_declarations
[funcdecl]: https://go.dev/ref/spec#Function_declarations
[methoddecl]: https://go.dev/ref/spec#Method_declarations
[funclit]: https://go.dev/ref/spec#Function_literals
[functype]: https://go.dev/ref/spec#Function_types
[interface]: https://go.dev/ref/spec#Interface_types
[struct]: https://go.dev/ref/spec#Struct_types
[composite]: https://go.dev/ref/spec#Composite_literals
[qualified]: https://go.dev/ref/spec#Qualified_identifiers
[selectors]: https://go.dev/ref/spec#Selectors
[for]: https://go.dev/ref/spec#For_statements
[typeswitch]: https://go.dev/ref/spec#Type_switches
[select]: https://go.dev/ref/spec#Select_statements
[import]: https://go.dev/ref/spec#Import_declarations
[init]: https://go.dev/ref/spec#Package_initialization
[decl.go]: https://github.com/golang/go/blob/go1.27.4/src/go/types/decl.go
[assignments.go]: https://github.com/golang/go/blob/go1.27.4/src/go/types/assignments.go
[stmt.go]: https://github.com/golang/go/blob/go1.27.4/src/go/types/stmt.go
[range.go]: https://github.com/golang/go/blob/go1.27.4/src/go/types/range.go
[signature.go]: https://github.com/golang/go/blob/go1.27.4/src/go/types/signature.go
