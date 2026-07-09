import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

import flatParameters from "../utility/parameter";

const functionHandler: ConvertHandler<"function"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, name, body } = c;
    const path = createChildPath(parent, name.text);

    result.nodes.push({
      path,
      type: "scope",
      kind: "function",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        is_async: node.children.some((child) => child.type === "async"),
      },
    });

    const parameters = node.childForFieldName("parameters");
    if (parameters) {
      for (const { name: nm, node: n, has_default } of flatParameters(
        parameters,
      )) {
        result.nodes.push({
          path: createChildPath(path, nm),
          type: "binding",
          kind: "parameter",
          at: getRange(n),
          props: { has_default },
        });
      }
    }

    result.push(convert(capture(body), path));
  }

  return result;
};

export default functionHandler;
