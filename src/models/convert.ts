import type { NodePath } from "@/common/branded-types";
import type { createCapture, createConvert } from "@/utils";

import type { SingleCaptureResult } from "./capture";
import type { Node, QueryConfig } from "./global";

export type ConvertResult<N extends Node> = {
  nodes: N[];
};

export type ConvertContext<Q extends QueryConfig, N extends Node> = {
  capture: ReturnType<typeof createCapture<Q>>;
  convert: ReturnType<typeof createConvert<Q, N>>;
};

export type ConvertHandler<
  Q extends QueryConfig,
  T extends QueryConfig[string],
  N extends Node,
> = (
  captures: SingleCaptureResult<T>[],
  parent: NodePath,
  context: ConvertContext<Q, N>,
) => ConvertResult<N>;

export type ConvertConfig<Q extends QueryConfig, N extends Node> = {
  [K in keyof Q]: ConvertHandler<Q, Q[K], N>;
};
