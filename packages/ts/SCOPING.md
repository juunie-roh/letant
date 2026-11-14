# TypeScript scoping reference — `@letant/ts`

This is the reference for the TypeScript plugin. It lists the rules that decide where a name is bound, maps each one to tree-sitter-typescript nodes, and records what the plugin does. The value side of TypeScript is ECMAScript: every rule of [`packages/js/SCOPING.md`](../js/SCOPING.md) applies unchanged, and only what TypeScript adds or changes is recorded here.

| | |
| --- | --- |
| Specification | There is none that is maintained. The language specification stopped at version 1.8 (2016) and was archived; the handbook is not normative. For the value side the specification is ECMA-262. For the type side the compiler is the definition: every rule below was checked against `typescript` 6.0.3, the version this package depends on, through the comparison in [Acceptance](#acceptance). |
| Grammar | tree-sitter-typescript 0.23.2, the `tsx` grammar, for every extension. Fields are written `field:`. Every shape claim was checked against a real parse. |
| letant | `src/queries/scoping/`, `src/scoping/`. Checked through `Workspace.origin` against the compiler ([Acceptance](#acceptance)) and by `__tests__/resolution.test.ts`. Links are relative to `packages/ts/`. |

**In scope:** identifier bindings in all three of TypeScript's meanings (value, type, namespace), and private names.

**Excluded**, beyond what the JavaScript reference excludes:

- Members: the right side of `a.b`, of a qualified type name `A.B`, and of `import x = A.b`. They are found through their owner, not by a lookup in scope (§5).
- Anything that needs the checker's inference (§5).

Two facts the rest of this document relies on:

- **A name has up to three meanings, and a position asks for one.** `interface A {}` and `const A = 1` in one scope are two bindings. A lookup takes the nearest scope that binds the name *in a meaning the position asks for*, and passes a scope that binds it only in another.
- **In letant, a binding is identified by its path and its space.** The space is a field of the node (`Node.space`); left out, the name is a value. `Workspace.origin` asks the plugin which spaces a reference is looked up in (`spacesOf`), and `resolve` takes the nearest binding in one of them.

## 1. Boundaries

The JavaScript boundaries apply. TypeScript adds:

| Rule | Node types / fields | Shape notes | letant |
| --- | --- | --- | --- |
| A signature without a body has a scope for its type parameters and parameters | `function_signature`, `method_signature`, `abstract_method_signature`, `call_signature`, `construct_signature`, `function_type`, `constructor_type` | An overload and an ambient function are `function_signature` | A function scope without a body |
| A class's scope also holds its type parameters | `class_declaration`, `abstract_class_declaration`, `class`; `type_parameters:` | A class's `name:` is a `type_identifier` | The class scope; its region starts at the type parameters, so a class decorator lies outside (§4) |
| An interface and a type alias have a scope for their type parameters | `interface_declaration`, `type_alias_declaration` | — | A scope; its region starts at the type parameters |
| A conditional type has a scope for the types its `extends` operand infers | `conditional_type` (`left:`, `right:`, `consequence:`, `alternative:`) with an `infer_type` in `right:` | The names are visible in `consequence:` only | A scope only when the operand declares an `infer`; its region is the true branch |
| A mapped type and an index signature have a scope for their key | `index_signature` holding a `mapped_type_clause`, or `name:` | Both are `index_signature` | A scope |
| A namespace is a scope and a `var` scope | `internal_module` (`namespace`, `module`), `module` (ambient, named by a string or an identifier); `body: statement_block` | A namespace as a statement is wrapped in `expression_statement` | A scope; the body block merges into it |
| An enum's body is a scope holding its members | `enum_body` | — | A scope |
| `declare global { … }` declares for the global scope | `ambient_declaration` > `statement_block` | The `global` token is anonymous | A block scope, and a `var` scope: its names stay inside it (§5) |

**Not boundaries:** `ambient_declaration` (`declare`), `export_statement`, `enum_declaration`, `interface_body`, `object_type`, `type_annotation`.

## 2. Binding forms and their spaces

A declaration is in exactly one space. The space says which meanings the name has:

| Space | Meanings | Declared by | Node types |
| --- | --- | --- | --- |
| *(none)* | value | everything JavaScript declares, an ambient function, an enum member, an index signature's parameter | as in JavaScript; `function_signature name:`; `enum_body name:`, `enum_assignment name:`; `index_signature name:` |
| `type` | type | interface, type alias, type parameter, `infer`, mapped type key | `interface_declaration name:`, `type_alias_declaration name:`, `type_parameter name:`, first child of `infer_type`, `mapped_type_clause name:` |
| `class` | value, type | class | `class_declaration name:`, `abstract_class_declaration name:`, `class name:` |
| `enum` | value, type, namespace | enum | `enum_declaration name:` |
| `namespace` | namespace | a namespace that holds types only | `internal_module name:`, `module name:` |
| `module` | namespace, value | any other namespace | the same |
| `alias` | whatever the import has | import, `import x = require()`, `import x = A.b` | `import_statement`, `import_require_clause`, `import_alias` |

A reference is looked up in the spaces that have the meaning its position asks for ([rules.ts](src/scoping/rules.ts) `spacesOf`):

| Position | Meaning | Spaces, in order |
| --- | --- | --- |
| An `identifier` in an expression, in `typeof x` (`type_query`), in `x is T` (`type_predicate`), in a decorator, in `extends` of a class | value | value, `class`, `enum`, `module`, `alias` |
| A `type_identifier` | type | `type`, `class`, `enum`, `alias` |
| The first name of `A.B.C` in a type (`nested_type_identifier module:`), of a namespace's own name, of the target of `import x = A.b` | namespace | `namespace`, `module`, `enum`, `alias` |
| `export { x }`, `export default x`, `export = x`, the target of `import x = y` | any | all of them, values first |

Rules of their own:

- **A namespace has a value unless it holds types only.** `isInstantiated` in [rules.ts](src/scoping/rules.ts) reads the body: interfaces, type aliases, imports, an `import x = …` that is not exported, and nested namespaces that hold types only leave it without one. This follows the compiler's `getModuleInstanceState`.
- **`namespace A.B { }` binds `A`.** `B` is a member of `A`.
- **An overloaded function is one binding**, at its implementation, or at its last signature when ambient. An overload is not a merge (§7).
- **`using x = …`** is parsed by this grammar as an assignment after a `using` token; it is captured in that shape.
- **A parameter property** (`constructor(private x: T)`) is a parameter; the property it also declares is a member.

## 3. Attachment

| Rule | letant |
| --- | --- |
| A function's body is a scope of its own when the signature refers to anything: a type, `typeof`, a type predicate, a default value, a decorator, or type parameters. A name in the signature must not see a declaration of the body (`function f(a: T) { interface T {} }`, `function f(p: typeof q) { var q }`) | [rules.ts](src/scoping/rules.ts) `hasSeparateBody`. This extends decision D1 of the JavaScript reference from parameter expressions to the whole signature. A function without annotations keeps one scope |
| Type parameters, parameters and the parameters of a signature go to the scope of the construct that declares them | [extract.ts](src/scoping/extract.ts) `declareParameter` |
| `infer U` goes to the nearest conditional type whose `extends` operand it is written in, through any signature or type in between | [rules.ts](src/scoping/rules.ts) `inferOwner` |
| An enum member goes to the enum's body | — |
| `var` stops at a namespace and at `declare global` | [rules.ts](src/scoping/rules.ts) `isVarScope` |

## 4. Lookup

| Rule | letant |
| --- | --- |
| A scope's names are visible in its region, and the region need not be the whole node: after the name for a declaration, the true branch for a conditional type | [rules.ts](src/scoping/rules.ts) `region`; a scope written inside a node but outside its region is attached outside it (`isOutsideOf`) |
| A member decorator and a class decorator are resolved outside the method and outside the class's type parameters | They lie before the region |
| The name `infer` declares is not offered as a reference: it lies outside the branch it is visible in | [rules.ts](src/scoping/rules.ts) `isReference` |
| Not references: the member of a qualified type name, a tuple member's name, `X` in `export as namespace X`, `undefined` and `null` as types | `isReference` |
| A class's type parameters are not visible in its static members, and the lookup does not continue outward either | Declined (§7) |
| A parameter decorator is resolved from the class, not from the function it is in | Declined where the function's signature declares the name (§7) |

## 5. Out of reach

Beyond §6 of the JavaScript reference:

| Construct | Why |
| --- | --- |
| Declaration merging across files: a global namespace or interface declared in several script files, `declare module "m"` augmenting a module, `declare global` | Which declarations make up a name is decided over the whole program, by the compiler. Within a file the plugin declines what merging affects (§7); across files it cannot see it. A name declared in `declare global` stays in its block, so a reference to it from the module resolves to nothing |
| The meanings of an import | They are the meanings of what is imported, in another file. An import is in every space; a value reference to an import that is a type only resolves to the import, where the compiler finds nothing |
| Members: `a.b`, `A.B` in a type, `E.Member`, `ns.x` | Found through the owner's exports or its type, not in scope. Qualified names and namespace imports are decided by declarations alone (decision D12 of the JavaScript reference), the rest by inference |
| Script or module | A file without `import` or `export` shares its top level with every other script of the program. The plugin treats each file alone |
| The standard library and ambient globals | Names such as `Array` and `console` are declared in files outside the workspace |

## 6. Grammar gaps

tree-sitter-typescript 0.23.2 rejects these, and letant rejects the file with `CORE_SYNTAX_ERROR`:

- `import("m").T` as a type.
- Variance annotations on type parameters (`in`, `out`), `accessor` fields, `for (using x of …)`.
- `<T>expr` type assertions, because every file is parsed with the `tsx` grammar.

## 7. What is declined

Each rule is decided by syntax, but the tree cannot express it. The plugin declines the position through `unsupported` ([rules.ts](src/scoping/rules.ts)), and `origin` answers `{ unsupported: rule }`. Every test reads syntax alone and errs towards declining.

| Rule | Declined | Test on syntax |
| --- | --- | --- |
| **Merged names.** Several declarations of one name with a meaning in common are one symbol: two interfaces, a class and an interface, a class or a function and a namespace, two namespaces, two enums | A reference with that name, anywhere in the file | One statement list holds two such declarations of the name. Two function declarations (overloads) do not count |
| **Merged scopes.** A namespace's body sees what the other declarations of that namespace export; an enum's body sees the members of its other declarations | A reference inside the body whose name another declaration of the same namespace or enum declares | A sibling declaration in the same statement list declares the name; if a sibling has a qualified name, every reference in the body |
| **Qualified namespace declarations.** `namespace A.B { }` is `B` nested in `A`, so `B` is in scope in the body | A reference in the body named like a later part of the name | — |
| **Static members.** A class's type parameters are not visible in a static member | A type reference in a static member or static block named like a type parameter of the class | Not when a generic in between declares the name as its own type parameter |
| **Parameter decorators.** Resolved from the class | A reference in a parameter's decorator named like a parameter or type parameter of the function | — |

## 8. Modeling decisions for the user

| # | Decision | Taken |
| --- | --- | --- |
| T1 | How one scope holds a name twice | A `space` field on the binding, part of its identity with the path; the plugin says which spaces a reference is looked up in. Core knows only `"value"` |
| T2 | Which spaces TypeScript has | Six besides value: one per set of meanings a declaration can have (§2). The names are this plugin's |
| T3 | Merging | Declined, explicitly (§7). The compiler's work, out of range |
| T4 | A function's body as its own scope | Whenever the signature refers to anything (§3). It adds a level to most annotated functions |
| T5 | A position that asks for any meaning (`export { x }`) | One answer: the first space that binds the name, values first |
| T6 | One grammar for every extension | `tsx`, as before. A `.ts` file with a `<T>expr` assertion is rejected (§6) |

**Open:** exports and cross-file lookup (D7 of the JavaScript reference) apply here unchanged; qualified names (`A.B`, D12) are admissible and not modeled.

## Acceptance

The TypeScript compiler plays the role `eslint-scope` plays for JavaScript, through [`scripts/compare-tsc.mjs`](scripts/compare-tsc.mjs):

```bash
pnpm build && pnpm ts build
pnpm ts compare [paths...] --files 100000
```

Each file is compiled alone and without the standard library. For every identifier the compiler finds by walking scopes, the declarations it names for the meaning the position asks for are compared with the binding `Workspace.origin` answers with; an import counts wherever it stops. Every other identifier (a member, a property, an unbound name) is checked to resolve to nothing. A declaration's own name is not compared. A position the plugin declines is counted apart, with whether the tree would have answered it correctly.

The comparison uses three internal functions of the compiler (`checker.resolveName`, `getMeaningFromLocation`, `getMeaningFromDeclaration`), so it is tied to the `typescript` version this package depends on.

Run of 2026-11-13, `typescript` 6.0.3:

| | Workspace dependencies (`node_modules/.pnpm`, files of 0.5–200 KB) | This repository (`src`, `packages`) |
| --- | --- | --- |
| Files compared | 4,906 of 5,070 (164 rejected by one of the two parsers) | 67 of 67 |
| References compared | 174,134 | 7,881 |
| Agreeing | 172,786 | 7,841 |
| Declined by the plugin (§7) | 1,348, all merged names | 40, all merged names |
| Disagreeing | 0 | 0 |
| Other identifiers, checked to resolve to nothing | 2,134 | 8 |

Of the positions declined, the tree would have answered all but 2 correctly, counting any declaration of the merged name as right. The rules of §7 other than merged names occur in neither corpus; they are covered by `__tests__/resolution.test.ts`.

Limits of the comparison:

- Where a symbol has several declarations with the asked meaning, any of them counts.
- The corpus is the workspace's dependencies, which are mostly declaration files: types, signatures, namespaces and ambient declarations are well covered, function bodies less so. This repository's own sources are the implementation code in it.
- Rules across files (§5) are not compared.
