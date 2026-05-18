import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

const iifeHandler: ConvertHandler<"iife.anonymous"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node, Edge>();

  for (const c of captures) {
    const { node, body } = c;
    const path = createChildPath(parent, `iife@${node.startIndex}`);
    result.edges.push({
      from: parent,
      to: path,
      kind: "contains",
    });
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "iife",
      at: getRange(node),
      blockStartIndex: body.startIndex,
    });

    result.push(convert(capture(body), path));
  }

  return result;
};

export default iifeHandler;
