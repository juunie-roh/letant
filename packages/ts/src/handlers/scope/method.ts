import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

import flatPattern from "../utility/pattern";
import { getDecorators, isAsync, isStatic } from "../utility/property";

const methodHandler: ConvertHandler<"method"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node, Edge>();
  for (const c of captures) {
    const { name, node, body, params } = c;
    const path = createChildPath(parent, name.text);

    result.edges.push({
      from: parent,
      to: path,
      kind: "defines",
    });
    result.nodes.push({
      path,
      type: "scope",
      kind: "method",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        is_static: isStatic(node),
        is_async: isAsync(node),
        decorator: getDecorators(node),
      },
    });

    if (params.type === "identifier") {
      const paramPath = createChildPath(path, params.text);
      result.edges.push({
        from: path,
        to: paramPath,
        kind: "defines",
      });

      result.nodes.push({
        path: paramPath,
        type: "binding",
        kind: "parameter",
        at: getRange(params),
      });
    } else {
      c.params.namedChildren.forEach((child) => {
        flatPattern(child).forEach(({ name, node, has_default }) => {
          const parameterPath = createChildPath(path, name);
          result.edges.push({
            from: path,
            to: parameterPath,
            kind: "defines",
          });
          result.nodes.push({
            path: parameterPath,
            type: "binding",
            kind: "parameter",
            at: getRange(node),
            props: { has_default },
          });
        });
      });
    }

    if (body) {
      result.push(convert(capture(body), path));
    }
  }
  return result;
};

export default methodHandler;
