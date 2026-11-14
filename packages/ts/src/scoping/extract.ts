import {
  createChildPath,
  createConvertResult,
  getRange,
  type NodePath,
  NodeSource,
} from "letant/utils";
import type { SyntaxNode } from "tree-sitter";

import { scoping } from "@/query";
import type { ConvertHandler, Node } from "@/types";

import {
  declared,
  inferOwner,
  isFunction,
  isOutsideOf,
  isScope,
  isVarScope,
  region,
  rootOf,
  SCOPES,
} from "./rules";
import flatPattern from "./utility/pattern";
import { getDecorators, isAsync, isStatic } from "./utility/property";

type Scope = {
  node: SyntaxNode;
  parent?: Scope;
  path?: NodePath;
  /** One binding per name and space, keyed by {@link keyOf}. */
  bindings: Map<string, Node>;
};

type Binding = Pick<Node, "kind" | "at" | "props" | "space">;

const SEGMENT_NAMES = new Set([
  "identifier",
  "type_identifier",
  "property_identifier",
  "private_property_identifier",
]);

/** A scope's segment contains `@`, so it can never equal an identifier. */
function segment(node: SyntaxNode, label: string): string {
  const name = node.childForFieldName("name");
  const shown = name && SEGMENT_NAMES.has(name.type) ? name.text : label;
  return `${shown}@${node.startIndex}`;
}

function keyOf(name: string, space?: string): string {
  return `${space ?? "value"} ${name}`;
}

function scopeProps(node: SyntaxNode): Node["props"] {
  if (node.type === "method_definition") {
    return {
      name: node.childForFieldName("name")!.text,
      is_static: isStatic(node),
      is_async: isAsync(node),
      decorator: getDecorators(node),
    };
  }
  if (isFunction(node)) return { is_async: isAsync(node) };
  if (SCOPES[node.type].kind === "class") {
    return {
      extends: node.namedChildren.find((c) => c.type === "class_heritage")
        ?.text,
      decorator: getDecorators(node),
    };
  }
  return undefined;
}

