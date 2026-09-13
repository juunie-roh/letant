import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

const staticHandler: ConvertHandler<"static"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, body } = c;
    const path = createChildPath(parent, `static@${node.startIndex}`);
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "static",
      at: getRange(node),
      blockStartIndex: body.startIndex,
    });

    result.push(convert(capture(body), path));
  }

  return result;
};

export default staticHandler;
