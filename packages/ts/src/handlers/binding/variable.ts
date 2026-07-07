import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

import flatPattern from "../utility/pattern";

const variableHandler: ConvertHandler<"variable"> = (captures, parent) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, kind, name } = c;

    if (name.type === "identifier") {
      const path = createChildPath(parent, name.text);

      result.nodes.push({
        path,
        type: "binding",
        kind: "variable",
        at: getRange(node),
        props: { kind: kind.text },
      });
    } else {
      for (const { name: nm, node: n, has_default } of flatPattern(name)) {
        const path = createChildPath(parent, nm);

        result.nodes.push({
          path,
          type: "binding",
          kind: "variable",
          at: getRange(n),
          props: { kind: kind.text, has_default },
        });
      }
    }
  }

  return result;
};

export default variableHandler;
