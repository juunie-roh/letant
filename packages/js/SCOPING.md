# JavaScript scoping reference — `@letant/js`

This is the Phase 1 reference for the JS plugin. It lists the ECMAScript rules that decide where a name is bound, maps each one to tree-sitter-javascript nodes, and records what the plugin does today. The plugin's declared **boundary set**, **attachment rules** and **lookup exceptions** come from here. In Phase 2, bindings are captured at any depth, each attaches to its nearest boundary, and then these rules adjust the result.

| | |
| --- | --- |
| Spec | ECMA-262 2027 draft (18th ed.), [tc39.es/ecma262][spec], read 2026-11-10. Section numbers change between editions; the `#sec-` anchors in the links do not. |
| Grammar | tree-sitter-javascript 0.25.0, `node_modules/tree-sitter-javascript/src/node-types.json`. Fields are written `field:`; "unfielded" means a positional child. Every shape claim was checked against a real parse. |
| letant | The scoping rewrite of 2026-11-11 (`src/queries/scoping/`, `src/scoping/`). Checked through `Workspace.origin` against eslint-scope 9.1.2 on 1,501 files (440,975 references, all agreeing) and by `__tests__/resolution.test.ts`. Links are relative to `packages/js/`. |
| Status | **OK** matches the spec · **DIFF** differs · **MISSING** not handled |

**In scope:** identifier bindings (declarative, function and module environment records) and private names.

**Excluded:**

- `this`, `super`, `new.target`, `import.meta`. They resolve through [GetThisEnvironment][getthisenv] and [meta properties][meta], not identifier lookup. Their node types (`this`, `super`, `meta_property`) are not `identifier`.
- TDZ and other run-time errors. They never change *which* binding a name refers to.
- Everything ADR 0005 puts out of reach (§6).

Two facts the rest of this document relies on:

- **Lookup does not depend on position.** [GetIdentifierReference][getidref] walks environment records using HasBinding, and every binding exists from the moment its scope is entered ([14.3.1][letconst]: "created when their containing Environment Record is instantiated"). So hoisting only affects *which scope* a name attaches to, never lookup order. letant's `resolve` also ignores position ([cursor.ts](../../src/core/tree/cursor.ts)): **OK**.
- **In letant, a path segment is a binding.** `resolve(symbol)` matches `child.name === symbol` across *all* children, scopes included. So any node whose segment equals an identifier binds that identifier in its parent. The plugin therefore gives every scope and every public class element a `label@start` segment, which can never equal an identifier; only real bindings carry a bare name.

**Terms:**

- *Function-like* means `function_declaration`, `generator_function_declaration`, `function_expression`, `generator_function`, `arrow_function` or `method_definition`. Async variants carry an anonymous `"async"` token.
- *Var scope* means the nearest function-like node, `class_static_block` or `program`.

