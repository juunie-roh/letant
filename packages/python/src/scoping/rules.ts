import type { SyntaxNode } from "tree-sitter";

import type { NodeKind } from "@/types";

import parameterName, { typeParameterName } from "./utility/parameter";
import flatPattern from "./utility/pattern";

type ScopeRule = {
  kind: NodeKind;
  /** Segment label used when the scope has no name of its own. */
  label: string;
  /**
   * Whether a lookup that leaves the scope stops seeing class-level names:
   * they are visible in the class body only (SCOPING.md §4).
   */
  barrier?: true;
};

/** Implicitly nested function scopes (SCOPING.md §1). */
const COMPREHENSIONS: Record<string, ScopeRule> = {
  list_comprehension: {
    kind: "comprehension",
    label: "listcomp",
    barrier: true,
  },
  dictionary_comprehension: {
    kind: "comprehension",
    label: "dictcomp",
    barrier: true,
  },
  set_comprehension: { kind: "comprehension", label: "setcomp", barrier: true },
  generator_expression: {
    kind: "comprehension",
    label: "genexpr",
    barrier: true,
  },
};

export const SCOPES: Record<string, ScopeRule> = {
  function_definition: { kind: "function", label: "function", barrier: true },
  lambda: { kind: "function", label: "lambda", barrier: true },
  class_definition: { kind: "class", label: "class", barrier: true },
  ...COMPREHENSIONS,
  // the annotation scope a type parameter list opens around its definition;
  // directly inside a class it sees the class's names, so it is no barrier
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

/**
 * The name an identifier stands for (SCOPING.md §4): its NFKC normal form,
 * and inside a class `__name` is `_Class__name`. A class's body and type
 * parameters are inside it; its decorators and bases are not.
 */
export function nameOf(node: SyntaxNode): string {
  const name = node.text.normalize("NFKC");
  if (!name.startsWith("__") || name.endsWith("__")) return name;

  let child = node;
  for (
    let parent = node.parent;
    parent;
    child = parent, parent = parent.parent
  ) {
    if (
      parent.type === "class_definition" &&
      (isField(parent, "body", child) ||
        isField(parent, "type_parameters", child))
    ) {
      const owner = nameOf(parent.childForFieldName("name")!).replace(
        /^_+/,
        "",
      );
      // a class named with underscores only mangles nothing
      return owner ? `_${owner}${name}` : name;
    }
  }
  return name;
}

/** Whether a function or class has `global name` in its own block. */
function declaresGlobal(scope: SyntaxNode, name: string): boolean {
  const search = (node: SyntaxNode): boolean =>
    node.namedChildren.some((child) => {
      if (child.type === "global_statement") {
        return child.namedChildren.some((id) => nameOf(id) === name);
      }
      // statements only: an expression cannot hold one, a nested block is
      // another scope
      return !(child.type in DECLARATIONS) && search(child);
    });
  return search(scope.childForFieldName("body")!);
}

const FIRST_ITERABLE =
  "the first iterable of a comprehension is evaluated outside it";
const GLOBAL = "a global name skips the functions around its declaration";
const GENERIC_DEFAULT =
  "a default value is evaluated outside the type parameter scope";

/**
 * The rule that keeps the tree from resolving a reference correctly, if any
 * (SCOPING.md §7). Each test reads syntax alone and errs towards declining:
 * it does not ask whether another scope binds the name first.
 */
export function unsupported(node: SyntaxNode): string | undefined {
  const name = nameOf(node);
  // functions and classes left so far, innermost first
  const blocks: SyntaxNode[] = [];
  // whether the node is evaluated in the scope the walk has reached: so far
  // it has only left comprehensions, through their first iterable
  let direct = true;
  let iterable: SyntaxNode | undefined;

  let child = node;
  for (
    let parent = node.parent;
    parent;
    child = parent, parent = parent.parent
  ) {
    switch (parent.type) {
      case "for_in_clause": {
        // only the first `for` clause's iterable is evaluated outside
        const first = parent.parent!.namedChildren.find(
          (c) => c.type === "for_in_clause",
        )!;
        if (first.id === parent.id && isField(parent, "right", child)) {
          iterable = parent;
        }
        break;
      }
      case "default_parameter":
      case "typed_default_parameter": {
        const owner = parent.parent!.parent!;
        const generic =
          isField(parent, "value", child) && typeParameters(owner);
        if (
          generic &&
          generic.namedChildren.some(
            (p) => nameOf(typeParameterName(p)) === name,
          )
        ) {
          return GENERIC_DEFAULT;
        }
        break;
      }
      case "lambda":
        if (isField(parent, "body", child)) direct = false;
        break;
      case "function_definition":
      case "class_definition":
        if (isOutsideOf(parent, child)) break;
        // a class-level name is visible from the first iterable of a
        // comprehension in the class body, which the tree places inside
        // the comprehension, behind its barrier
        if (parent.type === "class_definition" && direct && iterable) {
          return FIRST_ITERABLE;
        }
        direct = false;
        blocks.push(parent);
        break;
      default:
        if (!isComprehension(parent)) break;
        if (iterable?.id !== child.id) {
          direct = false;
          break;
        }
        // the tree finds the comprehension's own target first
        if (
          parent.namedChildren
            .filter((c) => c.type === "for_in_clause")
            .flatMap((c) => flatPattern(c.childForFieldName("left")!))
            .some((id) => nameOf(id) === name)
        ) {
          return FIRST_ITERABLE;
        }
    }
  }

  // bindings under `global` sit in the module, and the walk towards it
  // passes the functions in between
  const declared = blocks.some(
    (block, i) =>
      blocks.slice(i + 1).some((b) => b.type === "function_definition") &&
      declaresGlobal(block, name),
  );
  return declared ? GLOBAL : undefined;
}
