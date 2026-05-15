import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

import { getDecorators } from "../utility/property";

const classHandler: ConvertHandler<"class"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node, Edge>();

  for (const c of captures) {
    const { name, node, extends: ext, body } = c;
    const path = createChildPath(parent, name.text);

    result.edges.push({
      from: parent,
      to: path,
      kind: "defines",
    });
    result.nodes.push({
      path,
      type: "scope",
      kind: "class",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        extends: ext?.text,
        decorator: getDecorators(node),
      },
    });

    result.push(convert(capture(body, "method"), path, "method"));
    result.push(convert(capture(body, "member"), path, "member"));
  }

  return result;
};

export default classHandler;
