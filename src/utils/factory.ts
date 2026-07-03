import type Parser from "tree-sitter";

import { NodePath } from "@/common/branded-types";
import type {
  CaptureConfig,
  ConvertConfig,
  ConvertResult,
  Edge,
  FullCaptureResult,
  Node,
  QueryConfig,
  SingleCaptureResult,
} from "@/models";

import type { QueryMap } from "./query";

export function createChildPath(parent: NodePath, name: string): NodePath {
  return NodePath([...parent, name]);
}

export function createConvertResult<
  N extends Node,
  E extends Edge,
>(): ConvertResult<N, E> & {
  push(...results: ConvertResult<N, E>[]): void;
} {
  const result = {
    nodes: [] as N[],
    edges: [] as E[],
    push(...rs: ConvertResult<N, E>[]) {
      for (const r of rs) {
        result.nodes.push(...r.nodes);
        result.edges.push(...r.edges);
      }
    },
  };
  return result;
}

/**
 * Creates a capture function bound to the given query map and configuration.
 *
 * The returned function has two overloads:
 * - `capture(node)` — runs all registered queries against `node` and returns a {@link FullCaptureResult}.
 * - `capture(node, tag)` — runs a single query by `tag` and returns `RawCapture[]` for that tag.
 *
 * The single-tag overload is intended for recursive capture inside convert functions,
 * where only a specific construct is expected within a body node.
 * @template Q A type defined in form of {@link QueryConfig}.
 * @param query The query map containing compiled tree-sitter queries keyed by tag.
 * @param config Per-tag configuration declaring additional parent node types to include.
 * @returns A bound capture function.
 * @example
 * // plugin/src/index.ts
 * export const capture = createCapture<Query>(query, queryConfig);
 */
export function createCapture<Q extends QueryConfig>(
  query: QueryMap<keyof Q & string>,
  config: CaptureConfig<Q>,
) {
  /**
   * Converts a single query match into a raw capture object.
   */
  function toCapture<K extends keyof Q>(
    match: Parser.QueryMatch,
  ): SingleCaptureResult<Q[K]> {
    return Object.fromEntries(
      match.captures.map((c) => [c.name, c.node]),
    ) as SingleCaptureResult<Q[K]>;
  }

  /**
   * Captures all registered query tags against a node.
   */
  function capture(node: Parser.SyntaxNode): FullCaptureResult<Q>;
  /**
   * Captures all matches for a single query tag.
   */
  function capture<K extends keyof Q>(
    node: Parser.SyntaxNode,
    tag: K,
  ): SingleCaptureResult<Q[K]>[];

  function capture<K extends keyof Q>(
    node: Parser.SyntaxNode,
    tag?: K,
  ): FullCaptureResult<Q> | SingleCaptureResult<Q[K]>[] {
    if (!tag) {
      const result = {} as FullCaptureResult<Q>;
      for (const key of query.keys()) {
        result[key] = capture(node, key);
      }
      return result;
    }

    return query
      .match(tag as keyof Q & string, node, {
        bypass: config[tag]?.bypass,
        maxStartDepth: config[tag]?.maxStartDepth,
      })
      .map(toCapture);
  }

  return capture;
}

export function createConvert<
  Q extends QueryConfig,
  N extends Node,
  E extends Edge,
>(
  capture: ReturnType<typeof createCapture<Q>>,
  config: ConvertConfig<Q, N, E>,
) {
  function convert(
    captures: FullCaptureResult<Q>,
    parent: NodePath,
  ): ConvertResult<N, E>;
  function convert<K extends keyof Q>(
    captures: SingleCaptureResult<Q[K]>[],
    parent: NodePath,
    key: K,
  ): ConvertResult<N, E>;
  function convert<K extends keyof Q>(
    captures: FullCaptureResult<Q> | SingleCaptureResult<Q[K]>[],
    parent: NodePath,
    key?: K,
  ): ConvertResult<N, E> {
    const context = { capture, convert };

    if (!key) {
      const full = captures as FullCaptureResult<Q>;
      const result = createConvertResult<N, E>();

      for (const k of Object.keys(full) as (keyof Q)[]) {
        const r = config[k](full[k], parent, context);
        result.push(r);
      }
      return result;
    }

    return config[key](
      captures as SingleCaptureResult<Q[K]>[],
      parent,
      context,
    );
  }

  return convert;
}
