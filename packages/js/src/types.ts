import type * as letant from "letant";

export type QueryConfig = {
  if: {
    required: "node" | "body" | "condition";
    optional: "else" | "else_body";
  };
  while: {
    required: "node" | "body" | "condition";
    optional: never;
  };
  "iife.anonymous": {
    required: "node" | "body";
    optional: never;
  };
  "esm.binding": {
    required: "source" | "name";
    optional: "alias";
  };
  member: {
    required: "node" | "name";
    optional: never;
  };
  variable: {
    required: "node" | "name" | "kind";
    optional: never;
  };
  class: {
    required: "node" | "name" | "body";
    optional: "extends";
  };
  function: {
    required: "node" | "name" | "definition.function";
    optional: never;
  };
  "iife.scope": {
    required: "kind" | "name" | "body";
    optional: never;
  };
  method: {
    required: "node" | "name" | "body" | "params";
    optional: never;
  };
};

export type BypassQueryKey = "export";

export type UtilityQueryKey = "reference";

export type NodeKind =
  | letant.Head<keyof QueryConfig>
  | "parameter"
  | "component"
  | "else";

export type Node = letant.Node<NodeKind>;

export type EdgeKind = "defines" | "extends" | "contains" | "imports";

export type Edge = letant.Edge<EdgeKind>;

export type CaptureConfig = letant.CaptureConfig<QueryConfig>;

export type SingleCaptureResult<K extends keyof QueryConfig> =
  letant.SingleCaptureResult<QueryConfig[K]>;

export type FullCaptureResult = letant.FullCaptureResult<QueryConfig>;

export type ConvertConfig = letant.ConvertConfig<QueryConfig, Node, Edge>;

export type ConvertContext = letant.ConvertContext<QueryConfig, Node, Edge>;

export type ConvertResult = letant.ConvertResult<Node, Edge>;

export type ConvertHandler<K extends keyof QueryConfig> = letant.ConvertHandler<
  QueryConfig,
  QueryConfig[K],
  Node,
  Edge
>;

export type Descriptor = letant.Plugin.Descriptor<QueryConfig, Node, Edge>;
