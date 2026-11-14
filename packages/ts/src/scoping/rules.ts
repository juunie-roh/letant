import { getRange } from "letant/utils";
import type Parser from "tree-sitter";
import type { SyntaxNode } from "tree-sitter";

import type { NodeKind } from "@/types";

import { getParameters } from "./utility/node";
import flatPattern from "./utility/pattern";
import { isStatic } from "./utility/property";

type ScopeRule = {
  kind: NodeKind;
  /** Segment label used when the scope has no name of its own. */
  label: string;
};

/** Function-like boundaries (SCOPING.md §1): the last seven have no body. */
const FUNCTIONS: Record<string, ScopeRule> = {
  function_declaration: { kind: "function", label: "function" },
  generator_function_declaration: { kind: "function", label: "function" },
  function_expression: { kind: "function", label: "function" },
  generator_function: { kind: "function", label: "function" },
  arrow_function: { kind: "function", label: "arrow" },
  method_definition: { kind: "method", label: "method" },
  function_signature: { kind: "function", label: "function" },
  method_signature: { kind: "method", label: "method" },
  abstract_method_signature: { kind: "method", label: "method" },
  call_signature: { kind: "function", label: "call" },
  construct_signature: { kind: "function", label: "construct" },
  function_type: { kind: "function", label: "function" },
  constructor_type: { kind: "function", label: "construct" },
};

const NAMESPACES = new Set(["internal_module", "module"]);

export const SCOPES: Record<string, ScopeRule> = {
  ...FUNCTIONS,
  class_declaration: { kind: "class", label: "class" },
  abstract_class_declaration: { kind: "class", label: "class" },
  class: { kind: "class", label: "class" },
  class_static_block: { kind: "static", label: "static" },
  interface_declaration: { kind: "interface", label: "interface" },
  type_alias_declaration: { kind: "type", label: "type" },
  conditional_type: { kind: "type", label: "infer" },
  index_signature: { kind: "type", label: "index" },
  internal_module: { kind: "namespace", label: "namespace" },
  module: { kind: "namespace", label: "namespace" },
  enum_body: { kind: "enum", label: "enum" },
  catch_clause: { kind: "catch", label: "catch" },
  for_statement: { kind: "for", label: "for" },
  for_in_statement: { kind: "for", label: "for" },
  switch_body: { kind: "switch", label: "switch" },
  statement_block: { kind: "block", label: "block" },
};

/**
 * The spaces a name can be bound in (SCOPING.md §2). A declaration is in
 * exactly one: `class` is a value and a type, `enum` a value, a type and a
 * namespace, `module` a namespace that is also a value, `alias` an import,
 * whose meanings are those of what it imports.
 */
type Space = "type" | "class" | "enum" | "namespace" | "module" | "alias";

/** The spaces a reference is looked up in, by what its position asks for. */
const VALUE = ["value", "class", "enum", "module", "alias"];
const TYPE = ["type", "class", "enum", "alias"];
const NAMESPACE = ["namespace", "module", "enum", "alias"];
const ALL = ["value", "type", "class", "enum", "namespace", "module", "alias"];

/** What the name of a declaring construct is bound as. */
const DECLARED: Record<string, { kind: NodeKind; space?: Space }> = {
  function_declaration: { kind: "function" },
  generator_function_declaration: { kind: "function" },
  function_signature: { kind: "function" },
  function_expression: { kind: "function" },
  generator_function: { kind: "function" },
  class_declaration: { kind: "class", space: "class" },
  abstract_class_declaration: { kind: "class", space: "class" },
  class: { kind: "class", space: "class" },
  interface_declaration: { kind: "interface", space: "type" },
  type_alias_declaration: { kind: "type", space: "type" },
  enum_declaration: { kind: "enum", space: "enum" },
};

/**
 * Declarations that leave a namespace without a value: it holds types only,
 * so a value lookup passes it.
 */
const TYPE_ONLY = new Set([
  "interface_declaration",
  "type_alias_declaration",
  "import_statement",
  "comment",
]);

/** The declaration a statement holds, under `export` and `declare`. */
function declarationOf(statement: SyntaxNode): SyntaxNode {
  let node = statement;
  for (;;) {
    const inner =
      node.type === "export_statement"
        ? node.childForFieldName("declaration")
        : node.type === "ambient_declaration" ||
            node.type === "expression_statement"
          ? node.firstNamedChild
          : null;
    if (!inner) return node;
    node = inner;
  }
}

/** Whether a namespace has a value, not only types (SCOPING.md §2). */
function isInstantiated(namespace: SyntaxNode): boolean {
  const body = namespace.childForFieldName("body");
  if (!body) return false;

  return body.namedChildren.some((statement) => {
    const declaration = declarationOf(statement);
    if (NAMESPACES.has(declaration.type)) return isInstantiated(declaration);
    if (declaration.type === "import_alias") {
      return statement.type === "export_statement";
    }
    return !TYPE_ONLY.has(declaration.type);
  });
}

