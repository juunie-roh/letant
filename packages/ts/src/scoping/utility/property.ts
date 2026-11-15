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
 * @returns Text array of children nodes under `decorator` field in the strict order following the source.
 */
export function getDecorators(node: SyntaxNode): string[] | undefined {
  return node.childrenForFieldName("decorator")?.map((child) => child.text);
}
