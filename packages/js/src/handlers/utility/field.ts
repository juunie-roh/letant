import { SyntaxNode } from "tree-sitter";

/**
 * Determines whether the node is asynchronous.
 * @param node A {@link SyntaxNode | node} to look up the child for.
 * @returns Whether the node contains a child with type `async`.
 */
export function isAsync(node: SyntaxNode): boolean {
  return node.children.some((child) => child.type === "async");
}

/**
 * Determines whether the node is static method.
 * @param node A {@link SyntaxNode | node} to look up the child for.
 * @returns Whether the node contains a child with type `static`.
 */
export function isStatic(node: SyntaxNode): boolean {
  return node.children.some((child) => child.type === "static");
}

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

/**
 * @param node A {@link SyntaxNode | node} to look up the child for.
 * @returns Text array of children nodes under `decorator` field in the strict order following the source.
 */
export function getDecorators(node: SyntaxNode): string[] | undefined {
  return node.childrenForFieldName("decorator")?.map((child) => child.text);
}
