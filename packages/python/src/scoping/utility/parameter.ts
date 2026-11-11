import type Parser from "tree-sitter";

type Parameter = {
  /** The declaring identifier. */
  node: Parser.SyntaxNode;
  has_default: boolean;
};

const SPLATS = new Set(["list_splat_pattern", "dictionary_splat_pattern"]);

/**
 * The name a child of `parameters` / `lambda_parameters` binds: plain,
 * typed, defaulted and splat (`*args` / `**kwargs`) forms. Separators
 * (`*`, `/`) bind nothing.
 */
function parameterName(parameter: Parser.SyntaxNode): Parameter | undefined {
  let node: Parser.SyntaxNode | null = parameter;
  let has_default = false;

  if (
    node.type === "default_parameter" ||
    node.type === "typed_default_parameter"
  ) {
    node = node.childForFieldName("name");
    has_default = true;
  } else if (node.type === "typed_parameter") {
    node = node.firstNamedChild;
  }
  if (node && SPLATS.has(node.type)) node = node.firstNamedChild;

  return node?.type === "identifier" ? { node, has_default } : undefined;
}

/**
 * The name a `type` child of a type parameter list binds: `T`, `T: bound`,
 * `*Ts` and `**P`.
 */
export function typeParameterName(type: Parser.SyntaxNode): Parser.SyntaxNode {
  let node = type.firstNamedChild!;
  if (node.type === "constrained_type")
    node = node.firstNamedChild!.firstNamedChild!;
  if (node.type === "splat_type") node = node.firstNamedChild!;
  return node;
}

export default parameterName;
