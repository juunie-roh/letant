import {
  createChildPath,
  getRange,
  type NodePath,
  NodeSource,
} from "letant/utils";
import type { SyntaxNode } from "tree-sitter";

import type { Node } from "@/types";

import { analysisOf, type Scope } from "./analyze";
import { regionOf, SCOPES } from "./rules";

/** A scope's segment contains `@`, so it can never equal an identifier. */
function segment(node: SyntaxNode): string {
  const name = node.childForFieldName("name");
  return `${name?.text ?? SCOPES[node.type].label}@${node.startIndex}`;
}

function scopeProps(node: SyntaxNode): Node["props"] {
  // a method is never a name a bare lookup can reach
  if (node.type === "method_declaration" || node.type === "method_elem") {
    return { name: node.childForFieldName("name")!.text };
  }
  return undefined;
}

function extract(root: SyntaxNode, rootPath: NodePath): Node[] {
  const { scopes, file, imports } = analysisOf(root.tree);
  const paths = new Map<Scope, NodePath>([[file, rootPath]]);
  const nodes: Node[] = [];

  const pathOf = (scope: Scope): NodePath => {
    let path = paths.get(scope);
    if (!path) {
      path = createChildPath(pathOf(scope.parent!), segment(scope.node));
      paths.set(scope, path);
    }
    return path;
  };

  for (const scope of scopes.values()) {
    if (scope !== file) {
      nodes.push({
        path: pathOf(scope),
        type: "anonymous",
        kind: SCOPES[scope.node.type].kind,
        at: getRange(...regionOf(scope.node)),
        blockStartIndex: (scope.node.childForFieldName("body") ?? scope.node)
          .startIndex,
        props: scopeProps(scope.node),
      });
    }
    for (const [name, { kind, at }] of scope.bindings) {
      nodes.push({
        path: createChildPath(pathOf(scope), name),
        type: "binding",
        kind,
        at,
      });
    }
  }

  // an import that binds no name the file spells is recorded, not bound
  for (const { spec, path } of imports) {
    nodes.push({
      path: createChildPath(rootPath, `module@${spec.startIndex}`),
      type: "anonymous",
      kind: "module",
      at: NodeSource(path),
      blockStartIndex: spec.startIndex,
    });
  }

  return nodes;
}

export default extract;
