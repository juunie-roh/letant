import { createChildPath, createConvertResult } from "letant/utils";

import type { ConvertHandler, Edge, Node } from "@/types";

function isExternal(specifier: string): boolean {
  return (
    !specifier.startsWith(".") &&
    !specifier.startsWith("/") &&
    !specifier.startsWith("@/") // your path alias
  );
}

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
      at: { name: source.text, external: isExternal(source.text) },
      props: alias ? { alias_of: name!.text } : undefined,
    });
  }

  return result;
};

export default moduleBindingHandler;
