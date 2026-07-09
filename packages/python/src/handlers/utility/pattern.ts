import type Parser from "tree-sitter";

type FlattenedPattern = {
  name: string;
  node: Parser.SyntaxNode;
};

const dispatcher: Record<
  Parser.BaseNode["type"],
  (node: Parser.SyntaxNode) => FlattenedPattern[]
> = {
  // terminate condition of recursion
  identifier: (node) => [{ name: node.text, node }],
  // recurse over single element
  list_splat_pattern: (node) => flatPattern(node.firstNamedChild!),
  // recurse over multiple elements
  pattern_list: (node) => node.namedChildren.flatMap((c) => flatPattern(c)),
  tuple_pattern: (node) => node.namedChildren.flatMap((c) => flatPattern(c)),
  list_pattern: (node) => node.namedChildren.flatMap((c) => flatPattern(c)),
};

/**
 * Flattens an assignment/for-loop target into its bound identifiers.
 * Non-binding targets (`attribute`, `subscript`) are dropped.
 */
function flatPattern(node: Parser.SyntaxNode): FlattenedPattern[] {
  if (!dispatcher[node.type]) {
    return [];
  }

  return dispatcher[node.type](node);
}

export default flatPattern;
