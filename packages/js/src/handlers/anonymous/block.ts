import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

const blockHandler: ConvertHandler<"block"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node } = c;
    const path = createChildPath(parent, `block@${node.startIndex}`);
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "block",
      at: getRange(node),
      blockStartIndex: node.startIndex,
    });

    result.push(convert(capture(node), path));
  }

  return result;
};

export default blockHandler;
