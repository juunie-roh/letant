import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

import flatPattern from "../utility/pattern";

const iifeBindingHandler: ConvertHandler<"iife.scope"> = (
  captures,
  parent,
  { convert, capture },
) => {
  const result = createConvertResult<Node, Edge>();
  for (const c of captures) {
    const { kind, name, body } = c;

    if (name.type === "identifier") {
      const path = createChildPath(parent, name.text);
      result.edges.push({
        from: parent,
        to: path,
        kind: "defines",
      });
      result.nodes.push({
        path,
        type: "scope",
        kind: "iife",
        at: getRange(body),
        blockStartIndex: body.startIndex,
        props: { kind: kind.text },
      });

      result.push(convert(capture(body), path));
    } else {
      for (const { name: nm } of flatPattern(name)) {
        const path = createChildPath(parent, nm);
        result.edges.push({
          from: parent,
          to: path,
          kind: "defines",
        });
        result.nodes.push({
          path,
          type: "scope",
          kind: "iife",
          at: getRange(body),
          blockStartIndex: body.startIndex,
          props: { kind: kind.text },
        });

        result.push(convert(capture(body), path));
      }
    }
  }

  return result;
};

export default iifeBindingHandler;