export function declared(owner: SyntaxNode): {
  kind: NodeKind;
  space?: Space;
} {
  if (NAMESPACES.has(owner.type)) {
    return {
      kind: "namespace",
      space: isInstantiated(owner) ? "module" : "namespace",
    };
  }
  return DECLARED[owner.type];
}

export function isFunction(node: SyntaxNode): boolean {
  return node.type in FUNCTIONS;
}

export function isNamespace(node: SyntaxNode): boolean {
  return NAMESPACES.has(node.type);
}

/** The first identifier of a namespace's name: `A` in `namespace A.B`. */
export function rootOf(name: SyntaxNode): SyntaxNode {
  let node = name;
  while (node.type !== "identifier") {
    const object = node.childForFieldName("object");
    if (!object) break;
    node = object;
  }
  return node;
}

/** `infer` in a conditional type's `extends` operand declares for that type. */
function declaresInfer(node: SyntaxNode, top = true): boolean {
  if (node.type === "infer_type") return true;
  // a nested conditional type's own operand declares for the nested one
  if (!top && node.type === "conditional_type") {
    return ["left", "consequence", "alternative"].some((field) =>
      declaresInfer(node.childForFieldName(field)!, false),
    );
  }
  return node.namedChildren.some((child) => declaresInfer(child, false));
}

/** Whether a node matched by `scope.scm` opens a scope. */
export function isScope(node: SyntaxNode): boolean {
  if (node.type === "conditional_type") {
    return declaresInfer(node.childForFieldName("right")!);
  }
  return !isMergedBody(node);
}

/**
 * What in a signature is resolved without the body's declarations: an
 * expression, a type, a decorator (SCOPING.md §3).
 */
const SIGNATURE_REFERENCES = new Set([
  "assignment_pattern",
  "object_assignment_pattern",
  "computed_property_name",
  "decorator",
  "type_identifier",
  "nested_type_identifier",
  "type_query",
  "type_predicate",
]);

function refersOutward(node: SyntaxNode): boolean {
  return (
    SIGNATURE_REFERENCES.has(node.type) ||
    (node.type.endsWith("_parameter") &&
      node.childForFieldName("value") !== null) ||
    node.namedChildren.some(refersOutward)
  );
}

/**
 * Whether a function's body needs its own scope: what the signature refers
 * to must not see declarations in the body.
 */
function hasSeparateBody(fn: SyntaxNode): boolean {
  return [
    fn.childForFieldName("type_parameters"),
    getParameters(fn),
    fn.childForFieldName("return_type"),
  ].some((part) => part !== null && refersOutward(part));
}

/** A `statement_block` that belongs to the scope of its parent. */
export function isMergedBody(node: SyntaxNode): boolean {
  if (node.type !== "statement_block") return false;

  const parent = node.parent!;
  if (parent.type === "class_static_block") return true;
  if (parent.type === "catch_clause") return true;
  if (NAMESPACES.has(parent.type)) return true;
  return isFunction(parent) && !hasSeparateBody(parent);
}

/** The scope `var` and top-level function declarations attach to. */
export function isVarScope(node: SyntaxNode): boolean {
  return (
    node.type === "program" ||
    node.type === "class_static_block" ||
    NAMESPACES.has(node.type) ||
    isFunction(node) ||
    (node.type === "statement_block" &&
      // a function's own body, or `declare global { … }`
      (isFunction(node.parent!) || node.parent!.type === "ambient_declaration"))
  );
}

/**
 * Constructs whose name is bound outside them: their names are visible from
 * the type parameters or the parameters onward, not at the name itself.
 */
const REGION_AFTER_NAME = new Set([
  "function_declaration",
  "generator_function_declaration",
  "method_definition",
  "function_signature",
  "method_signature",
  "abstract_method_signature",
  "class_declaration",
  "abstract_class_declaration",
  "interface_declaration",
  "type_alias_declaration",
]);

/** The part of a scope's node its names are visible in. */
export function region(node: SyntaxNode): Parser.Range {
  // `infer` names are visible in the true branch only
  if (node.type === "conditional_type") {
    return getRange(node.childForFieldName("consequence")!);
  }

  const range = getRange(node);
  if (!REGION_AFTER_NAME.has(node.type)) return range;

  const start =
    node.childForFieldName("type_parameters") ?? getParameters(node);
  if (!start) return range;

  const { startIndex, startPosition } = start;
  return { ...range, startIndex, startPosition };
}

/**
 * Whether a child of a scope's node lies outside the scope's region: a
 * decorator or a computed key before the parameters, a conditional type's
 * operands and false branch.
 */
