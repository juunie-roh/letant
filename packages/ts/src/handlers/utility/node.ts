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

/**
 * Get child node for the body field. The target node **MUST** have `body` field.
 * @param node A {@link SyntaxNode | node} having `body` field to get the child for.
 * @returns The child node for `body` field.
 */
export function getBody(node: SyntaxNode): SyntaxNode {
  return node.childForFieldName("body")!;
}
