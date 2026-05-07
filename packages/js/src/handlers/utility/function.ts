import Parser from "tree-sitter";

type FunctionFields = {
  is_async: boolean;
  params: Parser.SyntaxNode | null;
  body: Parser.SyntaxNode;
};

const getFields = (n: Parser.SyntaxNode): FunctionFields => ({
  is_async: n.children.some((c) => c.type === "async"),
  params: n.childForFieldName("parameters"),
  body: n.childForFieldName("body")!,
});

const dispatcher: Record<string, (n: Parser.SyntaxNode) => FunctionFields> = {
  function_declaration: getFields,
  generator_function_declaration: getFields,
  function_expression: getFields,
  generator_function: getFields,
  arrow_function: (n) => ({
    is_async: n.children.some((c) => c.type === "async"),
    params:
      n.childForFieldName("parameters") ?? n.childForFieldName("parameter"),
    body: n.childForFieldName("body")!,
  }),
  parenthesized_expression: (n) => getFunctionFields(n.firstNamedChild!),
};

export default function getFunctionFields(
  node: Parser.SyntaxNode,
): FunctionFields {
  return dispatcher[node.type]!(node);
}