export function isOutsideOf(parent: SyntaxNode, child: SyntaxNode): boolean {
  if (
    parent.type !== "conditional_type" &&
    !REGION_AFTER_NAME.has(parent.type)
  ) {
    return false;
  }
  const { startIndex, endIndex } = region(parent);
  return child.startIndex < startIndex || child.endIndex > endIndex;
}

/** The conditional type an `infer` declares its name for. */
export function inferOwner(infer: SyntaxNode): SyntaxNode {
  let child = infer;
  let parent = infer.parent!;
  while (
    parent.type !== "conditional_type" ||
    parent.childForFieldName("right")!.id !== child.id
  ) {
    child = parent;
    parent = parent.parent!;
  }
  return parent;
}

/** The root of the qualified name an identifier starts, or the identifier. */
function qualifiedName(node: SyntaxNode): SyntaxNode {
  let top = node;
  for (;;) {
    const parent = top.parent!;
    const qualified =
      parent.type === "nested_identifier" ||
      parent.type === "member_expression";
    if (!qualified || parent.childForFieldName("object")?.id !== top.id) {
      return top;
    }
    top = parent;
  }
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
    // `export as namespace X` declares a global name outside the file
    case "export_statement":
      return !parent.children.some((child) => child.type === "namespace");
    // `A.B` in a type: `B` is a member of `A`, not a name in scope
    case "nested_type_identifier":
      return parent.childForFieldName("module")!.id === node.id;
    // the name `infer` declares lies outside the branch it is visible in
    case "infer_type":
      return parent.firstNamedChild!.id !== node.id;
    // a tuple member's name is a label
    case "required_parameter":
    case "optional_parameter":
      return parent.childForFieldName("name")?.id !== node.id;
    // `undefined` as a type is a keyword
    case "literal_type":
      return false;
    default:
      return true;
  }
}

/** The spaces the reference at a node is looked up in (SCOPING.md §4). */
export function spacesOf(node: SyntaxNode): readonly string[] {
  if (node.type === "type_identifier") return TYPE;
  if (node.type !== "identifier") return VALUE;

  const parent = node.parent!;
  switch (parent.type) {
    case "nested_type_identifier":
    case "internal_module":
    case "module":
      return NAMESPACE;
    // `export { x }`, `export = x`, `export default x`: whatever `x` is
    case "export_specifier":
    case "export_statement":
      return ALL;
    // `import a = x`: the name declared, then whatever `x` is
    case "import_alias":
      return parent.firstNamedChild!.id === node.id ? VALUE : ALL;
    default:
      // `A` in `A.B.C` as a type, a namespace's name or an import target
      return qualifiedName(node).type === "nested_identifier"
        ? NAMESPACE
        : VALUE;
  }
}

const MERGED = "a name declared more than once is merged by the compiler";
const MERGED_SCOPE =
  "a merged namespace or enum sees the names its other declarations export";
const QUALIFIED_NAMESPACE =
  "a namespace declared with a qualified name is nested in the ones it names";
const STATIC = "a static member does not see the type parameters of its class";
const PARAMETER_DECORATOR =
  "a parameter decorator is resolved outside the function it decorates";

/** What a declaration means: a value, a type, a namespace. */
const MEANINGS: Record<string, number> = {
  function_declaration: 1,
  generator_function_declaration: 1,
  function_signature: 1,
  class_declaration: 1 | 2,
  abstract_class_declaration: 1 | 2,
  interface_declaration: 2,
  type_alias_declaration: 2,
  enum_declaration: 1 | 2 | 4,
  internal_module: 1 | 4,
  module: 1 | 4,
};

const FUNCTION_DECLARATIONS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_signature",
]);

/** The declarations of one statement list, each with the name it declares. */
function declarations(list: SyntaxNode): { name: string; node: SyntaxNode }[] {
  return list.namedChildren.flatMap((statement) => {
    const node = declarationOf(statement);
    const name = node.type in MEANINGS && node.childForFieldName("name");
    // a module named by a string declares no name
    if (!name || name.type === "string") return [];
    return [{ name: rootOf(name).text, node }];
  });
}

const merged = new WeakMap<Parser.Tree, Set<string>>();

/**
 * The names a file declares more than once in one statement list with a
 * meaning in common. Overloads of one function are not a merge.
 */
function mergedNames(tree: Parser.Tree): Set<string> {
  let names = merged.get(tree);
  if (names) return names;

  names = new Set();
  const lists = tree.rootNode.descendantsOfType(["program", "statement_block"]);
  for (const list of lists) {
    const seen = new Map<string, SyntaxNode[]>();
    for (const { name, node } of declarations(list)) {
      const others = seen.get(name) ?? [];
      const merges = others.some(
        (other) =>
          (MEANINGS[other.type] & MEANINGS[node.type]) !== 0 &&
          !(
            FUNCTION_DECLARATIONS.has(other.type) &&
            FUNCTION_DECLARATIONS.has(node.type)
          ),
      );
      if (merges) names.add(name);
      seen.set(name, [...others, node]);
    }
  }

  merged.set(tree, names);
  return names;
}