## 1. Boundaries

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| Top level: one scope per file (global env for a script, module env for a module) | [16.1.7][gdi], [16.2.1.7.3.1][initenv], [9.1.1.4][globalenv], [9.1.1.5][moduleenv] | `program` | Scripts and modules parse to the same node; the grammar doesn't tell them apart | **OK**: core adds the file root ([plugin.ts](../../src/core/plugin.ts) `extract`) |
| Functions (declaration, expression, generator, async): one function scope holds the parameters and the body's top level | [10.2.11][fdi], [9.1.1.3][funcenv] | `function_declaration`, `generator_function_declaration`, `function_expression`, `generator_function`; `parameters: formal_parameters`, `body: statement_block` | `body` is a `statement_block`, but FunctionBody is not a Block, so it belongs to the function scope (see D1 for the exception) | **OK**: every function-like node is a scope, at any depth ([scope.scm](src/queries/scoping/scope.scm)). The body merges into it unless the parameters contain an expression ([rules.ts](src/scoping/rules.ts) `isMergedBody`, D1) |
| Arrow functions | [15.3.4][arrow], [10.2.11][fdi] | `arrow_function`; `parameter: identifier` or `parameters: formal_parameters`; `body: statement_block` or an expression | With an expression body, the arrow node itself is the scope; there is no block | **OK**: same as functions, including expression bodies and IIFEs |
| Methods, getters, setters (class and object literal) | [15.4.5][methoddef] | `method_definition` (`name:`, `parameters:`, `body:`) under `class_body member:` or `object` | Same node type in both places; `get`, `set` and `static` are anonymous tokens | **OK**: class and object-literal methods. Each gets a `name@start` segment, so a getter/setter pair no longer shares a path |
| Class scope (class environment + PrivateEnvironment), covering the heritage clause and the body | [15.7.14][classdef] | `class_declaration`, `class`; `name:` (optional on `class`), unfielded `class_heritage`, `body: class_body` | `class_body` is not a separate scope | **OK**: `class_declaration` and `class` in any position ([scope.scm](src/queries/scoping/scope.scm)) |
| Class static block: its own var scope (the body runs through FunctionDeclarationInstantiation) | [15.7.11][staticdef], [15.7.12][staticbody] | `class_static_block body: statement_block` | The body block merges into the static-block scope | **OK**, including `var` ([rules.ts](src/scoping/rules.ts) `isVarScope`) |
| Field initializer: evaluated as a method whose scope is the class environment | [15.7.10][fielddef] | `field_definition value:` | An expression can't declare anything directly, so for bindings it is transparent; only functions and classes nested in it open scopes | **OK**: transparent; functions and classes inside it open their own scopes at any depth |
| Block | [14.2.2][blockeval], [14.2.3][bdi] | `statement_block` | The same node type is used for function, static-block and catch bodies, which merge into their parent. It is a real Block for `try` and `finally` bodies, loop/if/else/labeled bodies, and bare blocks | **OK**: every `statement_block` that is not a merged body ([rules.ts](src/scoping/rules.ts) `isMergedBody`); each is captured once |
| `if`/`else`: no scope of their own; a braced branch is a Block | [14.6][if] | `if_statement` (`condition:`, `consequence: statement`, `alternative: else_clause`); `else_clause` (unfielded statement) | An unbraced branch has no scope; only `var` or a sloppy-mode [B.3.3][annexb33] function can appear there | **OK**: no node of their own (D4); a braced branch is a block, an unbraced one adds no scope |
| `while` and `do … while`: same as `if` | [14.7.3][while], [14.7.2][dowhile] | `while_statement`, `do_statement` (`condition:`, `body: statement`) | — | **OK**: same as `if` |
| `switch`: the discriminant is in the enclosing scope; the whole case block is one scope | [14.12.4][switcheval] | `switch_statement` (`value:`, `body: switch_body`); `switch_case` (`value:`, `body:`*); `switch_default` (`body:`*) | The spec's CaseBlock is `switch_body`. Case bodies are bare statement lists (repeated `body:` fields), not blocks | **OK**: `switch_body` is the scope ([scope.scm](src/queries/scoping/scope.scm)) |
| `for (;;)`: a loop scope for a lexical head; the body block is a separate, nested Block | [14.7.4.2][forloop], [14.7.4.4][periter] | `for_statement` (`initializer:`, `condition:`*, `increment:`, `body: statement`) | `for (let i;;) { let i; }` is legal, so the body must be its own scope | **OK**: a loop scope for the head, and the braced body is its own block |
| `for-in` / `for-of` / `for await`: a loop scope for the head; `right` is evaluated in a TDZ scope holding the same names; the body Block is separate | [14.7.5.6][forinofhead], [14.7.5.7][forinofbody] | `for_in_statement` (`kind:`*, `left:`, `operator:`, `right:`, `body:`, `value:`) | `for await` is an unfielded `"await"` token; `await using` appears as two `kind:` tokens; `value:` is the Annex [B.3.5][annexb35] initializer | **OK**: head, `right` and body as the spec requires |
| `try` / `catch` / `finally`: the try and finally bodies are Blocks; catch has a parameter scope, then its own Block | [14.15.2][catch] | `try_statement` (`body:`, `handler: catch_clause`, `finalizer: finally_clause`); `catch_clause` (optional `parameter:`, `body:`); `finally_clause` (`body:`) | — | **OK**: try and finally bodies are blocks; `catch_clause` is one scope holding the parameter and the catch block (D3) |
| Labeled statement: no scope; labels live in label sets, not environments | [14.13][labelled], [14.13.4][labelledeval] | `labeled_statement` (`label: statement_identifier`, `body: statement`) | Must be treated as transparent, like `export` | **OK**: transparent |
| `with`: an object environment | [14.11][with], [9.1.1.2][objenv] | `with_statement` (`object:`, `body:`) | Sloppy mode only | Out of reach (§6). Declarations in the body are extracted like any block; there is no lookup barrier (D10) |

