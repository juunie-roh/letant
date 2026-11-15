import type Parser from "tree-sitter";

import { NodePath } from "@/common/branded-types";

export function createChildPath(parent: NodePath, name: string): NodePath {
  return NodePath([...parent, name]);
}

/**
 * Creates a descriptor's `references`: every node the query captures within
 * a node's range, the node itself included, that `isReference` accepts.
 * @param query A query capturing the node types that can name a binding.
 * @param isReference Decides what node type cannot tell apart.
 */
export function createReferences(
  query: Parser.Query,
  isReference: (node: Parser.SyntaxNode) => boolean,
): (node: Parser.SyntaxNode) => Parser.SyntaxNode[] {
  return (node) =>
    query
      .captures(node, { startIndex: node.startIndex, endIndex: node.endIndex })
      .map((capture) => capture.node)
      .filter(isReference);
}
