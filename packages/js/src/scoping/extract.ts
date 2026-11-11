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
  isFunction,
  isMergedBody,
  isOutsideOf,
  isVarScope,
  SCOPES,
  startsAtParameters,
} from "./rules";
import { getParameters } from "./utility/node";
import flatPattern from "./utility/pattern";
import { getDecorators, isAsync, isStatic } from "./utility/property";

type Scope = {
  node: SyntaxNode;
  parent?: Scope;
  path?: NodePath;
  bindings: Map<string, Node>;
};

type Binding = Pick<Node, "kind" | "at" | "props">;

const SEGMENT_NAMES = new Set([
  "identifier",
  "property_identifier",
  "private_property_identifier",
]);

/** A scope's segment contains `@`, so it can never equal an identifier. */
function segment(node: SyntaxNode, label: string): string {
  const name = node.childForFieldName("name");
  const shown = name && SEGMENT_NAMES.has(name.type) ? name.text : label;
  return `${shown}@${node.startIndex}`;
}

function region(node: SyntaxNode): Parser.Range {
  const range = getRange(node);
  if (!startsAtParameters(node)) return range;

  const { startIndex, startPosition } = getParameters(node)!;
  return { ...range, startIndex, startPosition };
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
  if (node.type === "class_declaration" || node.type === "class") {
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
    if (!isMergedBody(node)) {
      scopes.set(node.id, { node, bindings: new Map() });
    }
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

  // one node per name per scope: the first declaration, unless a function
  // declaration follows, which initializes the binding
  const declare = (scope: Scope, name: string, binding: Binding) => {
    if (scope.bindings.has(name) && binding.kind !== "function") return;
    scope.bindings.set(name, {
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

  const declareImport = (statement: SyntaxNode) => {
    const scope = enclosing(statement);
    const string = statement.childForFieldName("source")!;
    const at = NodeSource(string.firstNamedChild?.text ?? "");
    const clause = statement.namedChildren.find(
      (c) => c.type === "import_clause",
    );

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
        declare(scope, child.text, { kind: "module", at });
      } else if (child.type === "namespace_import") {
        declare(scope, child.firstNamedChild!.text, { kind: "module", at });
      } else {
        for (const specifier of child.namedChildren) {
          const name = specifier.childForFieldName("name")!;
          const alias = specifier.childForFieldName("alias");
          declare(scope, (alias ?? name).text, {
            kind: "module",
            at,
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

  // 2. bindings
  const selfNames: SyntaxNode[] = [];

  for (const { name, node } of scoping.get("binding").captures(root)) {
    switch (name) {
      case "binding.variable": {
        const declaration = node.parent!.parent!;
        const scope = enclosing(node);
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
      case "binding.parameter": {
        const owner =
          node.parent!.type === "formal_parameters"
            ? node.parent!.parent!
            : node.parent!;
        declareAll(scopes.get(owner.id)!, node, "parameter");
        break;
      }
      case "binding.declaration": {
        const owner = node.parent!;
        if (
          owner.type === "field_definition" ||
          owner.type === "method_definition"
        ) {
          declareElement(node, owner);
        } else {
          declare(enclosing(owner), node.text, {
            kind: SCOPES[owner.type].kind,
            at: getRange(node),
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

  // a function or class expression's own name yields to anything declared inside
  for (const id of selfNames) {
    const owner = id.parent!;
    const scope = scopes.get(owner.id)!;
    const body = owner.childForFieldName("body");
    const inner = body && scopes.get(body.id);
    if (!scope.bindings.has(id.text) && !inner?.bindings.has(id.text)) {
      declare(scope, id.text, {
        kind: SCOPES[owner.type].kind,
        at: getRange(id),
      });
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
