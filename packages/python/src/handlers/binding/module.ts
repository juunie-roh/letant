import { NodeSource } from "letant/utils";
import { createChildPath, createConvertResult } from "letant/utils";

import type { ConvertHandler, Node } from "@/types";

import toModulePath from "../utility/module-path";

const moduleBindingHandler: ConvertHandler<"module.binding"> = (
  captures,
  parent,
) => {
  const result = createConvertResult<Node>();

  for (const c of captures) {
    const { source, name, alias } = c;

    // `import os.path` — @source and @name capture the same dotted_name;
    // it binds only the first segment (`os`), from module `os`
    const plain = !!name && !alias && source.text === name.text;

    const representative =
      alias?.text ?? (plain ? source.text.split(".")[0] : name?.text);
    if (!representative) continue;

    let modulePath = toModulePath(plain ? representative : source.text);
    // `from . import sibling` — the imported name is itself a submodule
    if (modulePath.endsWith("/") && name) {
      modulePath += name.text;
    }

    result.nodes.push({
      path: createChildPath(parent, representative),
      type: "binding",
      kind: "module",
      at: NodeSource(modulePath),
      props: alias ? { alias_of: (name ?? source).text } : undefined,
    });
  }

  return result;
};

export default moduleBindingHandler;