## 2. Binding forms

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| `var` | [14.3.2][var], [8.2.8][vardeclarednames] | `variable_declaration` > `variable_declarator name:` | — | **OK** ([binding.scm](src/queries/scoping/binding.scm)); attachment in §3 |
| `let`, `const` | [14.3.1][letconst] | `lexical_declaration` (`kind:`) > `variable_declarator name:` | — | **OK** ([binding.scm](src/queries/scoping/binding.scm)) |
| `using`, `await using` | [14.3.1][letconst], [14.3.1.1][letconstee] | `using_declaration` (`kind:` is `"using"`, or `"await"` + `"using"`) > `variable_declarator` | Identifiers only; no patterns. A syntax error at Script top level and directly inside a `case`/`default` clause. **Grammar gap:** `for (using x = f();;)` is valid ES, but 0.25 parses it to `ERROR`, so letant rejects the whole file with `CORE_SYNTAX_ERROR`. `for (using x of …)` parses fine | **OK** (statement form); the grammar gap remains |
| Destructuring | [8.6.2][bindinginit], [8.2.1][boundnames] | `object_pattern`, `array_pattern`, `pair_pattern value:`, `shorthand_property_identifier_pattern`, `assignment_pattern left:`, `object_assignment_pattern left:`, `rest_pattern` | The `pattern` supertype also allows `member_expression` and `subscript_expression`, which are only valid as assignment targets. `undefined` has its own node type, but it is an ordinary name that can be shadowed | **OK** ([utility/pattern.ts](src/scoping/utility/pattern.ts)), including a binding named `undefined` |
| Parameters | [10.2.11][fdi] | `formal_parameters` children; `arrow_function parameter:` | — | **OK** for every function-like node ([binding.scm](src/queries/scoping/binding.scm) `@binding.parameter`) |
| Function declaration name | [8.2.1][boundnames], [15.2.4][instfuncdecl] | `function_declaration name:`, `generator_function_declaration name:` | — | **OK**: a binding in the enclosing scope, separate from the function's scope node |
| Function expression's own name | [15.2.5][instfuncexpr] | `function_expression name:`, `generator_function name:` | — | **OK**: bound inside the function unless a parameter or body declaration shadows it ([extract.ts](src/scoping/extract.ts), D5) |
| Class declaration name: an outer lexical binding plus an inner immutable one | [15.7.15][bindingclass], [15.7.14][classdef] | `class_declaration name:` | — | **OK**: one binding in the enclosing scope stands for both |
| Class expression name: inner binding only | [15.7.16][classeval] | `class name:` | — | **OK**: bound inside the class scope (D5) |
| Catch parameter | [14.15.2][catch] | `catch_clause parameter:` (`identifier`, `object_pattern` or `array_pattern`) | — | **OK** ([binding.scm](src/queries/scoping/binding.scm) `@binding.catch`) |
| Imports | [16.2.2.2][importentries], [16.2.1.7][stmr] (ImportEntry table), [9.1.1.5.5][createimport] | `import_statement` (`source:`) > unfielded `import_clause` > `identifier` (default import), `namespace_import` > `identifier`, or `named_imports` > `import_specifier` (`name:` is `identifier`, `string` or `"default"`; `alias:` optional). `import_attribute` binds nothing | `import v` has import name `"default"`; `* as ns` imports the namespace; `import "m"` creates no binding | **DIFF**: every form is captured, including `{ default as v }` and `{ "s" as v }` (`alias_of` records the import name). Still open (D7): a plain default import doesn't record the import name `"default"`, and a namespace import resolves to nothing when the target file is open |
| `export` with a declaration | [16.2.3][exports], [16.2.3.4][exportentries] | `export_statement declaration:` | The local name equals the export name | **OK**: `export_statement` is transparent, at any depth; no bypass |
| `export default` | [16.2.3.4][exportentries], [16.2.3.7][exporteval] | A named function, generator or class goes in `declaration:`. An anonymous `function_expression`, `generator_function`, `class` or `arrow_function`, or any other expression, goes in `value:` (async variants included; `(function f(){})` is `value: parenthesized_expression`) | Named form: local `f`, export name `"default"`. Anonymous or expression form: the synthetic local `*default*`, which no identifier can reference | **DIFF**: scopes and bindings inside `value:` forms are extracted, but there is no `*default*` or export entry (D7) |
| Export lists and re-exports | [16.2.1.7][stmr] (ExportEntry table) | `export_clause` > `export_specifier` (`name:`, optional `alias:`; each is an `identifier`, `string` or `"default"`); `namespace_export`; `source:` | None of these creates a local binding (LocalName is null for the `from` forms) | **DIFF**: correctly no local binding, but no export entry either. Cross-file lookup still matches the import name against the *top-level local names* (D7) |
| Private names | [15.7.8][privatebound], [9.2][privateenv], [9.2.1.2][resolveprivate], [15.7.7][allprivatevalid] | `private_property_identifier` as `field_definition property:` or `method_definition name:`; used in `member_expression property:` and in `#x in o` (`binary_expression left:`) | A separate namespace. An undeclared `#x` is an early error, so private names resolve statically. A getter and setter share one name | **OK**: a binding in the class scope. Public elements have `name@start` segments, so they can't collide |
| `arguments` | [10.2.11][fdi] (argumentsObjNeeded), [10.4.4][argsobj], [15.7.9][containsargs] | A plain `identifier`; nothing declares it | Exists only in non-arrow functions. Suppressed by a parameter named `arguments`, or (when there are no parameter expressions) by a function or lexical declaration with that name. A syntax error in field initializers and static blocks | **MISSING**: unresolved, i.e. a terminal (D9) |

