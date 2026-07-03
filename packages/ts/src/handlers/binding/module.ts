import type { NodeSource } from "letant/utils";
import { createChildPath, createConvertResult } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

const moduleBindingHandler: ConvertHandler<"module.binding"> = (
  captures,
  parent,
) => {
  const result = createConvertResult<Node, Edge>();

  for (const c of captures) {
    const { source, name, alias } = c;

    const representative = alias?.text ?? name.text;

    const path = createChildPath(parent, representative);
    result.edges.push({ from: parent, to: path, kind: "imports" });
    result.nodes.push({
      path,
      type: "binding",
      kind: "module",
      at: source.text as NodeSource,
      props: alias ? { alias_of: name!.text } : undefined,
    });
  }

  return result;
};

export default moduleBindingHandler;
