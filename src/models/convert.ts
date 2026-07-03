import type { NodePath } from "@/common/branded-types";
import type { createCapture, createConvert } from "@/utils";

import type { SingleCaptureResult } from "./capture";
import type { Edge, Node, QueryConfig } from "./global";

export type ConvertResult<N extends Node, E extends Edge> = {
  nodes: N[];
  edges: E[];
};

export type ConvertContext<
  Q extends QueryConfig,
  N extends Node,
  E extends Edge,
> = {
  capture: ReturnType<typeof createCapture<Q>>;
  convert: ReturnType<typeof createConvert<Q, N, E>>;
};

export type ConvertHandler<
  Q extends QueryConfig,
  T extends QueryConfig[string],
  N extends Node,
  E extends Edge,
> = (
  captures: SingleCaptureResult<T>[],
  parent: NodePath,
  context: ConvertContext<Q, N, E>,
) => ConvertResult<N, E>;

export type ConvertConfig<
  Q extends QueryConfig,
  N extends Node,
  E extends Edge,
> = {
  [K in keyof Q]: ConvertHandler<Q, Q[K], N, E>;
};
