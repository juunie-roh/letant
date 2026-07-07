import { createChildPath, createConvertResult, NodeSource } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

const moduleBindingHandler: ConvertHandler<"module.binding"> = (
  captures,
  parent,
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { source, name, alias } = c;

    const representative = alias?.text ?? name.text;

    const path = createChildPath(parent, representative);

    result.nodes.push({
      path,
      type: "binding",
      kind: "module",
      at: NodeSource(source.text),
      props: alias ? { alias_of: name!.text } : undefined,
    });
  }

  return result;
};

export default moduleBindingHandler;
