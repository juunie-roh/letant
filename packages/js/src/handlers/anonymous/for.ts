import { createChildPath, createConvertResult, getRange } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

import flatPattern from "../utility/pattern";

const forHandler: ConvertHandler<"for"> = (
  captures,
  parent,
  { capture, convert },
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, body, condition, initializer, kind, pattern } = c;
    const path = createChildPath(parent, `for@${node.startIndex}`);
    result.nodes.push({
      path,
      type: "anonymous",
      kind: "for",
      at: getRange(node),
      blockStartIndex: body.startIndex,
      props: {
        condition: condition?.text,
      },
    });

    // the loop head declares into the loop's own scope, not the parent's:
    // sibling loops each reusing `i` must not collide on one path
    if (initializer) {
      result.push(convert(capture(initializer, "variable"), path, "variable"));
    }

    // `for (x of xs)` without a kind assigns to an existing binding
    if (kind && pattern) {
      for (const { name, node: n, has_default } of flatPattern(pattern)) {
        result.nodes.push({
          path: createChildPath(path, name),
          type: "binding",
          kind: "variable",
          at: getRange(n),
          props: { kind: kind.text, has_default },
        });
      }
    }

    result.push(convert(capture(body), path));
  }

  return result;
};

export default forHandler;
