import type Parser from "tree-sitter";

/**
 * @param first The node the range starts at.
 * @param last The node the range ends at, where that is another node: a
 * scope's region often runs from one child to the end of its node.
 */
export function getRange(
  first: Parser.SyntaxNode,
  last: Parser.SyntaxNode = first,
): Parser.Range {
  return {
    startIndex: first.startIndex,
    endIndex: last.endIndex,
    startPosition: first.startPosition,
    endPosition: last.endPosition,
  } satisfies Parser.Range;
}

/**
 * Walks from a node to the root. Each step gives a parent together with the
 * child the walk came from, which is what tells apart the parts of a parent
 * (its body, its parameters, a default value).
 */
export function* ancestors(
  node: Parser.SyntaxNode,
): Generator<[parent: Parser.SyntaxNode, child: Parser.SyntaxNode]> {
  let child = node;
  for (
    let parent = node.parent;
    parent;
    child = parent, parent = parent.parent
  ) {
    yield [parent, child];
  }
}

/** Whether `child` is the node in the given field of `parent`. */
export function isField(
  parent: Parser.SyntaxNode,
  field: string,
  child: Parser.SyntaxNode,
): boolean {
  return parent.childForFieldName(field)?.id === child.id;
}