## 3. Attachment (where a name does not simply go to the nearest boundary)

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| `var` goes to the var scope, skipping blocks, loop heads, catch clauses and switch bodies | [8.2.9][varscoped], [10.2.11][fdi], [15.7.12][staticbody], [16.1.7][gdi] | `variable_declaration` anywhere; `for_statement initializer: variable_declaration`; `for_in_statement kind: "var"` | — | **OK** ([extract.ts](src/scoping/extract.ts) `varScope`, [rules.ts](src/scoping/rules.ts) `isVarScope`) |
| A function declaration at the top level of a function body, static block or `program` goes to the var scope | [8.2.13][toplevelvarscoped] | `function_declaration`, `generator_function_declaration` | Same scope as the nearest boundary | **OK**: for duplicates, the last function declaration is kept |
| A function declaration in a block or `switch_body` goes to that block. In sloppy mode only (Annex B), it *also* creates a `var` in the var scope, unless that would conflict (it would be an early error as a `var`, it matches a parameter name, or it is `"arguments"`); that `var` is assigned when the declaration runs | [14.2.3][bdi], [B.3.2][annexb32] (Normative Optional steps in [10.2.11][fdi], [14.2.3][bdi], [16.1.7][gdi]) | `function_declaration` under `statement_block`, `switch_case` or `switch_default` | Strict code (every module, every class body, `"use strict"` code) is block-only. Related sloppy-only forms: [B.3.1][annexb31] labelled function declarations and [B.3.3][annexb33] `if (x) function f(){}` | **OK** for strict semantics; Annex B is not modeled (D2) |
| A function or class *declaration* name goes to the enclosing scope, not the function's or class's own scope | [8.2.1][boundnames], [15.7.15][bindingclass] | `name:` | — | **OK** |
| A function or class *expression*'s own name goes to an intermediate scope that wraps only that function or class; its parameters and body declarations shadow it | [15.2.5][instfuncexpr], [15.7.14][classdef] | `function_expression name:`, `generator_function name:`, `class name:` | — | **OK** (D5) |
| Parameters go to the function's parameter scope. If `formal_parameters` contains an expression (a default `=`, or a computed key in a pattern), the body's `var` and function declarations go into a separate inner scope | [10.2.11][fdi] (the step "A separate Environment Record is needed to ensure that closures created by expressions in the formal parameter list do not have visibility of declarations in the function body"), [15.1.2][containsexpr] | `formal_parameters` containing `assignment_pattern`, `object_assignment_pattern` or `computed_property_name` | A lexical declaration in the body can't reuse a parameter name (early error) | **OK**: the body becomes its own scope when the parameters contain an expression ([rules.ts](src/scoping/rules.ts) `hasSeparateBody`, D1) |
| The catch parameter goes to the catch scope. The catch block can't redeclare it with `let`/`const`. A `var` with the same name (allowed by Annex [B.3.4][annexb34] for a simple identifier only) still goes to the var scope | [14.15.1][catchee], [B.3.4][annexb34] | `catch_clause parameter:` | — | **OK** |
| Loop-head `let`/`const`/`using` go to the loop scope; body declarations go to the body block | [14.7.4.2][forloop], [14.7.5.7][forinofbody] | `for_statement initializer:` and `for_in_statement left:`, versus `body: statement_block` | — | **OK** |
| Imports go to the module scope | [16.2.1.7.3.1][initenv] | `import_statement` (top level only) | — | **OK** |
| An anonymous or expression `export default` creates the synthetic `*default*` in the module scope | [16.2.3.7][exporteval] | `export_statement value:` | — | **MISSING** (D7) |
| Export entries are not local bindings. They form the module's export table, mapping each export name to a local name, to (another module, import name), or to a namespace | [16.2.3.4][exportentries], [16.2.1.7][stmr] | `export_specifier`, `namespace_export`, `export_statement source:` | — | **MISSING**: confused with top-level local names (D7) |
| Private names go to the class whose `class_body` declares them | [15.7.14][classdef] | `private_property_identifier` | — | **OK** |
| `arguments`, if modeled, goes to the nearest non-arrow function | [10.2.11][fdi] | — | — | **MISSING** (D9) |

## 4. Lookup (exceptions to "search every enclosing scope")

