import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

const doHandler: ConvertHandler<"do"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, body, condition } = c;
    const path = createChildPath(parent, `do@${node.startIndex}`);
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "do",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        condition: condition.text,
      },
    });

    result.push(convert(capture(body), path));
  }

  return result;
};

export default doHandler;
