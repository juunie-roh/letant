import type Parser from "tree-sitter";

import type { NodePath, NodeSource } from "@/common/branded-types";

type BaseNode<K extends string = string> = {
  /**
   * Unique human-readable signature identifying the node.
   */
  path: NodePath;
  /**
   * Kind of the node.
   */
  kind: K;
  /**
   * A position where does the node sit in the file. If the node is from outside the file, {@link NodeSource | source}.
   * @see {@link Parser.Range | tree-sitter `Range`}
   */
  at: Parser.Range | NodeSource;
  /**
   * Language-specific property supplements.
   */
  props?: Record<string, unknown>;
};

type ScopeNode<K extends string = string> = BaseNode<K> & {
  /**
   * Type of the node.
   */
  type: "scope" | "anonymous";
  /**
   * Start index of the inner block.
   */
  blockStartIndex: number;
  /**
   * Whether a lookup that leaves this scope has left a barrier: in the
   * scopes further out it no longer sees a binding whose
   * {@link BindingNode.visibility | visibility} is `"local"` (ADR 0007).
   */
  barrier?: boolean;
  visibility?: never;
};

type BindingNode<K extends string = string> = BaseNode<K> & {
  /**
   * Type of the node.
   */
  type: "binding";
  /**
   * Start index of the inner block.
   */
  blockStartIndex?: never;
  barrier?: never;
  /**
   * `"local"`: visible only to a lookup that has not left a
   * {@link ScopeNode.barrier | barrier} scope on its way out (ADR 0007).
   * Left out, the binding is visible from every scope nested in its own.
   */
  visibility?: "local";
};

/**
 * @template K - String union of valid `kind` values for this node. Defaults to
 * `string` for untyped use; narrow it to a literal union to get type-safe `kind` access.
 * @example
 * import type * as letant from "letant";
 * type Node = letant.Node<"node kind" | "string literals">;
 */
export type Node<K extends string = string> = ScopeNode<K> | BindingNode<K>;

/**
 * The answer of a positional query at a reference the tree cannot resolve
 * correctly: the position names a binding, but which one depends on a rule
 * of the language the model does not express (ADR 0007).
 */
export type Unsupported = {
  /** The rule, in the plugin's words. */
  unsupported: string;
};

export type QueryConfig = Record<
  string,
  { required: string; optional: string }
>;

/**
 * Byte index or {@link Parser.Point} that is compatible with {@link Parser.Range}.
 */
export type Offset = Parser.Point | number;
