import type Parser from "tree-sitter";

const each = (node: Parser.SyntaxNode) =>
  node.namedChildren.flatMap(flatPattern);
const inner = (node: Parser.SyntaxNode) => flatPattern(node.firstNamedChild!);

const dispatcher: Record<
  Parser.BaseNode["type"],
  (node: Parser.SyntaxNode) => Parser.SyntaxNode[]
> = {
  // terminate condition of recursion
  identifier: (node) => [node],
  // assignment and for targets
  pattern_list: each,
  tuple_pattern: each,
  list_pattern: each,
  list_splat_pattern: inner,
  // `with … as` and `del` targets are parsed as expressions
  expression_list: each,
  tuple: each,
  list: each,
  list_splat: inner,
  parenthesized_expression: inner,
};

/**
 * Flattens a target into the identifiers it binds. Targets that bind no
 * name (`attribute`, `subscript`) are dropped.
 */
function flatPattern(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  return dispatcher[node.type]?.(node) ?? [];
}

export default flatPattern;
