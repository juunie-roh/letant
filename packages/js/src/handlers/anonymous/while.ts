import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

const whileHandler: ConvertHandler<"while"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, body, condition } = c;
    const path = createChildPath(parent, `while@${node.startIndex}`);
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "while",
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

export default whileHandler;
