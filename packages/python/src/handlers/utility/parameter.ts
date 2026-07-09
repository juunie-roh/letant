import type Parser from "tree-sitter";

type FlattenedParameter = {
  name: string;
  node: Parser.SyntaxNode;
  has_default: boolean;
};

/**
 * Flattens a `parameters` node into its bound names, covering plain,
 * typed, defaulted, and splat (`*args` / `**kwargs`) forms. Separators
 * (`*`, `/`) bind nothing and are dropped.
 */
function flatParameters(parameters: Parser.SyntaxNode): FlattenedParameter[] {
  const result: FlattenedParameter[] = [];

  for (const child of parameters.namedChildren) {
    switch (child.type) {
      case "identifier":
        result.push({ name: child.text, node: child, has_default: false });
        break;
      case "typed_parameter": {
        const inner = child.firstNamedChild;
        if (inner?.type === "identifier") {
          result.push({ name: inner.text, node: child, has_default: false });
        }
        break;
      }
      case "default_parameter":
      case "typed_default_parameter": {
        const name = child.childForFieldName("name");
        if (name?.type === "identifier") {
          result.push({ name: name.text, node: child, has_default: true });
        }
        break;
      }
      case "list_splat_pattern":
      case "dictionary_splat_pattern": {
        const inner = child.firstNamedChild;
        if (inner?.type === "identifier") {
          result.push({ name: inner.text, node: child, has_default: false });
        }
        break;
      }
      default:
        break;
    }
  }

  return result;
}

export default flatParameters;
