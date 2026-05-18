import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

const whileHandler: ConvertHandler<"while"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node, Edge>();

  for (const c of captures) {
    const { node, body, condition } = c;
    const path = createChildPath(parent, `while@${node.startIndex}`);
    result.edges.push({
      from: parent,
      to: path,
      kind: "contains",
    });
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
