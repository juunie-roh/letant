import { createChildPath, createConvertResult, NodeSource } from "letant/utils";

import { ConvertHandler, Edge, Node } from "@/types";

const moduleAnonymousHandler: ConvertHandler<"module.anonymous"> = (
  captures,
  parent,
) => {
  const result = createConvertResult<Node, Edge>();

  for (const c of captures) {
    const { node, source } = c;
    const path = createChildPath(parent, `module@${node.startIndex}`);

    result.edges.push({ from: parent, to: path, kind: "imports" });
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