| Rule | Spec | Node types / fields | Shape notes | letant today |
| --- | --- | --- | --- | --- |
| Default: search from the innermost scope outward to `program`; if not found, end in a terminal (global object or host) | [9.1.2.1][getidref], [9.4.2][resolvebinding] | `identifier` | — | **OK** ([cursor.ts](../../src/core/tree/cursor.ts) `resolve`) |
| Parameter expressions can't see body declarations: in `function f(a = b) { var b }`, `b` is the *outer* `b` | [10.2.11][fdi] | names inside `formal_parameters` | Parameters can see each other (a later one is in its TDZ) | **OK** |
| A function expression's own name is visible in its parameters and body, is shadowed by them, and is invisible outside | [15.2.5][instfuncexpr] | `function_expression name:` | — | **OK** |
| Class: the inner class name is visible in the heritage clause, in computed keys and in every element. The heritage clause is evaluated with the *outer* PrivateEnvironment, so `#x` inside `extends …` refers to an enclosing class's `#x` | [15.7.14][classdef] (the NOTE on ClassHeritage) | `class_heritage`, `computed_property_name` inside `class_body` | — | **OK** for declarations and expressions. The heritage private-name rule is not modeled |
| Class elements are not bindings: a bare name in a method or initializer never resolves to a method, field or accessor name | [15.7.13][classelem] (elements become properties via DefineMethodProperty / DefineField) | public `method_definition name:` and `field_definition property:` | Python has the same problem from the other side (class-body names are not visible from methods), so one core mechanism could serve both languages | **OK**: public elements get `name@start` segments, which no identifier can match ([extract.ts](src/scoping/extract.ts) `declareElement`, D6) |
| Object-literal keys and method names are not bindings; computed keys are evaluated in the enclosing scope | [13.2.5.6][propdef] | `pair key:`, and `method_definition name:` inside `object`. `shorthand_property_identifier` *is* a reference | — | **OK**: object methods are scopes with `name@start` segments; keys are not bindings |
| Private names resolve only against the private names of class scopes, outward through enclosing classes | [9.2.1.2][resolveprivate] | `private_property_identifier` | — | **OK** |
| The `right` side of `for-in`/`for-of` sees the head's lexical names (in their TDZ) | [14.7.5.6][forinofhead] | `for_in_statement right:` | — | **OK** |
| The `switch` discriminant and the `if`/`while`/`do` conditions resolve in the enclosing scope | [14.12.4][switcheval], [14.6][if] | `value:` / `condition:` | — | **OK** (tested) |
| Labels are a separate namespace and are never looked up in environments | [14.13.4][labelledeval] | `statement_identifier` | Not an `identifier`, so the reference query skips it | **OK**: `statement_identifier` is not in [reference.scm](src/queries/utility/reference.scm), so `origin` answers nothing |
| Inside `with`, any name not bound within the `with` body depends on the object's properties | [9.1.1.2][objenv], [14.11][with] | `with_statement body:` | — | Not handled (D10) |
| A sloppy-mode direct `eval` can add `var` bindings to the calling function at run time; a strict-mode `eval` can't | [19.2.1.1][performeval], [19.2.1.4][evaldecl] | `call_expression function: identifier "eval"` | Whether the callee really is the built-in `eval` is itself a run-time fact | Ignored (D10) |
| Positions that aren't references (a property after `.`, object keys, string contents, JSX attribute names, labels) must not resolve | — | `property_identifier`, `string_fragment`, … | — | **OK**: `origin` resolves a position only if the plugin's `references` returns its node ([reference.scm](src/queries/utility/reference.scm), [rules.ts](src/scoping/rules.ts) `isReference`) |
| JSX (not ECMAScript): a capitalized tag names a variable; a lowercase tag is an intrinsic string. This is the React/TypeScript convention ([handbook][tsjsx]) | — | `name:` on `jsx_opening_element`, `jsx_closing_element` and `jsx_self_closing_element` is an `identifier` (check its case), a `member_expression` (its root `identifier` is the reference), or a `jsx_namespace_name` (never a reference) | — | **OK**: capitalized tags and member-tag roots resolve; lowercase tags and attribute names do not ([rules.ts](src/scoping/rules.ts) `isReference`) |

## 5. Proposed boundary set

