import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

import getFunctionFields from "../utility/function";
import flatPattern from "../utility/pattern";

const functionHandler: ConvertHandler<"function"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node, Edge>();

  for (const c of captures) {
    const { is_async, params, body } = getFunctionFields(
      c["definition.function"],
    );
    const path = createChildPath(parent, c.name.text);

    result.edges.push({
      from: parent,
      to: path,
      kind: "defines",
    });

    result.nodes.push({
      path,
      type: "scope",
      kind: "function",
      at: getRange(c.node),
      blockStartIndex: body.startIndex,
      props: { is_async: !!is_async },
    });

    if (params) {
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
        params.namedChildren.forEach((child) => {
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
    }

    result.push(convert(capture(body), path));
  }

  return result;
};

export default functionHandler;
