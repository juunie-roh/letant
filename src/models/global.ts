import type Parser from "tree-sitter";

import type { NodePath, NodeSource } from "@/common/branded-types";

type BaseNode<K extends string = string> = {
  /**
   * Human-readable signature of the node. Unique among scopes; a binding is
   * identified by its path and its {@link BindingNode.space | space}.
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
  space?: never;
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
  /**
   * The namespace of its language the name is bound in, where one scope may
   * bind a name once in each (TypeScript: a value, a type). Left out, the
   * name is a value. Which spaces a language has is the plugin's statement.
   * Together with {@link BaseNode.path | path} it identifies the node: two
   * bindings of one name in one scope differ in their space only.
   */
  space?: string;
};

/**
 * A row of a plugin's table of scope-opening syntax, by node type: what the
 * scope node is emitted with.
 * @template K - String union of valid `kind` values, as for {@link Node}.
 */
export type ScopeRule<K extends string = string> = Pick<
  ScopeNode<K>,
  "kind" | "barrier"
> & {
  /** Path segment label of a scope that has no name of its own. */
  label: string;
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

/**
 * Byte index or {@link Parser.Point} that is compatible with {@link Parser.Range}.
 */
export type Offset = Parser.Point | number;
