# L'étant

L'étant is a short for _les étant_, meaning "The Beings" in French.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?logo=opensourceinitiative&logoColor=fff)](https://opensource.org/licenses/MIT)

Provide a clear provenance map, trimming out noises for comprehension.

## About

A structural code comprehension tool. letant parses source files using Tree-Sitter, extracts every scope boundary and name binding, construct a queryable definition graph, provide provenance map of given position.

### A Different Question

Every other tool in this space asks "where is this symbol and who uses it?" — a cartographic question that requires mapping everything. L'étant asks "where did this come from?" — a genealogical question that requires only following the lineage of what you're looking at.

This follows the natural direction of code comprehension. When you read code, you encounter a symbol and look up where it came from. L'étant only traces forward: from usage to origin.

## Architecture

### Data Model

All output is two types:

- **Node** — a code entity with a path segments, hashed to a compact `NodeId` inside the graph. A `kind` classifies the entity, a `type` role classifies its scope behavior.
- **Edge** — a directed relationship between two nodes (`from` → `to`)

### Node Roles

Every node has a `type` field with one of three values:

| `type` | Description | Example `kind` values |
| ------ | ----------- | --------------------- |
| `"scope"` | A named scope — introduces names and is itself introduced into a parent scope | `function`, `class`, `method`, ... |
| `"anonymous"` | An unnamed scope — introduces names but has no binding identity of its own | `iife`, `if`, `for`, `while`, ... |
| `"binding"` | A pure binding — is introduced into a scope, does not introduce names | `variable`, `member`, `import`, `parameter`, ... |

### Responsibilities

L'étant separates concerns across three layers:

**Language plugin** — interprets the raw Tree-Sitter AST for a specific language. Faithfully extracts every entity the parser exposes and maps it to the common node/edge schema. Two phases:

- `capture` — runs tree-sitter queries against AST nodes and returns typed match results. Decides **what entity** to capture from the source.
- `convert` — transforms captures into graph nodes and edges. Decides **how the entities relate**, and provides opinionated result.

**Core** — constructs a queryable graph based on the converted result from plugin, and provides navigable interface on top of it.

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

[MIT](LICENSE)
