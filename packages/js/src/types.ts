import type * as letant from "letant";

export type ScopingQueryKey = "scope" | "binding";

export type UtilityQueryKey = "reference";

export type NodeKind =
  | "block"
  | "catch"
  | "class"
  | "component"
  | "for"
  | "function"
  | "member"
  | "method"
  | "module"
  | "parameter"
  | "static"
  | "switch"
  | "variable";

export type Node = letant.Node<NodeKind>;

export type ScopeRule = letant.ScopeRule<NodeKind>;

export type EdgeKind = "defines" | "extends" | "contains" | "imports";

export type Descriptor = letant.Plugin.Descriptor<Node>;
