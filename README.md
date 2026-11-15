# L'étant

L'étant is a short for _les étant_, meaning "The Beings" in French.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?logo=opensourceinitiative&logoColor=fff)](https://opensource.org/licenses/MIT)

Answer where a name came from, mechanically, from syntax alone.

## About

A structural code acquisition tool. letant parses source files using Tree-Sitter, extracts every scope boundary and name binding into a containment tree, and answers, for any position, where the name there was bound.

### A Different Question

Every other tool in this space asks "where is this symbol and who uses it?" — a cartographic question that requires mapping everything. L'étant asks "where did this come from?" — a genealogical question that requires only following the lineage of what you're looking at.

This follows the natural direction of reading code. When you read code, you encounter a symbol and look up where it came from. L'étant only traces forward: from usage to origin.

### Acquisition, Not Interpretation

Reading code is two activities: **acquisition** — locating where a name was bound — and **interpretation** — working out what the code means. The usual way of reading (grep, triage the hits, judge enclosure by indentation) performs acquisition through interpretation, and its mistakes go unnoticed.

Programming languages make the two separable. Under lexical scoping, what a name refers to is fixed by where it is written, before the program runs. L'étant extracts that scope/binding model from syntax and resolves names on it the way the language itself does: no ranking, no guessing, no reading meaning into the code. Interpretation stays with the reader, human or AI; L'étant hands them the exact position to read.

The same mechanism sets the boundary. Anything decided only while the program runs — a call-site receiver, the value of an object whose members are accessed, scope created at run time, a module path computed from values — is not in the source text, so L'étant does not resolve it. See ADR 0005.

The decisions behind the design are recorded in [`docs/architecture/decisions/`](docs/architecture/decisions/); "ADR" below refers to them.

## Languages

Each language is a plugin. Its rules are checked against the language's own implementation of name resolution, reference by reference, through `Workspace.origin`:

| Plugin | Rules from | Compared with | Result |
| ------ | ---------- | ------------- | ------ |
| `@letant/js` | ECMA-262 ([`SCOPING.md`](packages/js/SCOPING.md)) | `eslint-scope`, 1,501 files | 440,975 of 440,975 references agree |
| `@letant/python` | The Python Language Reference ([`SCOPING.md`](packages/python/SCOPING.md)) | CPython's `symtable`, the 3.14 standard library (1,861 files) | Of 1,583,449 positions: 1,485,952 agree, 97,435 parameter declarations are not offered as references, 62 are declined, none disagree |
| `@letant/ts` | ECMA-262 for values, the compiler for types ([`SCOPING.md`](packages/ts/SCOPING.md)) | The TypeScript compiler, 4,906 files | Of 174,134 references: 172,786 agree, 1,348 are declined, none disagree |

