import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

const classHandler: ConvertHandler<"class"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, name, extends: ext, body } = c;
    const path = createChildPath(parent, name.text);

    result.nodes.push({
      path,
      type: "scope",
      kind: "class",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        extends: ext?.text,
      },
    });

    // methods are function_definition, attributes are assignments — the
    // full convert pass covers the class body
    result.push(convert(capture(body), path));
  }

  return result;
};

export default classHandler;
