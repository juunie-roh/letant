import type * as letant from "letant";

export type QueryConfig = {
  // binding queries
  "module.binding": {
    required: "source";
    optional: "alias" | "name";
  };
  variable: {
    required: "node" | "name";
    optional: never;
  };
  // scope queries
  class: {
    required: "node" | "name" | "body";
    optional: "extends";
  };
  function: {
    required: "node" | "name" | "body";
    optional: never;
  };
};

export type UtilityQueryKey = "reference";

export type NodeKind = letant.Head<keyof QueryConfig> | "parameter";

export type Node = letant.Node<NodeKind>;

export type CaptureConfig = letant.CaptureConfig<QueryConfig>;

export type SingleCaptureResult<K extends keyof QueryConfig> =
  letant.SingleCaptureResult<QueryConfig[K]>;

export type FullCaptureResult = letant.FullCaptureResult<QueryConfig>;

export type ConvertConfig = letant.ConvertConfig<QueryConfig, Node>;

export type ConvertContext = letant.ConvertContext<QueryConfig, Node>;

export type ConvertResult = letant.ConvertResult<Node>;

export type ConvertHandler<K extends keyof QueryConfig> = letant.ConvertHandler<
  QueryConfig,
  QueryConfig[K],
  Node
>;

export type Descriptor = letant.Plugin.Descriptor<QueryConfig, Node>;