| Node type | Opens | Caveat |
| --- | --- | --- |
| `program` | the module scope (the global scope for a script) | the file root, already created by core |
| `function_declaration`, `generator_function_declaration`, `function_expression`, `generator_function`, `arrow_function`, `method_definition` | a function scope: the parameters plus the body's top level (var and lexical declarations) | `body: statement_block` belongs to it, except under D1(B) when the parameters contain an expression; then the body block is a nested scope. `method_definition` counts in both `class_body` and `object` |
| `class_declaration`, `class` | a class scope: the inner class name plus the private names | covers the heritage clause and `class_body`. Public element names are not bindings (D6) |
| `class_static_block` | a var scope | `body: statement_block` belongs to it |
| `catch_clause` | a catch scope: the parameter plus the catch block's declarations | `body: statement_block` belongs to it (D3) |
| `for_statement`, `for_in_statement` | a loop-head scope | covers the head, `right` and the body. A braced body is a further `statement_block` scope |
| `switch_body` | one block scope for all cases | the discriminant is outside it |
| `statement_block` | a block scope | **except** when it is the `body:` of a function-like node, `class_static_block` or `catch_clause` (and see D1) |

**Not boundaries:** these are transparent wrappers; any braced body inside them is its own `statement_block` scope.

- `if_statement`, `else_clause`, `while_statement`, `do_statement`
- `try_statement`, `finally_clause`, `labeled_statement`
- `switch_statement`, `switch_case`, `switch_default`
- `export_statement`, `class_body`, `object`, `formal_parameters`
- `field_definition`: transparent for bindings (its name is covered by D6).
- `parenthesized_expression` and `call_expression`: in an IIFE, the function itself is the boundary.

`with_statement` is not a boundary but a lookup barrier (D10).

**Var scopes** (for `var` and Annex B attachment): function-like nodes, `class_static_block`, `program`.

## 6. Out of reach (ADR 0005)

| Construct | Why |
| --- | --- |
| `with` ([14.11][with]) | An object environment: HasBinding is a property check on an object that exists only at run time. Sloppy mode only (a syntax error in strict code and modules) |
| Direct `eval` in sloppy code, and `new Function(...)` | They introduce bindings from strings built at run time ([19.2.1.4][evaldecl]) |
| The global object ([19][globalobj]) | Undeclared names (`console`, `window`, implicit globals from sloppy assignment, `globalThis.x = …`) end in a terminal. Host globals are not modeled |
| Sharing between scripts | Top-level script bindings live in the shared global environment ([16.1.7][gdi]), and the host decides which scripts share it |
| Whether a `.js` file is a script or a module | Decided by the host (package.json `type`, `<script type="module">`). It determines strict mode, and therefore whether Annex B applies (D2, D11) |
| Member access (`this.x`, `obj.x`, `obj[k]`, `super.x`), `import(expr)`, CommonJS `require` | Depend on the receiver or value; the import specifier is computed; `require` is a host function, not ECMAScript |

`this`, `super`, `new.target` and `import.meta` are excluded because they aren't name bindings, not because they are out of reach.

## 7. Modeling decisions for the user

