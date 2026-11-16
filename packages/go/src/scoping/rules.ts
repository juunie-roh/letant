import { isField } from "letant/utils";
import type { SyntaxNode } from "tree-sitter";

import type { ScopeRule } from "@/types";

/** Scopes that hold parameters (SCOPING.md §1). A type has no body. */
const FUNCTIONS: Record<string, ScopeRule> = {
  function_declaration: { kind: "function", label: "function" },
  method_declaration: { kind: "method", label: "method" },
  func_literal: { kind: "function", label: "func" },
  function_type: { kind: "signature", label: "func" },
  method_elem: { kind: "signature", label: "method" },
};

export const SCOPES: Record<string, ScopeRule> = {
  ...FUNCTIONS,
  // the type parameters of a generic type
  type_spec: { kind: "generic", label: "generic" },
  type_alias: { kind: "generic", label: "generic" },
  block: { kind: "block", label: "block" },
  if_statement: { kind: "if", label: "if" },
  for_statement: { kind: "for", label: "for" },
  expression_switch_statement: { kind: "switch", label: "switch" },
  type_switch_statement: { kind: "switch", label: "switch" },
  expression_case: { kind: "case", label: "case" },
  type_case: { kind: "case", label: "case" },
  default_case: { kind: "case", label: "default" },
  communication_case: { kind: "case", label: "case" },
};

/** Constructs whose own name is written inside their node, before their scope. */
const NAMED_OUTSIDE = new Set([
  "function_declaration",
  "type_spec",
  "type_alias",
]);

/** Literal types whose keys are index or key expressions. */
const INDEXED = new Set([
  "array_type",
  "implicit_length_array_type",
  "slice_type",
  "map_type",
]);

/**
 * A function's body is the function's own block: parameters and the body's
 * declarations share one scope.
 */
export function isMergedBody(node: SyntaxNode): boolean {
  return (
    node.type === "block" &&
    node.parent!.type in FUNCTIONS &&
    isField(node.parent!, "body", node)
  );
}

/**
 * Whether a direct `child` of a scope's node lies outside that scope: the
 * name of a function or generic type is declared in the scope around it.
 */
export function isOutsideOf(scope: SyntaxNode, child: SyntaxNode): boolean {
  return NAMED_OUTSIDE.has(scope.type) && isField(scope, "name", child);
}

/**
 * The first and last node of the region a scope's names are visible in. It
 * leaves out what {@link isOutsideOf} does.
 */
export function regionOf(node: SyntaxNode): [SyntaxNode, SyntaxNode] {
  if (NAMED_OUTSIDE.has(node.type)) {
    const first =
      node.childForFieldName("type_parameters") ??
      node.childForFieldName("parameters")!;
    return [first, node];
  }
  return [node, node];
}

/** The type a parenthesized type stands for. */
function unwrap(type: SyntaxNode | null): SyntaxNode | null {
  while (type?.type === "parenthesized_type") type = type.firstNamedChild;
  return type;
}

/**
 * The type of a `literal_value` as far as syntax shows it, or `null`. An
 * element or key that is itself a literal may leave its type out; it is then
 * the element or key type of the literal around it.
 */
function literalType(value: SyntaxNode): SyntaxNode | null {
  const parent = value.parent!;
  if (parent.type === "composite_literal") {
    return parent.childForFieldName("type");
  }
  if (parent.type !== "literal_element") return null;

  const owner = parent.parent!;
  const keyed = owner.type === "keyed_element";
  const outer = unwrap(literalType(keyed ? owner.parent! : owner));
  if (!outer) return null;

  let element: SyntaxNode | null;
  if (outer.type !== "map_type") {
    element = outer.childForFieldName("element");
  } else if (keyed && isField(owner, "key", parent)) {
    element = outer.childForFieldName("key");
  } else {
    element = outer.childForFieldName("value");
  }

  // `[]*T{{…}}` leaves out `&T`
  element = unwrap(element);
  if (element?.type === "pointer_type")
    element = unwrap(element.firstNamedChild);
  return element;
}

/**
 * What an identifier written as the key of a composite literal's element is
 * (SCOPING.md §4): a field name in a struct literal, an expression in an
 * array, slice or map literal, and unknown where the literal's type is a
 * name. `undefined` for any other node.
 */
export function keyKind(
  node: SyntaxNode,
): "field" | "expression" | "unknown" | undefined {
  const element = node.parent!;
  const keyed = element.parent;
  if (
    element.type !== "literal_element" ||
    keyed?.type !== "keyed_element" ||
    !isField(keyed, "key", element)
  ) {
    return undefined;
  }

  const type = unwrap(literalType(keyed.parent!));
  if (type?.type === "struct_type") return "field";
  return type && INDEXED.has(type.type) ? "expression" : "unknown";
}

/** Whether an identifier is the symbolic variable of a type switch guard. */
export function isGuard(node: SyntaxNode): boolean {
  const list = node.parent!;
  return (
    list.parent?.type === "type_switch_statement" &&
    isField(list.parent, "alias", list)
  );
}

/**
 * Whether a node matched by `utility/reference.scm` names a binding, for the
 * positions the grammar does not tell apart by node type (SCOPING.md §4).
 */
export function isReference(node: SyntaxNode): boolean {
  const parent = node.parent!;
  switch (parent.type) {
    // the package clause declares nothing
    case "package_clause":
      return false;
    // `pkg.Type`: the type is a member of the package
    case "qualified_type":
      return isField(parent, "package", node);
    default:
      return keyKind(node) !== "field";
  }
}

/**
 * The name an import without one is assumed to bind: the last element of its
 * path that is not a major version, without a `go-` prefix, up to the first
 * character an identifier cannot hold. This is `ImportPathToAssumedName` of
 * golang.org/x/tools. The name the import does bind is the one in the
 * package clause of the imported package (SCOPING.md §7, G2).
 */
export function assumedName(path: string): string {
  const elements = path.split("/");
  let base = elements.pop()!;
  if (/^v\d+$/.test(base) && elements.length > 0) base = elements.pop()!;
  base = base.replace(/^go-/, "");
  return /^[\p{L}\p{Nd}_]*/u.exec(base)![0];
}
