import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

const ifHandler: ConvertHandler<"if"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node, Edge>();

  for (const c of captures) {
    const { node, body, condition, else: els, else_body } = c;
    const path = createChildPath(parent, `if@${node.startIndex}`);
    result.edges.push({
      from: parent,
      to: path,
      kind: "contains",
    });
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "if",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        condition: condition.text,
      },
    });

    result.push(convert(capture(body), path));

    if (els && else_body) {
      const path = createChildPath(parent, `else@${node.startIndex}`);
      result.edges.push({
        from: parent,
        to: path,
        kind: "contains",
      });
      result.nodes.push({
        path,
        type: "anonymous",
        kind: "else",
        at: getRange(els),
        blockStartIndex: else_body.startIndex,
      });

      result.push(convert(capture(else_body), path));
    }
  }

  return result;
};

export default ifHandler;
