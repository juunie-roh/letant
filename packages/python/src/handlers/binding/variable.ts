import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

import flatPattern from "../utility/pattern";

const variableHandler: ConvertHandler<"variable"> = (captures, parent) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, name } = c;

    for (const { name: nm, node: n } of flatPattern(name)) {
      const path = createChildPath(parent, nm);
      result.nodes.push({
        path,
        type: "binding",
        kind: "variable",
        at: getRange(name.type === "identifier" ? node : n),
      });
    }
  }

  return result;
};

export default variableHandler;
