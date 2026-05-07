import TSParser from "tree-sitter";

type FunctionFields = {
  is_async: boolean;
  params: TSParser.SyntaxNode | null;
  body: TSParser.SyntaxNode;
};

const getFields = (n: TSParser.SyntaxNode): FunctionFields => ({
  is_async: n.children.some((c) => c.type === "async"),
  params: n.childForFieldName("parameters"),
  body: n.childForFieldName("body")!,
});

const dispatcher: Record<string, (n: TSParser.SyntaxNode) => FunctionFields> = {
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
  node: TSParser.SyntaxNode,
): FunctionFields {
  return dispatcher[node.type]!(node);
}
