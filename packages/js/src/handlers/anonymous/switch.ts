import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

const switchHandler: ConvertHandler<"switch"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, body, condition } = c;
    const path = createChildPath(parent, `switch@${node.startIndex}`);
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "switch",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        condition: condition.text,
      },
    });

    // every case shares the one switch-body scope; capture per clause so
    // declarations sitting directly in an unbraced `case` are still reached
    for (const clause of body.namedChildren) {
      result.push(convert(capture(clause), path));
    }
  }

  return result;
};

export default switchHandler;
