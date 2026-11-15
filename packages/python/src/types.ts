import type * as letant from "letant";

export type ScopingQueryKey = "scope" | "binding";

export type UtilityQueryKey = "reference";

export type NodeKind =
  | "class"
  | "comprehension"
  | "function"
  | "generic"
  | "module"
  | "parameter"
  | "type"
  | "variable";

export type Node = letant.Node<NodeKind>;

export type ScopeRule = letant.ScopeRule<NodeKind>;

export type Descriptor = letant.Plugin.Descriptor<Node>;
