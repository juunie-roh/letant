import type Parser from "tree-sitter";

import { getLeft, getValue } from "./node";

type FlattenedPattern = {
  name: string;
  node: Parser.SyntaxNode;
  has_default?: boolean;
};

const dispatcher: Record<Parser.BaseNode["type"], typeof flatPattern> = {
  // Terminate Conditions of recursion
  identifier: (node, has_default) => [{ name: node.text, node, has_default }],
  shorthand_property_identifier_pattern: (node, has_default) => [
    { name: node.text, node, has_default },
  ],
  // Recurse over single element
  rest_pattern: (node, has_default) =>
    flatPattern(node.firstNamedChild!, has_default),
  assignment_pattern: (node) => flatPattern(getLeft(node), true),
  object_assignment_pattern: (node) => flatPattern(getLeft(node), true),
  pair_pattern: (node, has_default) => flatPattern(getValue(node), has_default),
  // Recurse over multiple elements
  array_pattern: (node, has_default) =>
    node.namedChildren.flatMap((c) => flatPattern(c, has_default)),
  object_pattern: (node, has_default) =>
    node.namedChildren.flatMap((c) => flatPattern(c, has_default)),
};

function flatPattern(
  node: Parser.SyntaxNode,
  has_default: boolean = false,
): FlattenedPattern[] {
  if (!dispatcher[node.type]) {
    // Notify the dropped node types?
    return [];
  }

  return dispatcher[node.type](node, has_default);
}

export default flatPattern;