function extract(root: SyntaxNode, rootPath: NodePath): Node[] {
  const scopes = new Map<number, Scope>();
  const nodes: Node[] = [];

  // 1. scopes
  for (const { node } of scoping.get("scope").captures(root)) {
    if (isScope(node)) scopes.set(node.id, { node, bindings: new Map() });
  }

  const enclosing = (node: SyntaxNode): Scope => {
    let child = node;
    let parent = node.parent;
    while (parent) {
      const scope = scopes.get(parent.id);
      if (scope && !isOutsideOf(parent, child)) return scope;
      child = parent;
      parent = parent.parent;
    }
    return scopes.get(root.id)!;
  };

  const pathOf = (scope: Scope): NodePath => {
    scope.path ??=
      scope.node.id === root.id
        ? rootPath
        : createChildPath(
            pathOf(enclosing(scope.node)),
            segment(scope.node, SCOPES[scope.node.type].label),
          );
    return scope.path;
  };

  for (const scope of scopes.values()) {
    if (scope.node.id !== root.id) scope.parent = enclosing(scope.node);
  }

  const varScope = (scope: Scope): Scope => {
    let current = scope;
    while (!isVarScope(current.node)) current = current.parent!;
    return current;
  };

  // one node per name and space per scope: the first declaration, unless a
  // function declaration follows, which initializes the binding
  const declare = (scope: Scope, name: string, binding: Binding) => {
    const key = keyOf(name, binding.space);
    if (scope.bindings.has(key) && binding.kind !== "function") return;
    scope.bindings.set(key, {
      ...binding,
      path: createChildPath(pathOf(scope), name),
      type: "binding",
    } as Node);
  };

  const declareAll = (
    scope: Scope,
    pattern: SyntaxNode,
    kind: Node["kind"],
    props?: Node["props"],
  ) => {
    for (const { name, node, has_default } of flatPattern(pattern)) {
      declare(scope, name, {
        kind,
        at: getRange(node),
        props: kind === "parameter" ? { has_default } : props,
      });
    }
  };

  // an import is whatever it imports: a value, a type, a namespace
  const declareImport = (statement: SyntaxNode) => {
    const scope = enclosing(statement);

    // `import a = N.b` names something in this file
    if (statement.type === "import_alias") {
      const name = statement.firstNamedChild!;
      declare(scope, name.text, {
        kind: "module",
        at: getRange(name),
        space: "alias",
      });
      return;
    }

    const clause = statement.namedChildren.find(
      (c) => c.type === "import_clause" || c.type === "import_require_clause",
    );
    const string = (
      clause?.type === "import_require_clause" ? clause : statement
    ).childForFieldName("source")!;
    const at = NodeSource(string.firstNamedChild?.text ?? "");

    if (!clause) {
      nodes.push({
        path: createChildPath(pathOf(scope), `module@${statement.startIndex}`),
        type: "anonymous",
        kind: "module",
        at,
        blockStartIndex: statement.startIndex,
      });
      return;
    }

    for (const child of clause.namedChildren) {
      if (child.type === "identifier") {
        declare(scope, child.text, { kind: "module", at, space: "alias" });
      } else if (child.type === "namespace_import") {
        declare(scope, child.firstNamedChild!.text, {
          kind: "module",
          at,
          space: "alias",
        });
      } else if (child.type === "named_imports") {
        for (const specifier of child.namedChildren) {
          const name = specifier.childForFieldName("name");
          if (!name) continue;
          const alias = specifier.childForFieldName("alias");
          declare(scope, (alias ?? name).text, {
            kind: "module",
            at,
            space: "alias",
            props: alias
              ? { alias_of: name.firstNamedChild?.text ?? name.text }
              : undefined,
          });
        }
      }
    }
  };

  const declareElement = (id: SyntaxNode, element: SyntaxNode) => {
    const scope = enclosing(element);
    if (id.type === "private_property_identifier") {
      declare(scope, id.text, { kind: "member", at: getRange(id) });
      return;
    }

    // public elements are properties, never names a bare lookup can reach
    nodes.push({
      path: createChildPath(pathOf(scope), segment(element, id.text)),
      type: "binding",
      kind: "member",
      at: getRange(element),
      props: {
        name: id.text,
        is_static: isStatic(element),
        decorator: getDecorators(element),
      },
    });
  };

  const declareParameter = (node: SyntaxNode) => {
    const parent = node.parent!;
    // the construct that declares the parameter is itself the scope
    const owned = (owner: SyntaxNode) =>
      scopes.get(owner.id) ?? enclosing(node);
    switch (parent.type) {
      // a type parameter of a generic
      case "type_parameter":
        declare(owned(parent.parent!.parent!), node.text, {
          kind: "parameter",
          at: getRange(node),
          space: "type",
        });
        break;
      // `infer U`, for the conditional type whose operand it is in
      case "infer_type":
        declare(owned(inferOwner(parent)), node.text, {
          kind: "parameter",
          at: getRange(node),
          space: "type",
        });
        break;
      // `[K in …]`, for the mapped type
      case "mapped_type_clause":
        declare(owned(parent.parent!), node.text, {
          kind: "parameter",
          at: getRange(node),
          space: "type",
        });
        break;
      // `[key: string]`
      case "index_signature":
        declare(owned(parent), node.text, {
          kind: "parameter",
          at: getRange(node),
        });
        break;
      case "formal_parameters":
        declareAll(owned(parent.parent!), node, "parameter");
        break;
      // an arrow function's single parameter
      default:
        declareAll(owned(parent), node, "parameter");
    }
  };

  // 2. bindings
  const selfNames: SyntaxNode[] = [];

  for (const { name, node } of scoping.get("binding").captures(root)) {
    switch (name) {
      case "binding.variable": {
        const scope = enclosing(node);
        if (node.parent!.type === "assignment_expression") {
          declareAll(scope, node, "variable", { kind: "using" });
          break;
        }
        const declaration = node.parent!.parent!;
        const isVar = declaration.type === "variable_declaration";
        declareAll(isVar ? varScope(scope) : scope, node, "variable", {
          kind: isVar
            ? "var"
            : declaration
                .childrenForFieldName("kind")
                .map((k) => k.text)
                .join(" "),
        });
        break;
      }
      case "binding.parameter":
        declareParameter(node);
        break;
      case "binding.declaration": {
        const owner = node.parent!;
        if (
          owner.type === "public_field_definition" ||
          owner.type === "method_definition"
        ) {
          declareElement(node, owner);
        } else if (
          owner.type === "enum_body" ||
          owner.type === "enum_assignment"
        ) {
          // a member is a bare name inside its enum
          declare(enclosing(node), node.text, {
            kind: "member",
            at: getRange(node),
          });
        } else {
          // `namespace A.B` binds `A`
          const id = rootOf(node);
          declare(enclosing(owner), id.text, {
            ...declared(owner),
            at: getRange(id),
          });
        }
        break;
      }
      case "binding.self":
        selfNames.push(node);
        break;
      case "binding.catch":
        declareAll(scopes.get(node.parent!.id)!, node, "variable", {
          kind: "catch",
        });
        break;
      case "binding.loop": {
        const loop = node.parent!;
        const kind = loop.childForFieldName("kind")!.text;
        const scope = scopes.get(loop.id)!;
        declareAll(kind === "var" ? varScope(scope) : scope, node, "variable", {
          kind,
        });
        break;
      }
      case "binding.import":
        declareImport(node);
        break;
    }
  }

  // a function or class expression's own name yields to anything declared
  // inside in the same space
  for (const id of selfNames) {
    const owner = id.parent!;
    const scope = scopes.get(owner.id)!;
    const body = owner.childForFieldName("body");
    const inner = body && scopes.get(body.id);
    const binding = declared(owner);
    const key = keyOf(id.text, binding.space);
    if (!scope.bindings.has(key) && !inner?.bindings.has(key)) {
      declare(scope, id.text, { ...binding, at: getRange(id) });
    }
  }

  // 3. emit
  for (const scope of scopes.values()) {
    if (scope.node.id !== root.id) {
      nodes.push({
        path: pathOf(scope),
        type: "anonymous",
        kind: SCOPES[scope.node.type].kind,
        at: region(scope.node),
        blockStartIndex: (scope.node.childForFieldName("body") ?? scope.node)
          .startIndex,
        props: scopeProps(scope.node),
      });
    }
    nodes.push(...scope.bindings.values());
  }

  return nodes;
}

const programHandler: ConvertHandler = (captures, parent) => {
  const result = createConvertResult<Node>();

  for (const { node } of captures) {
    result.nodes.push(...extract(node, parent));
  }

  return result;
};

export default programHandler;
