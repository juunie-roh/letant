# 2. SHA-256 based Node Path Hashing

Date: 2026-07-03

## Status

Rejected

## Context

`Graph` needs to key nodes and adjacency by `NodePath` (a `string[]` scope
chain) with O(1) lookup. JavaScript `Map` cannot key by array content, so a
path must be reduced to a primitive key.

Previously, a `HashRegistry` derived a fixed-size `NodeId` by hashing the
encoded path with SHA-256, registering every path–hash pair at graph
construction.

Profiling showed the hashing consumed roughly 70% of overall execution time.
Each SHA-256 call crosses into native crypto, allocates a hasher, converts the
string to bytes, and runs the full compression rounds — per path, on every
lookup as well as every insert.

The property SHA-256 buys — collision resistance against an adversary — is not
needed for dictionary keying, where the full key is available for direct
comparison. V8 already hashes `Map` string keys internally with a fast
non-cryptographic hash and caches the result on the string object, so a plain
joined-path string key costs near zero after first use.

## Decision

Reject cryptographic hashing for node identity. Node identity requires no
explicit hashing at all, and splits into two tiers:

- **Intra-graph**: a per-`Graph` sequential integer `NodeId` minted at
  `addNode` (a plain counter). Ephemeral — never persisted, never compared
  across graphs or re-parses. Integer keys are the fastest `Map` keys in V8,
  and JS integers are exact up to `Number.MAX_SAFE_INTEGER`, far beyond any
  realistic node count.
- **Cross-file**: `NodePath` itself remains the durable identity. Only
  root-level (module-scope) names are referable across files, so cross-file
  references reduce to `[filePath, name]`.

Path→id interning happens once per node at the graph boundary using a
string-keyed `Map`; all internal structures key by integer.

## Consequences

- `HashRegistry` was removed. Documentation still referencing it must be
  updated.
- Encoded string keys remain only as an interning detail at the graph
  boundary, not as identity. The current `"\0"`-join encoding is
  collision-safe only while segments cannot contain NUL bytes; replacing the
  joiner with `JSON.stringify` makes the encoding bijective for all inputs.
- Any future temptation to reintroduce content hashing (e.g. for cross-graph
  node identity) should account for this profiling result: hash only at rest
  or across process boundaries, never on the lookup path.
