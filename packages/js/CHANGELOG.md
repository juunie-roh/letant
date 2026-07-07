# @letant/js

## 0.0.4

### Patch Changes

- Developmental Checkpoint with Breaking Changes
- Updated dependencies
  - letant@0.0.4

## 0.0.3

### Patch Changes

- Rename JS plugin package from `@juun-roh/letant-js` to `@letant/js`.
- Updated dependencies
  - letant@0.0.3

## 0.0.2

### Patch Changes

- Consolidate type declarations and improve package export correctness
  - All public types are now emitted as a single `dist/index.d.ts` (CJS) and `dist/index.d.mts` (ESM) — no more hash-named declaration chunks in the build output
  - Sub-path exports (`/config`, `/dot`, `/utils`, `/query`) now use nested `import`/`require` conditions with explicit `types` fields, resolving correctly for both ESM and CJS consumers
  - Added `@arethetypeswrong/cli` export correctness check to CI and pre-commit hook; node10 no-resolution rule suppressed since sub-path exports are intentionally unsupported under node10 module resolution
  - TypeScript compiler options updated for TypeScript 6 compatibility (`ignoreDeprecations`, `types: ["node"]`)

- Updated dependencies
  - letant@0.0.2

## 0.0.1

### Patch Changes

- Publish test for both packages
- Updated dependencies
  - letant@0.0.1
