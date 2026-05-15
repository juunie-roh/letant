import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

import { getDecorators, isStatic } from "../utility/property";

const memberHandler: ConvertHandler<"member"> = (captures, parent) => {
  const result = createConvertResult<Node, Edge>();
  for (const c of captures) {
    const { name, node } = c;
    const path = createChildPath(parent, name.text);

    result.edges.push({
      from: parent,
      to: path,
      kind: "defines",
    });
    result.nodes.push({
      path,
      type: "binding",
      kind: "member",
      at: getRange(node),
      props: {
        is_static: isStatic(node),
        decorator: getDecorators(node),
      },
    });
  }

  return result;
};

export default memberHandler;
