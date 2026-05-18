import type { SyntaxNode } from "tree-sitter";

import { getBody, getParameters } from "./node";
import { isAsync } from "./property";

type FunctionField = {
  is_async: boolean;
  params: SyntaxNode | null;
  body: SyntaxNode;
};

function getField(n: SyntaxNode): FunctionField {
  return {
    is_async: isAsync(n),
    params: getParameters(n),
    body: getBody(n),
  };
}

export default function getFunctionField(node: SyntaxNode): FunctionField {
  if (node.type === "parenthesized_expression") {
    return getFunctionField(node.firstNamedChild!);
  }
  /*
   * Other types:
   * - function_declaration
   * - generator_function_declaration
   * - function_expression
   * - generator_function
   * - arrow_function
   */
  return getField(node);
}
