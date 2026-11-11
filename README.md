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

## Architecture

### Data Model

All output is a single type:

- **Node** — a scope or a name, identified by its `path`: the chain of segments from the file down to it (e.g. `["src/parse.js", "parseDate@120", "input"]`). A `kind` classifies it, a `type` gives its role, and `at` locates it: a source range, or — for an import binding — the module it came from.

There is no edge type. Containment is derived from paths — a node's parent is its path without the last segment — so the nodes of a file form a single-parent containment tree (ADR 0003). Inside a tree each path is interned to an integer `NodeId`; nothing is hashed (ADR 0002). Relations such as references are not stored: they are enacted by positional queries (ADR 0004).

### Node Roles

A scope is a region of source where names live; a binding is a name. They are separate nodes, so a scope is never found as a name (ADR 0006).

| `type` | Description | Path segment | `at` |
| ------ | ----------- | ------------ | ---- |
| `"anonymous"` | A scope: a function, class, block, loop, ... | `<label>@<start>`, never equal to an identifier | the region where its names are visible |
| `"binding"` | A name: a variable, parameter, declared function or class, import, ... | the name itself | the declaring identifier, or the module an import came from |
| `"scope"` | The file root | the file path | the file |

`@letant/ts` has not moved to this model yet: it still emits named scopes of type `"scope"`, where one node is both the region and the name.

### Scoping Rules

Each plugin takes its rules from the language specification and records them beside its source (see [`packages/js/SCOPING.md`](packages/js/SCOPING.md)). There are four kinds (ADR 0006):

- **Boundaries** — which syntax opens a scope.
- **Binding forms** — which syntax introduces a name.
- **Attachment** — which scope a name goes into, where that is not the nearest boundary (`var` hoisting, a declaration's own name).
- **References** — which positions name a binding at all. A property after a dot, a label, or the inside of a string does not.

### Queries

Questions are pointed: one position in, one answer out (ADR 0004). `Workspace` answers two of them:

- `origin(file, offset)` — where was the name at this position bound? Answers with the declaration's position, following imports into files already opened in the workspace. When the trail leads into a file not yet opened, it stops at that module's path (or its original specifier, when it does not resolve to a file in the workspace). When the position is not a reference, or the name cannot be resolved from syntax, it answers `undefined`.
- `at(file, offset)` — the innermost scope containing a position. Its children are the names and scopes directly inside it.

Files outside the configured `rootDir` are out of bounds: opening one, or following an import into one, is an error.

### Responsibilities

L'étant separates concerns across two layers:

**Language plugin** — holds the language's scoping rules. It runs tree-sitter queries over the whole file to collect every boundary and every binding form, attaches each name to its scope, and emits the nodes. It also tells core which positions are references.

**Core** — builds the containment tree from the plugin's nodes, resolves names on it by walking outward through enclosing scopes, and answers positional queries through `Workspace`. It knows no language.

## Prerequisites

- **Node.js 22+** — Node 22 uses prebuilt Tree-Sitter binaries. Node 24 and 25 build from source and additionally require `python3`, `make`, and `g++` with C++20 support.
- **pnpm** — workspace manager.
- On Node 24/25, set `CXXFLAGS="-std=c++20"` before installing.

## Usage

```bash
# Install dependencies (Node 24/25: prefix with CXXFLAGS="-std=c++20")
pnpm install

# Build core
pnpm build

# Build all packages
pnpm build:all

# Type check everything
pnpm check-types:all

# Run CLI against mock data
pnpm dev:config

# Lint
pnpm lint

# Tests
pnpm test
```

## License

[MIT](https://github.com/juunie-roh/letant/blob/main/LICENSE)
