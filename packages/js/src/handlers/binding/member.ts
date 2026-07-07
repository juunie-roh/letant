import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

import { getDecorators, isStatic } from "../utility/property";

const memberHandler: ConvertHandler<"member"> = (captures, parent) => {
  const result = createConvertResult<Node>();
  for (const c of captures) {
    const { name, node } = c;
    const path = createChildPath(parent, name.text);

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