**Taken (2026-11-11):** D1 B, D2 A, D3 A, D4 A, D5 B, D8 A, D11 A. D6 is settled in the plugin without a core change: public elements get `name@start` segments (a variant of B). **Open:** D7, D9, D10, D12.

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | A separate parameter scope when the parameters contain expressions | **A** One function scope (today). Wrong only when a default or computed key names something also declared in the body. **B** Make the body block its own scope exactly when `formal_parameters` contains an `assignment_pattern`, `object_assignment_pattern` or `computed_property_name` (this is the spec's ContainsExpression, mirroring FunctionDeclarationInstantiation). **C** Always make the body its own scope. This moves a `var x` that redeclares parameter `x` onto the `var` instead of the parameter | **B**: exact, needs only syntax, and adds depth only to functions that have defaults. **A** is acceptable if a uniform tree shape matters more |
| D2 | Annex B function-in-block (sloppy mode) | **A** Strict semantics everywhere (today). **B** Detect sloppy code (no import/export, no `"use strict"` prologue, not inside a class) and add the extra `var` binding. **C** A config switch | **A**, recorded as a declined rule. For a `.js` file without import/export, whether it is sloppy is decided by the host (D11). Revisit only if users bring legacy scripts |
| D3 | Catch: one scope or two | **A** One scope (`catch_clause`). **B** A catch scope plus a block scope | **A**: 14.15.1 forbids redeclaring the parameter with `let`/`const`, and `var` leaves the catch anyway, so the two models give the same lookups |
| D4 | Loop bodies and `if`/`while`/`do` bodies | **A** Make `statement_block` the boundary and drop the `if@`/`else@`/`while@`/`do@` wrapper nodes. **B** Keep the wrappers, but make a braced loop body its own scope | **A**: matches the spec, and fixes both the `for` shadowing collision and the unbraced-`var` attachment at once. Keep the wrappers only if their `kind` matters for disclosure |
| D5 | The own name of a function or class *expression* | **A** An intermediate anonymous scope that holds only that name. **B** A binding inside the function or class scope, emitted only if no parameter or body declaration has that name | **B**: same answers without an extra disclosure level |
| D6 | Class elements versus bare-name lookup | **A** A language-neutral "not a lexical binding" flag that core `resolve` skips; elements stay visible for disclosure. **B** Rename element segments so they can never equal an identifier (e.g. `.m`, `static .m`, `get .g`). **C** Drop elements from the tree | **A** (a core change, which Python class bodies would also need). Private `#` segments stay resolvable, but only from `private_property_identifier` references. Giving accessors distinct segments would also fix the getter/setter path collision |
| D7 | Export names versus local names (including `*default*`) | **A** A per-file export table (export name → local path, or (source, import name), or namespace) that cross-file lookup uses instead of top-level names; anonymous default exports get a local `*default*` scope or binding. **B** Emit exports as top-level nodes named by export name. This collides with locals, e.g. `const y; export { x as y }`. **C** Option B with a reserved prefix segment | **A** (needs a core change in `Workspace.origin`). Also: a default import should carry the import name `"default"`, and a namespace import should land on the target module itself |
| D8 | Path segment for unnamed boundaries (callbacks, object methods, IIFEs, anonymous default exports) | **A** `kind@startIndex`, like `block@N`. **B** Borrow a nearby name (a variable or property key) | **A**. Invariant: a segment may equal an identifier only if the node really binds that name. Today, the assigned IIFE in `const r = (function(){…})()` names the function scope `r` and lands on the function body, although `r` holds the call's result |
| D9 | `arguments` | **A** A terminal (today). **B** An implicit binding on each non-arrow function, landing on the function node, suppressed by the spec's argumentsObjNeeded rule | **B**, low priority: it needs only syntax. Depends on ADR 0004's open "landing range" question |
| D10 | `with` and sloppy direct `eval` | **A** Ignore them; the static answer may be wrong. **B** A lookup barrier: a lookup that leaves the barrier ends in a terminal | For `with`, **B** (cheap: the barrier is the `with_statement` body). For `eval`, **A**, documented: whether a call is "direct" is itself a run-time fact, and module code is strict |
| D11 | Script versus module | **A** Treat every file as a module (strict). **B** A per-file config setting | **A**: it only matters for Annex B and `with` |
| D12 | `ns.x` on a namespace import | Exports are fixed at link time and import bindings are immutable, so this is decided by syntax. It passes ADR 0005's admission test even though it looks like member access | Defer past Phase 1, but note that it is admissible |

## Appendix: cases still failing

Single-file cases from the earlier list are now in `__tests__/resolution.test.ts`. These remain:

| Source | Name at | Expected | Why it fails |
| --- | --- | --- | --- |
| lib: `const x = 1; export { x as y }`; main: `import { y } from "./lib.js"` | `y` | lib `const x` | exports are not modeled (D7) |
| lib: `export default 42`; main: `import v from "./lib.js"` | `v` | lib's `export default 42` | D7 |
| lib: `const hidden = 1`; main: `import { hidden } from "./lib.js"` | `hidden` | unresolved | D7 |

[spec]: https://tc39.es/ecma262/
[getidref]: https://tc39.es/ecma262/#sec-getidentifierreference
[resolvebinding]: https://tc39.es/ecma262/#sec-resolvebinding
[getthisenv]: https://tc39.es/ecma262/#sec-getthisenvironment
[meta]: https://tc39.es/ecma262/#sec-meta-properties
[objenv]: https://tc39.es/ecma262/#sec-object-environment-records
[funcenv]: https://tc39.es/ecma262/#sec-function-environment-records
[globalenv]: https://tc39.es/ecma262/#sec-global-environment-records
[moduleenv]: https://tc39.es/ecma262/#sec-module-environment-records
[createimport]: https://tc39.es/ecma262/#sec-createimportbinding
[privateenv]: https://tc39.es/ecma262/#sec-privateenvironment-records
[resolveprivate]: https://tc39.es/ecma262/#sec-resolve-private-identifier
[boundnames]: https://tc39.es/ecma262/#sec-static-semantics-boundnames
[vardeclarednames]: https://tc39.es/ecma262/#sec-static-semantics-vardeclarednames
[varscoped]: https://tc39.es/ecma262/#sec-static-semantics-varscopeddeclarations
[toplevelvarscoped]: https://tc39.es/ecma262/#sec-static-semantics-toplevelvarscopeddeclarations
[bindinginit]: https://tc39.es/ecma262/#sec-runtime-semantics-bindinginitialization
[fdi]: https://tc39.es/ecma262/#sec-functiondeclarationinstantiation
[argsobj]: https://tc39.es/ecma262/#sec-arguments-exotic-objects
[propdef]: https://tc39.es/ecma262/#sec-runtime-semantics-propertydefinitionevaluation
[blockeval]: https://tc39.es/ecma262/#sec-block-runtime-semantics-evaluation
[bdi]: https://tc39.es/ecma262/#sec-blockdeclarationinstantiation
[letconst]: https://tc39.es/ecma262/#sec-let-and-const-declarations
[letconstee]: https://tc39.es/ecma262/#sec-let-and-const-declarations-static-semantics-early-errors
[var]: https://tc39.es/ecma262/#sec-variable-statement
[if]: https://tc39.es/ecma262/#sec-if-statement
[dowhile]: https://tc39.es/ecma262/#sec-do-while-statement
[while]: https://tc39.es/ecma262/#sec-while-statement
[forloop]: https://tc39.es/ecma262/#sec-runtime-semantics-forloopevaluation
[periter]: https://tc39.es/ecma262/#sec-createperiterationenvironment
[forinofhead]: https://tc39.es/ecma262/#sec-runtime-semantics-forinofheadevaluation
[forinofbody]: https://tc39.es/ecma262/#sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset
[with]: https://tc39.es/ecma262/#sec-with-statement
[switcheval]: https://tc39.es/ecma262/#sec-switch-statement-runtime-semantics-evaluation
[labelled]: https://tc39.es/ecma262/#sec-labelled-statements
[labelledeval]: https://tc39.es/ecma262/#sec-runtime-semantics-labelledevaluation
[catchee]: https://tc39.es/ecma262/#sec-try-statement-static-semantics-early-errors
[catch]: https://tc39.es/ecma262/#sec-runtime-semantics-catchclauseevaluation
[containsexpr]: https://tc39.es/ecma262/#sec-static-semantics-containsexpression
[instfuncdecl]: https://tc39.es/ecma262/#sec-runtime-semantics-instantiateordinaryfunctiondeclaration
[instfuncexpr]: https://tc39.es/ecma262/#sec-runtime-semantics-instantiateordinaryfunctionexpression
[arrow]: https://tc39.es/ecma262/#sec-runtime-semantics-instantiatearrowfunctionexpression
[methoddef]: https://tc39.es/ecma262/#sec-runtime-semantics-methoddefinitionevaluation
[allprivatevalid]: https://tc39.es/ecma262/#sec-static-semantics-allprivateidentifiersvalid
[privatebound]: https://tc39.es/ecma262/#sec-static-semantics-privateboundidentifiers
[containsargs]: https://tc39.es/ecma262/#sec-static-semantics-containsarguments
[fielddef]: https://tc39.es/ecma262/#sec-runtime-semantics-classfielddefinitionevaluation
[staticdef]: https://tc39.es/ecma262/#sec-runtime-semantics-classstaticblockdefinitionevaluation
[staticbody]: https://tc39.es/ecma262/#sec-runtime-semantics-evaluateclassstaticblockbody
[classelem]: https://tc39.es/ecma262/#sec-static-semantics-classelementevaluation
[classdef]: https://tc39.es/ecma262/#sec-runtime-semantics-classdefinitionevaluation
[bindingclass]: https://tc39.es/ecma262/#sec-runtime-semantics-bindingclassdeclarationevaluation
[classeval]: https://tc39.es/ecma262/#sec-class-definitions-runtime-semantics-evaluation
[gdi]: https://tc39.es/ecma262/#sec-globaldeclarationinstantiation
[stmr]: https://tc39.es/ecma262/#sec-source-text-module-records
[initenv]: https://tc39.es/ecma262/#sec-source-text-module-record-initialize-environment
[importentries]: https://tc39.es/ecma262/#sec-static-semantics-importentries
[exports]: https://tc39.es/ecma262/#sec-exports
[exportentries]: https://tc39.es/ecma262/#sec-static-semantics-exportentries
[exporteval]: https://tc39.es/ecma262/#sec-exports-runtime-semantics-evaluation
[performeval]: https://tc39.es/ecma262/#sec-performeval
[evaldecl]: https://tc39.es/ecma262/#sec-evaldeclarationinstantiation
[globalobj]: https://tc39.es/ecma262/#sec-global-object
[annexb31]: https://tc39.es/ecma262/#sec-labelled-function-declarations
[annexb32]: https://tc39.es/ecma262/#sec-block-level-function-declarations-web-legacy-compatibility-semantics
[annexb33]: https://tc39.es/ecma262/#sec-functiondeclarations-in-ifstatement-statement-clauses
[annexb34]: https://tc39.es/ecma262/#sec-variablestatements-in-catch-blocks
[annexb35]: https://tc39.es/ecma262/#sec-initializers-in-forin-statement-heads
[tsjsx]: https://www.typescriptlang.org/docs/handbook/jsx.html
