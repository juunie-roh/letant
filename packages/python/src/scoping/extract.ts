import {
  createChildPath,
  createConvertResult,
  getRange,
  type NodePath,
  NodeSource,
} from "letant/utils";
import type Parser from "tree-sitter";
import type { SyntaxNode } from "tree-sitter";

import { scoping } from "@/query";
import type { ConvertHandler, Node } from "@/types";

import {
  DECLARATIONS,
  isComprehension,
  isOutsideOf,
  nameOf,
  regionOf,
  SCOPES,
  typeParameters,
} from "./rules";
import toModulePath from "./utility/module-path";
import parameterName, { typeParameterName } from "./utility/parameter";
import flatPattern from "./utility/pattern";

type Scope = {
  node: SyntaxNode;
  parent?: Scope;
  path?: NodePath;
  bindings: Map<string, Node>;
  /** Names a `global` statement moves to the module scope. */
  global: Set<string>;
  /** Names a `nonlocal` statement leaves to an enclosing function. */
  nonlocal: Set<string>;
};

type Binding = Pick<Node, "kind" | "at" | "props">;

/** A scope's segment contains `@`, so it can never equal an identifier. */
function segment(node: SyntaxNode): string {
  const name = node.childForFieldName("name");
  return `${name?.text ?? SCOPES[node.type].label}@${node.startIndex}`;
}

function region(node: SyntaxNode): Parser.Range {
  const [first, last] = regionOf(node);
  return {
    startIndex: first.startIndex,
    startPosition: first.startPosition,
    endIndex: last.endIndex,
    endPosition: last.endPosition,
  };
}

function scopeProps(node: SyntaxNode): Node["props"] {
  if (node.type === "function_definition") {
    return { is_async: node.children.some((c) => c.type === "async") };
  }
  if (node.type === "class_definition") {
    return { extends: node.childForFieldName("superclasses")?.text };
  }
  return undefined;
}

function extract(root: SyntaxNode, rootPath: NodePath): Node[] {
  const scopes = new Map<number, Scope>();
  const nodes: Node[] = [];

  // 1. scopes
  for (const { node } of scoping.get("scope").captures(root)) {
    scopes.set(node.id, {
      node,
      bindings: new Map(),
      global: new Set(),
      nonlocal: new Set(),
    });
  }

  const moduleScope = scopes.get(root.id)!;

  const enclosing = (node: SyntaxNode): Scope => {
    let child = node;
    let parent = node.parent;
    while (parent) {
      const scope = scopes.get(parent.id);
      if (scope && !isOutsideOf(parent, child)) return scope;
      child = parent;
      parent = parent.parent;
    }
    return moduleScope;
  };

  // Positions descend through the tree by range, so a scope's parent is the
  // scope whose region contains it. That is the scope it is evaluated in,
  // except for a scope written in a comprehension's first iterable.
  const container = (scope: Scope): Scope => {
    const [first, last] = regionOf(scope.node);
    for (let node: SyntaxNode | null = scope.node; node; node = node.parent) {
      const generic = typeParameters(node);
      for (const id of [node.id, generic?.id]) {
        const candidate = id === undefined ? undefined : scopes.get(id);
        if (!candidate || candidate === scope) continue;
        const [start, end] = regionOf(candidate.node);
        if (
          start.startIndex <= first.startIndex &&
          last.endIndex <= end.endIndex
        ) {
          return candidate;
        }
      }
    }
    return moduleScope;
  };

  for (const scope of scopes.values()) {
    if (scope.node.id !== root.id) scope.parent = container(scope);
  }

  const pathOf = (scope: Scope): NodePath => {
    scope.path ??= scope.parent
      ? createChildPath(pathOf(scope.parent), segment(scope.node))
      : rootPath;
    return scope.path;
  };

  // one node per name per scope: the first binding in the source
  const declare = (scope: Scope, id: SyntaxNode, binding: Binding) => {
    const name = nameOf(id);
    if (scope.nonlocal.has(name)) return;
    const target = scope.global.has(name) ? moduleScope : scope;
    if (target.bindings.has(name)) return;
    target.bindings.set(name, {
      ...binding,
      path: createChildPath(pathOf(target), name),
      type: "binding",
      // a class's names are visible in the class body only
      ...(target.node.type === "class_definition" && { visibility: "local" }),
    } as Node);
  };

  const declareImport = (statement: SyntaxNode) => {
    const scope = enclosing(statement);
    const from =
      statement.type === "future_import_statement"
        ? "__future__"
        : statement.childForFieldName("module_name")?.text;

    for (const item of statement.childrenForFieldName("name")) {
      const alias = item.childForFieldName("alias");
      const name = alias ? item.childForFieldName("name")! : item;
      const props = alias ? { alias_of: name.text } : undefined;

      if (from === undefined) {
        // `import a.b` binds `a`; `import a.b as c` binds `c` to `a.b`
        const bound = alias ?? name.firstNamedChild!;
        const at = NodeSource(alias ? name.text : bound.text);
        declare(scope, bound, { kind: "module", at, props });
        continue;
      }

      let path = toModulePath(from);
      // `from . import sibling` — the imported name is itself a submodule
      if (path.endsWith("/")) path += name.text;
      declare(scope, alias ?? name, {
        kind: "module",
        at: NodeSource(path),
        props,
      });
    }
  };

  // 2. bindings
  const captures = scoping.get("binding").captures(root);

  // `global` and `nonlocal` apply to their whole scope, so they come first
  for (const { name, node } of captures) {
    if (name === "binding.global") enclosing(node).global.add(nameOf(node));
    if (name === "binding.nonlocal") enclosing(node).nonlocal.add(nameOf(node));
  }

  for (const { name, node } of captures) {
    switch (name) {
      case "binding.variable": {
        let scope = enclosing(node);
        // an assignment expression binds in the scope that contains the
        // outermost comprehension
        if (node.parent!.type === "named_expression") {
          while (isComprehension(scope.node)) scope = scope.parent!;
        }
        for (const id of flatPattern(node)) {
          declare(scope, id, { kind: "variable", at: getRange(id) });
        }
        break;
      }
      case "binding.parameter": {
        const list = node.parent!;
        if (list.type === "type_parameter") {
          const id = typeParameterName(node);
          declare(scopes.get(list.id)!, id, {
            kind: "type",
            at: getRange(id),
          });
          break;
        }
        const parameter = parameterName(node);
        if (parameter) {
          declare(scopes.get(list.parent!.id)!, parameter.node, {
            kind: "parameter",
            at: getRange(parameter.node),
            props: { has_default: parameter.has_default },
          });
        }
        break;
      }
      case "binding.declaration": {
        let owner = node.parent!;
        while (!(owner.type in DECLARATIONS)) owner = owner.parent!;
        declare(enclosing(owner), node, {
          kind: DECLARATIONS[owner.type],
          at: getRange(node),
        });
        break;
      }
      case "binding.import":
        declareImport(node);
        break;
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
        barrier: SCOPES[scope.node.type].barrier,
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
