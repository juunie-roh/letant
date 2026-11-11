import type { SyntaxNode } from "tree-sitter";

import type { NodeKind } from "@/types";

import parameterName from "./utility/parameter";

type ScopeRule = {
  kind: NodeKind;
  /** Segment label used when the scope has no name of its own. */
  label: string;
};

/** Implicitly nested function scopes (SCOPING.md §1). */
const COMPREHENSIONS: Record<string, ScopeRule> = {
  list_comprehension: { kind: "comprehension", label: "listcomp" },
  dictionary_comprehension: { kind: "comprehension", label: "dictcomp" },
  set_comprehension: { kind: "comprehension", label: "setcomp" },
  generator_expression: { kind: "comprehension", label: "genexpr" },
};

export const SCOPES: Record<string, ScopeRule> = {
  function_definition: { kind: "function", label: "function" },
  lambda: { kind: "function", label: "lambda" },
  class_definition: { kind: "class", label: "class" },
  ...COMPREHENSIONS,
  // the annotation scope a type parameter list opens around its definition
  type_parameter: { kind: "generic", label: "generic" },
};

/** Scopes that hold only the body of their node. */
const BODY_SCOPES = new Set([
  "function_definition",
  "lambda",
  "class_definition",
]);

const PARAMETER_LISTS = new Set(["parameters", "lambda_parameters"]);

/** Constructs whose name is bound outside the scope they open. */
export const DECLARATIONS: Record<string, NodeKind> = {
  function_definition: "function",
  class_definition: "class",
  type_alias_statement: "type",
};

function isField(parent: SyntaxNode, field: string, child: SyntaxNode) {
  return parent.childForFieldName(field)?.id === child.id;
}

export function isComprehension(node: SyntaxNode): boolean {
  return node.type in COMPREHENSIONS;
}

/** The type parameter list of a generic function, class or type alias. */
export function typeParameters(node: SyntaxNode): SyntaxNode | null {
  switch (node.type) {
    case "function_definition":
    case "class_definition":
      return node.childForFieldName("type_parameters");
    case "type_alias_statement": {
      const left = node.childForFieldName("left")!.firstNamedChild!;
      return left.type === "generic_type" ? left.namedChild(1) : null;
    }
    default:
      return null;
  }
}

/**
 * Whether a direct `child` of a scope's node is evaluated outside that scope.
 * A function, lambda or class holds only its body: default values,
 * annotations and base classes belong to the scope the definition is in.
 */
export function isOutsideOf(scope: SyntaxNode, child: SyntaxNode): boolean {
  return BODY_SCOPES.has(scope.type) && !isField(scope, "body", child);
}

/**
 * The first and last node of the region a scope's names are visible in: the
 * body of a function, lambda or class, since the rest is evaluated outside.
 * The region is a single range, so it cannot take in the parameter names
 * written before the body, or leave out a comprehension's first iterable
 * (SCOPING.md §7, M2).
 */
export function regionOf(node: SyntaxNode): [SyntaxNode, SyntaxNode] {
  if (BODY_SCOPES.has(node.type)) {
    return [node.childForFieldName("body")!, node];
  }
  // a type parameter scope runs to the end of the definition it wraps
  if (node.type === "type_parameter") {
    let owner = node.parent!;
    while (!(owner.type in DECLARATIONS)) owner = owner.parent!;
    return [node, owner];
  }
  return [node, node];
}

/** Whether an identifier is the name a parameter declares. */
function isParameterName(node: SyntaxNode): boolean {
  // at most a splat and a typed or defaulted form lie between the two
  let parameter = node;
  for (let depth = 0; depth < 3 && parameter.parent; depth++) {
    if (PARAMETER_LISTS.has(parameter.parent.type)) {
      return parameterName(parameter)?.node.id === node.id;
    }
    parameter = parameter.parent;
  }
  return false;
}

/**
 * Whether an `identifier` names a binding. The grammar uses the same node
 * type for attributes, keyword names and module paths (SCOPING.md §4).
 */
export function isReference(node: SyntaxNode): boolean {
  const parent = node.parent!;

  // a parameter's name lies outside the region of the scope it is declared
  // in, so its position cannot be resolved to itself (SCOPING.md §7, M2)
  if (isParameterName(node)) return false;

  switch (parent.type) {
    case "attribute":
      return !isField(parent, "attribute", node);
    case "keyword_argument":
      return !isField(parent, "name", node);
    // `Point(x=px)` and `a.B` in a type: an attribute of another value
    case "keyword_pattern":
    case "member_type":
      return false;
    case "dotted_name": {
      // past the first segment, a dotted name reads attributes
      if (parent.firstNamedChild!.id !== node.id) return false;

      const owner = parent.parent!;
      switch (owner.type) {
        // `import a.b as c` binds only `c`; `from .a import b` binds only `b`
        case "aliased_import":
        case "relative_import":
          return false;
        case "import_from_statement":
          return !isField(owner, "module_name", parent);
        default:
          return true;
      }
    }
    default:
      return true;
  }
}
