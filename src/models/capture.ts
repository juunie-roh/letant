import type Parser from "tree-sitter";

import type { QueryConfig } from "./global";

export type CaptureConfigOptions = {
  /**
   * Supplements the main query with matches it cannot reach — declarations
   * inside wrapper constructs that do not create scopes (`export …`,
   * decorators, Python compound statements).
   *
   * Called on every capture of the tag, with the same node the main query
   * ran on; the returned matches are appended to the main query's matches
   * and must conform to the tag's capture shape. May run queries itself
   * (single-level unwrapping) or recurse (arbitrary-depth wrappers) — no
   * `.scm` file is required.
   */
  bypass?: (node: Parser.SyntaxNode) => Parser.QueryMatch[];
  /**
   * How deep below the captured node query matches may start.
   *
   * @default 1 — the node and its direct children. Descending into nested
   * scopes is the convert handler's job (`convert(capture(body), path)`);
   * raise this only when a pattern genuinely needs deeper match starts.
   */
  maxStartDepth?: number;
};

export type CaptureConfig<Q extends QueryConfig> = {
  [K in keyof Q]?: CaptureConfigOptions;
};

export type SingleCaptureResult<T extends QueryConfig[string]> = {
  [K in T["required"]]: Parser.SyntaxNode;
} & {
  [K in T["optional"]]?: Parser.SyntaxNode;
};

export type FullCaptureResult<Q extends QueryConfig> = {
  [K in keyof Q]: SingleCaptureResult<Q[K]>[];
};
