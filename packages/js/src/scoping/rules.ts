import type { SyntaxNode } from "tree-sitter";

import type { NodeKind } from "@/types";

import { getParameters } from "./utility/node";

type ScopeRule = {
  kind: NodeKind;
  /** Segment label used when the scope has no name of its own. */
  label: string;
};

/** Function-like boundaries (SCOPING.md §1). */
const FUNCTIONS: Record<string, ScopeRule> = {
  function_declaration: { kind: "function", label: "function" },
  generator_function_declaration: { kind: "function", label: "function" },
  function_expression: { kind: "function", label: "function" },
  generator_function: { kind: "function", label: "function" },
  arrow_function: { kind: "function", label: "arrow" },
  method_definition: { kind: "method", label: "method" },
};

export const SCOPES: Record<string, ScopeRule> = {
  ...FUNCTIONS,
  class_declaration: { kind: "class", label: "class" },
  class: { kind: "class", label: "class" },
  class_static_block: { kind: "static", label: "static" },
  catch_clause: { kind: "catch", label: "catch" },
  for_statement: { kind: "for", label: "for" },
  for_in_statement: { kind: "for", label: "for" },
  switch_body: { kind: "switch", label: "switch" },
  statement_block: { kind: "block", label: "block" },
};

/** Names a declaration's own identifier, so its region starts after it. */
const REGION_FROM_PARAMETERS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "method_definition",
]);

/** Parameter forms that make the spec's ContainsExpression true. */
const PARAMETER_EXPRESSIONS = new Set([
  "assignment_pattern",
  "object_assignment_pattern",
  "computed_property_name",
]);

export function isFunction(node: SyntaxNode): boolean {
  return node.type in FUNCTIONS;
}

function containsExpression(node: SyntaxNode): boolean {
  return (
    PARAMETER_EXPRESSIONS.has(node.type) ||
    node.namedChildren.some(containsExpression)
  );
}

/**
 * Whether a function's body needs its own scope: expressions in the parameter
 * list must not see declarations in the body.
 */
function hasSeparateBody(fn: SyntaxNode): boolean {
  const params = getParameters(fn);
  return params !== null && containsExpression(params);
}

/** A `statement_block` that belongs to the scope of its parent. */
export function isMergedBody(node: SyntaxNode): boolean {
  if (node.type !== "statement_block") return false;

  const parent = node.parent!;
  if (parent.type === "class_static_block") return true;
  if (parent.type === "catch_clause") return true;
  return isFunction(parent) && !hasSeparateBody(parent);
}

/** The scope `var` and top-level function declarations attach to. */
export function isVarScope(node: SyntaxNode): boolean {
  return (
    node.type === "program" ||
    node.type === "class_static_block" ||
    isFunction(node) ||
    (node.type === "statement_block" && isFunction(node.parent!))
  );
}

/** Whether a scope's names are visible only from its parameters onward. */
export function startsAtParameters(node: SyntaxNode): boolean {
  return REGION_FROM_PARAMETERS.has(node.type);
}

/** A computed method key is evaluated outside the method it names. */
export function isOutsideOf(parent: SyntaxNode, child: SyntaxNode): boolean {
  return (
    parent.type === "method_definition" &&
    child.type === "computed_property_name"
  );
}

/**
 * Whether a node matched by `utility/reference.scm` names a binding, for the
 * positions the grammar does not tell apart by node type (SCOPING.md §4).
 */
export function isReference(node: SyntaxNode): boolean {
  const parent = node.parent!;

  switch (parent.type) {
    // a lowercase tag is an intrinsic element, not a variable
    case "jsx_opening_element":
    case "jsx_closing_element":
    case "jsx_self_closing_element":
      return !/^[a-z]/.test(node.text);
    case "jsx_namespace_name":
    case "namespace_export":
      return false;
    // `import { a as b }` binds only the local name `b`
    case "import_specifier":
      return (
        (parent.childForFieldName("alias") ?? parent.childForFieldName("name"))!
          .id === node.id
      );
    // `export { x as y }` reads the local `x`; with a source it reads nothing
    case "export_specifier":
      return (
        !parent.parent!.parent!.childForFieldName("source") &&
        parent.childForFieldName("name")!.id === node.id
      );
    default:
      return true;
  }
}
