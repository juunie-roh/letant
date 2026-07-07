import { createChildPath, createConvertResult, NodeSource } from "letant/utils";

import { ConvertHandler, Node } from "@/types";

const moduleAnonymousHandler: ConvertHandler<"module.anonymous"> = (
  captures,
  parent,
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { node, source } = c;
    const path = createChildPath(parent, `module@${node.startIndex}`);

    result.nodes.push({
      path,
      type: "anonymous",
      kind: "module",
      at: NodeSource(source.text),
      blockStartIndex: node.startIndex,
    });
  }

  return result;
};

export default moduleAnonymousHandler;
