import type * as letant from "letant";

export type QueryConfig = {
  program: {
    required: "node";
    optional: never;
  };
};

export type ScopingQueryKey = "scope" | "binding";

export type UtilityQueryKey = "reference";

export type NodeKind =
  | "block"
  | "catch"
  | "class"
  | "enum"
  | "for"
  | "function"
  | "interface"
  | "member"
  | "method"
  | "module"
  | "namespace"
  | "parameter"
  | "static"
  | "switch"
  | "type"
  | "variable";

export type Node = letant.Node<NodeKind>;

export type ConvertHandler = letant.ConvertHandler<
  QueryConfig,
  QueryConfig["program"],
  Node
>;

export type Descriptor = letant.Plugin.Descriptor<QueryConfig, Node>;
