import type { SyntaxNode } from "tree-sitter";

/**
 * @param node A {@link SyntaxNode | node} to look up the child for.
 */
export function getParameters(node: SyntaxNode): SyntaxNode | null {
  return (
    node.childForFieldName("parameters") ?? node.childForFieldName("parameter")
  );
}

export function getLeft(node: SyntaxNode): SyntaxNode {
  return node.childForFieldName("left")!;
}

export function getValue(node: SyntaxNode): SyntaxNode {
  return node.childForFieldName("value")!;
}
