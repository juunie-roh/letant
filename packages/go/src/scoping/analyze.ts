import { ancestors, getRange, isField, NodeSource } from "letant/utils";
import type Parser from "tree-sitter";
import type { SyntaxNode } from "tree-sitter";

import { scoping } from "@/query";
import type { Node, NodeKind } from "@/types";

import { assumedName, isMergedBody, isOutsideOf } from "./rules";

export type Binding = Pick<Node, "kind" | "at"> & {
  /** Node id and start of the declaring identifier. */
  id: number;
  start: number;
  /**
   * The index the name is visible from. The scope of a name declared in a
   * function does not begin with its block (SCOPING.md §3).
   */
  from: number;
};

export type Scope = {
  node: SyntaxNode;
  parent?: Scope;
  bindings: Map<string, Binding>;
};

export type Analysis = {
  /** Every scope of the file, by the id of its syntax node. */
  scopes: Map<number, Scope>;
  file: Scope;
  /** The innermost scope whose region contains a node. */
  enclosing: (node: SyntaxNode) => Scope;
  /** Imports that bind no name the file spells: `_`, `.` and no name. */
  imports: { spec: SyntaxNode; path: string }[];
  /** The names the imports without one are assumed to bind (G2). */
  assumed: Set<string>;
};

/** The clauses of a type switch. */
const CLAUSES = new Set(["type_case", "default_case"]);

/** The text between the quotes of an import path. */
function importPath(spec: SyntaxNode): string {
  return spec.childForFieldName("path")!.text.slice(1, -1);
}

/** The type parameters a receiver's type declares: `T` in `(l *List[T])`. */
function receiverTypeParameters(type: SyntaxNode): SyntaxNode[] {
  let base = type;
  while (base.type === "pointer_type" || base.type === "parenthesized_type") {
    base = base.firstNamedChild!;
  }
  if (base.type !== "generic_type") return [];

  return base
    .childForFieldName("type_arguments")!
    .namedChildren.map((element) => element.firstNamedChild!)
    .filter((id) => id.type === "type_identifier");
}

function analyze(root: SyntaxNode): Analysis {
  const scopes = new Map<number, Scope>();
  const imports: Analysis["imports"] = [];
  const assumed = new Set<string>();

  // 1. scopes
  for (const { node } of scoping.get("scope").captures(root)) {
    if (!isMergedBody(node)) {
      scopes.set(node.id, { node, bindings: new Map() });
    }
  }

  const file = scopes.get(root.id)!;

  const enclosing = (node: SyntaxNode): Scope => {
    for (const [parent, child] of ancestors(node)) {
      const scope = scopes.get(parent.id);
      if (scope && !isOutsideOf(parent, child)) return scope;
    }
    return file;
  };

  for (const scope of scopes.values()) {
    if (scope !== file) scope.parent = enclosing(scope.node);
  }

  // one node per name per scope: the first declaration in the source. A
  // later one in the same block is a `:=` that assigns to the same variable
  const declare = (
    scope: Scope,
    id: SyntaxNode,
    kind: NodeKind,
    from: number,
    at: Node["at"] = getRange(id),
  ) => {
    if (id.text === "_") return;
    const known = scope.bindings.get(id.text);
    if (known && known.start <= id.startIndex) return;
    scope.bindings.set(id.text, {
      kind,
      at,
      id: id.id,
      start: id.startIndex,
      // a name of the package block is visible in the whole file
      from: scope === file ? 0 : from,
    });
  };

  // 2. bindings
  for (const { name, node } of scoping.get("binding").captures(root)) {
    switch (name) {
      case "binding.variable": {
        const list = node.parent!;
        const declaration =
          list.type === "expression_list" ? list.parent! : list;
        switch (declaration.type) {
          case "var_spec":
          case "const_spec":
            declare(
              enclosing(node),
              node,
              declaration.type === "var_spec" ? "variable" : "constant",
              declaration.endIndex,
            );
            break;
          case "short_var_declaration":
          case "receive_statement":
            declare(enclosing(node), node, "variable", declaration.endIndex);
            break;
          case "range_clause": {
            const loop = declaration.parent!;
            declare(
              scopes.get(loop.id)!,
              node,
              "variable",
              loop.childForFieldName("body")!.startIndex,
            );
            break;
          }
          case "type_switch_statement":
            // the guard declares a variable in every clause, from its colon
            for (const clause of declaration.namedChildren) {
              const scope = scopes.get(clause.id);
              const colon = clause.children.find((c) => c.type === ":");
              if (CLAUSES.has(clause.type) && scope && colon) {
                declare(scope, node, "variable", colon.startIndex);
              }
            }
            break;
        }
        break;
      }
      case "binding.parameter": {
        const list = node.parent!.parent!;
        const owner = list.parent!;
        // a receiver's type
        if (
          isField(owner, "receiver", list) &&
          isField(node.parent!, "type", node)
        ) {
          const method = scopes.get(owner.id)!;
          for (const id of receiverTypeParameters(node)) {
            declare(method, id, "type", id.startIndex);
          }
          break;
        }
        if (list.type === "type_parameter_list") {
          declare(scopes.get(owner.id)!, node, "type", list.startIndex);
          break;
        }
        // parameters, results and the receiver are visible in the body
        const signature =
          owner.childForFieldName("result") ??
          owner.childForFieldName("parameters")!;
        declare(
          scopes.get(owner.id)!,
          node,
          isField(owner, "result", list) ? "variable" : "parameter",
          signature.endIndex,
        );
        break;
      }
      case "binding.declaration": {
        const isFunction = node.parent!.type === "function_declaration";
        // `init` introduces no binding
        if (isFunction && node.text === "init") break;
        declare(
          enclosing(node),
          node,
          isFunction ? "function" : "type",
          node.startIndex,
        );
        break;
      }
      case "binding.import": {
        const local = node.childForFieldName("name");
        const path = importPath(node);
        if (local?.type === "package_identifier") {
          declare(file, local, "module", 0, NodeSource(path));
          break;
        }
        imports.push({ spec: node, path });
        if (!local) {
          const name = assumedName(path);
          if (name) assumed.add(name);
        }
        break;
      }
    }
  }

  return { scopes, file, enclosing, imports, assumed };
}

const analyses = new WeakMap<Parser.Tree, Analysis>();

/**
 * The scopes and bindings of a syntax tree. `extract` emits them, and
 * `unsupported` reads the same result to decide what the emitted tree
 * cannot answer, so the two cannot disagree. The result is kept for as long
 * as the syntax tree is.
 */
export function analysisOf(tree: Parser.Tree): Analysis {
  let analysis = analyses.get(tree);
  if (!analysis) {
    analysis = analyze(tree.rootNode);
    analyses.set(tree, analysis);
  }
  return analysis;
}