"Declined" means the plugin knows the tree would answer the position wrongly and says so instead (see [Queries](#queries)). The comparisons are in each package (`pnpm js compare`, `pnpm python compare`, `pnpm ts compare`); what each one cannot show is recorded in the package's `SCOPING.md`.

## Architecture

### Data Model

All output is a single type:

- **Node** — a scope or a name, identified by its `path`: the chain of segments from the file down to it (e.g. `["src/parse.js", "parseDate@120", "input"]`). A `kind` classifies it, a `type` gives its role, and `at` locates it: a source range, or — for an import binding — the module it came from.

There is no edge type. Containment is derived from paths — a node's parent is its path without the last segment — so the nodes of a file form a single-parent containment tree (ADR 0003). Inside a tree each node is interned to an integer `NodeId`; nothing is hashed (ADR 0002). Relations such as references are not stored: they are enacted by positional queries (ADR 0004).

### Node Roles

A scope is a region of source where names live; a binding is a name. They are separate nodes, so a scope is never found as a name (ADR 0006).

| `type` | Description | Path segment | `at` |
| ------ | ----------- | ------------ | ---- |
| `"anonymous"` | A scope: a function, class, block, loop, ... | `<label>@<start>`, never equal to an identifier | the region where its names are visible |
| `"binding"` | A name: a variable, parameter, declared function or class, import, ... | the name itself | the declaring identifier, or the module an import came from |
| `"scope"` | The file root | the file path | the file |

Three optional fields carry the rules a plain outward walk cannot express. Core applies them without knowing the language they come from:

| Field | On | Meaning |
| ----- | -- | ------- |
| `barrier` | a scope | A lookup that has left this scope no longer sees `local` bindings further out (ADR 0007). |
| `visibility: "local"` | a binding | Visible only to a lookup that has not left a barrier: a Python class's names, seen from its methods (ADR 0007). |
| `space` | a binding | Which of its language's namespaces the name is bound in, where one scope may bind a name once in each: TypeScript's `interface A` and `const A`. A binding is identified by its path and its space (ADR 0008). |

### Scoping Rules

Each plugin takes its rules from the language specification and records them beside its source, in its `SCOPING.md`, together with the rules it declines to model. There are four kinds (ADR 0006):

- **Boundaries** — which syntax opens a scope.
- **Binding forms** — which syntax introduces a name.
- **Attachment** — which scope a name goes into, where that is not the nearest boundary (`var` hoisting, a declaration's own name).
- **References** — which positions name a binding at all. A property after a dot, a label, or the inside of a string does not.

### Queries

Questions are pointed: one position in, one answer out (ADR 0004). `Workspace` answers two of them:

- `origin(file, offset)` — where was the name at this position bound? Answers with the declaration's position, following imports into files already opened in the workspace. Where a language binds a name in several namespaces, the name is looked up in the ones its position asks for (ADR 0008). When the trail leads into a file not yet opened, it stops at that module's path (or its original specifier, when it does not resolve to a file in the workspace). When the position is a reference that the tree would resolve incorrectly, because the language has a rule the model does not express, the plugin declines it and the answer is `{ unsupported: <the rule> }` (ADR 0007). When the position is not a reference, or the name cannot be resolved from syntax, it answers `undefined`.
- `at(file, offset)` — the innermost scope containing a position. Its children are the names and scopes directly inside it.

Files outside the configured `rootDir` are out of bounds: opening one, or following an import into one, is an error.

### Responsibilities

L'étant separates concerns across two layers:

**Language plugin** — holds the language's scoping rules. Its `extract` receives the root of a parsed file, runs tree-sitter queries over the whole file to collect every boundary and every binding form, attaches each name to its scope, and returns the nodes. Its `references` tells core which positions name a binding. Three optional functions cover what differs by language: the name a reference looks up when that is not its text (`nameOf`), the namespaces it is looked up in (`spacesOf`), and the references the plugin declines (`unsupported`). See the [plugin authoring guide](docs/workspace-docs/01-plugin-authoring.md).

**Core** — builds the containment tree from the plugin's nodes, resolves names on it by walking outward through enclosing scopes, and answers positional queries through `Workspace`. It knows no language: where a language hides some names from nested code, or binds one name several times in a scope, the plugin marks the scopes and bindings concerned and the walk follows the marks (ADR 0007, ADR 0008).

## Limitations

By design (ADR 0005):

- Nothing decided at run time is resolved: a member after a dot, `this` and `self`, scope built by `eval` or `with`, an import whose path is computed.
- Lookup goes one way, from a use to its declaration. "Who uses this" is not answered.

Not modeled yet:

- **Exports.** Across files, an imported name is matched against the top-level names of the file it comes from. Re-exports and renamed exports are not followed.
- **Rules a plugin declines.** TypeScript's declaration merging; in Python, a comprehension's first iterable and a `global` name declared past an enclosing function. These positions answer `{ unsupported }`. The full lists are in each `SCOPING.md`.
- **Names declared outside the workspace**, such as a standard library's globals, resolve to nothing.
- **`undefined` has several meanings**: the position is not a reference, no scope binds the name, or an import leads back to a file already visited.

Other limits:

- A file with a syntax error is rejected as a whole, and so is a file using syntax the tree-sitter grammar does not have yet (`packages/ts/SCOPING.md` §6 lists TypeScript's).
- Files outside the configured `rootDir` are out of bounds.
- Lookup scans the children of each scope it passes. It is sized for one question at a time, not for resolving a whole file at once.
- There is no server or editor integration. letant is used as a library; the CLI is a development tool.

## Prerequisites

- **Node.js 22+** — Node 22 uses prebuilt Tree-Sitter binaries. Node 24 and 25 build from source and additionally require `python3`, `make`, and `g++` with C++20 support.
- **pnpm** — workspace manager.
- On Node 24/25, set `CXXFLAGS="-std=c++20"` before installing.

## Usage

A workspace takes a configuration that maps file extensions to plugins, and answers questions about the files opened in it:

```js
import { Workspace } from "letant";

const workspace = await Workspace.create({
  rootDir: ".",
  plugins: [{ name: "@letant/js", extensions: [".js", ".mjs"] }],
});

const source = `const rate = 0.1;

function total(price) {
  const rate = 0.2;
  return price * rate;
}
`;
workspace.openSource("price.js", source);

// the `rate` in `price * rate`
const answer = workspace.origin("price.js", source.lastIndexOf("rate"));

answer.path; // ["price.js", "total@19", "rate"]
answer.node.at.startPosition; // { row: 3, column: 8 }: the `rate` declared in `total`
```

`origin` answers with one of four things:

| Answer | Meaning |
| ------ | ------- |
| a cursor | The declaration. `node.at` is its position, `path` its place in the tree. |
| a string | The module an import leads to, when that file is not opened: a path relative to `rootDir`, or the specifier as written when it names no file in the workspace. |
| `{ unsupported }` | The plugin declines the position, with the rule that prevents a correct answer. |
| `undefined` | Not a reference, or not resolvable from syntax. |

`await workspace.openFile(path)` reads a file from disk instead of taking its text. A plugin entry may also carry `paths`, import aliases in the form of a `tsconfig.json`.

## Development

```bash
# Install dependencies (Node 24/25: prefix with CXXFLAGS="-std=c++20")
pnpm install

# Build core
pnpm build

# Build all packages
pnpm build:all

# Type check everything
pnpm check-types:all

# Run the CLI on a file with the mock configuration
pnpm dev:config <file>

# Lint
pnpm lint

# Tests
pnpm test
```

## License

[MIT](https://github.com/juunie-roh/letant/blob/main/LICENSE)