/** The statement list a declaration is in, past `export` and `declare`. */
function listOf(declaration: SyntaxNode): SyntaxNode {
  let node = declaration.parent!;
  while (node.type !== "program" && node.type !== "statement_block") {
    node = node.parent!;
  }
  return node;
}

/** The names a declaration of a namespace or an enum declares in its body. */
function membersOf(declaration: SyntaxNode): string[] {
  const body = declaration.childForFieldName("body")!;

  if (declaration.type === "enum_declaration") {
    return body.namedChildren.map(
      (member) => (member.childForFieldName("name") ?? member).text,
    );
  }

  return body.namedChildren.flatMap((statement) => {
    const node = declarationOf(statement);
    if (node.type === "import_alias") return [node.firstNamedChild!.text];
    if (node.type.endsWith("_declaration") && !(node.type in MEANINGS)) {
      // var / let / const
      return node.namedChildren.flatMap((declarator) => {
        const name = declarator.childForFieldName("name");
        return name ? flatPattern(name).map((p) => p.name) : [];
      });
    }
    const name = node.childForFieldName("name");
    return name ? [rootOf(name).text] : [];
  });
}

/**
 * Whether another declaration of the same namespace or enum, in the same
 * statement list, declares the name.
 */
function isDeclaredBySibling(declaration: SyntaxNode, name: string): boolean {
  const own = rootOf(declaration.childForFieldName("name")!).text;
  const isEnum = declaration.type === "enum_declaration";

  return declarations(listOf(declaration)).some(
    ({ name: other, node }) =>
      other === own &&
      node.id !== declaration.id &&
      (node.type === "enum_declaration") === isEnum &&
      (isEnum || NAMESPACES.has(node.type)) &&
      // a qualified name nests its body: what it exports is not one list
      (node.childForFieldName("name")!.type === "nested_identifier" ||
        membersOf(node).includes(name)),
  );
}

function typeParameterNames(node: SyntaxNode): string[] {
  const typeParameters = node.childForFieldName("type_parameters");
  return (typeParameters?.namedChildren ?? []).map(
    (parameter) => parameter.childForFieldName("name")?.text ?? "",
  );
}

/** The names a function declares in its signature. */
function signatureNames(fn: SyntaxNode): string[] {
  const parameters = getParameters(fn);
  return [
    ...(parameters?.type === "formal_parameters"
      ? parameters.namedChildren.flatMap((p) => flatPattern(p))
      : []
    ).map((p) => p.name),
    ...typeParameterNames(fn),
  ];
}

/**
 * The rule that keeps the tree from resolving a reference correctly, if any
 * (SCOPING.md §7). Each test reads syntax alone and errs towards declining:
 * it does not ask whether a nearer scope binds the name first.
 */
export function unsupported(node: SyntaxNode): string | undefined {
  const name = node.text;
  if (mergedNames(node.tree).has(name)) return MERGED;

  // whether the walk has left a static member of the class it is in
  let inStatic = false;
  // whether a generic the walk has left declares the name as its own
  let shadowed = false;

  let child = node;
  for (
    let parent = node.parent;
    parent;
    child = parent, parent = parent.parent
  ) {
    const declares =
      node.type === "type_identifier" &&
      !isOutsideOf(parent, child) &&
      typeParameterNames(parent).includes(name);

    switch (parent.type) {
      case "required_parameter":
      case "optional_parameter": {
        if (child.type !== "decorator") break;
        const fn = parent.parent!.parent!;
        if (signatureNames(fn).includes(name)) return PARAMETER_DECORATOR;
        break;
      }
      case "class_body":
        inStatic = child.type === "class_static_block" || isStatic(child);
        break;
      case "class_declaration":
      case "abstract_class_declaration":
      case "class":
        if (inStatic && !shadowed && declares) return STATIC;
        inStatic = false;
        break;
      case "enum_declaration":
        if (child.type === "enum_body" && isDeclaredBySibling(parent, name)) {
          return MERGED_SCOPE;
        }
        break;
      case "internal_module":
      case "module": {
        const declaredName = parent.childForFieldName("name")!;
        if (child.id === declaredName.id || declaredName.type === "string") {
          break;
        }
        if (
          declaredName.type === "nested_identifier" &&
          declaredName.text.split(".").slice(1).includes(name)
        ) {
          return QUALIFIED_NAMESPACE;
        }
        if (isDeclaredBySibling(parent, name)) return MERGED_SCOPE;
        break;
      }
    }

    shadowed ||= declares;
  }

  return undefined;
}
