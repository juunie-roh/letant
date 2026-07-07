import { NodeId, NodePath } from "@/common/branded-types";
import { defined } from "@/common/defined";
import type { Node } from "@/models";

import TreeCursor from "./cursor";
import TreeError from "./error";

/**
 * Declaration-only scope containment tree. Containment is derived from
 * `NodePath` alone — there is no stored edge data.
 *
 * @see {@link https://github.com/juunie-roh/letant/blob/main/docs/architecture/decisions/0002-sha-256-based-node-path-hashing.md ADR-0002}
 * @see {@link https://github.com/juunie-roh/letant/blob/main/docs/architecture/decisions/0003-containment-tree-as-base-structure.md ADR-0003}
 */
class Tree {
  private readonly _root: string;
  private _nextId: number;
  /**
   * Interned path key → id. The only string-keyed map; every other
   * structure keys by integer id.
   */
  private _ids: Map<string, NodeId>;
  private _nodes: Map<NodeId, Node>;
  /** Parent id → child ids, in first-materialization order. */
  private _children: Map<NodeId, NodeId[]>;

  constructor(nodes: Node[], filePath: string) {
    this._nextId = 0;
    this._ids = new Map();
    this._nodes = new Map();
    this._children = new Map();
    this._root = filePath;

    for (const node of nodes) {
      this.addNode(node);
    }
  }

  get root(): string {
    return this._root;
  }

  /**
   * @returns The intra-tree id for the path, or `undefined` if the path
   * is not registered. Ephemeral — never persist or compare across trees.
   */
  id(path: NodePath): NodeId | undefined {
    return this._ids.get(Tree.encode(path));
  }

  /**
   * @returns The node at the given path, or `undefined` if not found.
   */
  getNode(path: NodePath): Node | undefined {
    const id = this.id(path);
    return id === undefined ? undefined : this._nodes.get(id);
  }

  /**
   * Adds a node to the tree, minting an id for its path on first sight
   * and attaching it under its parent path.
   *
   * Node order is free: a child added before its parent interns the parent
   * id ahead of the parent node's arrival.
   *
   * Deduplicates by `path`: when two nodes share the same path, a `scope` node
   * replaces a non-`scope` node; otherwise the first-added node is kept.
   * The id and the parent attachment are stable across replacement.
   *
   * @returns `this` for chaining.
   */
  addNode(node: Node): this {
    const id = this._intern(Tree.encode(node.path));

    const existing = this._nodes.get(id);
    if (!existing && node.path.length > 1) {
      // first materialization — attach under the parent path
      const parentId = this._intern(
        Tree.encode(NodePath(node.path.slice(0, -1))),
      );
      const siblings = this._children.get(parentId);
      defined(
        siblings,
        new TreeError(
          "TREE_UNDEFINED_INSTANCE",
          `No children list found for node: ${parentId}`,
        ),
      );
      siblings.push(id);
    }

    if (!existing || (node.type === "scope" && existing.type !== "scope")) {
      this._nodes.set(id, node);
    }

    return this;
  }

  /**
   * Removes a node from the tree and detaches it from its parent.
   * @returns `this` for chaining.
   */
  removeNode(node: Node): this {
    const key = Tree.encode(node.path);
    const id = this._ids.get(key);
    if (id === undefined) return this;

    this._ids.delete(key);
    this._nodes.delete(id);
    this._children.delete(id);

    if (node.path.length > 1) {
      const parentId = this._ids.get(
        Tree.encode(NodePath(node.path.slice(0, -1))),
      );
      if (parentId !== undefined) {
        const siblings = this._children.get(parentId);
        if (siblings) {
          this._children.set(
            parentId,
            siblings.filter((childId) => childId !== id),
          );
        }
      }
    }

    return this;
  }

  /**
   * @returns The paths of the direct children of the given path, in
   * insertion order. Empty for a leaf or an unregistered path.
   */
  children(path: NodePath): readonly NodePath[] {
    const id = this.id(path);
    const childIds = id === undefined ? undefined : this._children.get(id);
    if (!childIds) return [];

    return childIds.map((childId) => this._pathOf(childId));
  }

  /**
   * @returns The path of the direct parent, or `undefined` for the root.
   */
  parent(path: NodePath): NodePath | undefined {
    if (path.length <= 1) return undefined;
    return this.getNode(NodePath(path.slice(0, -1)))?.path;
  }

  /**
   * @returns 0-based depth relative to root module.
   */
  depth(path: NodePath): number {
    return path.length - 1;
  }

  /**
   * Top-level names declared in this file: the non-anonymous nodes sitting
   * directly under the root module. These are the only names referable
   * across files. Sorted, since extraction order is not
   * guaranteed.
   */
  topLevelNames(): string[] {
    const names: string[] = [];
    for (const node of this._nodes.values()) {
      if (node.path.length === 2 && node.type !== "anonymous") {
        names.push(node.path[1]);
      }
    }
    return names.sort();
  }

  walk(): TreeCursor {
    return new TreeCursor(this, NodePath([this._root]));
  }

  /**
   * Development surface: dumps the scope tree nodes for inspection and
   * snapshot tests. Carries no compatibility promise (ADR 0004).
   */
  serialize() {
    const nodes = Array.from(
      this._nodes.values().map((n) => ({
        ...n,
        at: n.at,
      })),
    );

    return { nodes };
  }

  destroy() {
    this._ids.clear();
    this._nodes.clear();
    this._children.clear();
  }

  /**
   * @returns The id for the interned path key, minting one — with an empty
   * children list — on first sight.
   */
  private _intern(key: string): NodeId {
    let id = this._ids.get(key);
    if (id === undefined) {
      id = NodeId(this._nextId++);
      this._ids.set(key, id);
      this._children.set(id, []);
    }
    return id;
  }

  private _pathOf(id: NodeId): NodePath {
    const node = this._nodes.get(id);
    defined(
      node,
      new TreeError(
        "TREE_UNDEFINED_INSTANCE",
        `No node registered for id: ${id}`,
      ),
    );
    return node.path;
  }
}

namespace Tree {
  /**
   * Interning key for a path, used only inside the tree boundary and
   * never decoded. JSON keeps the encoding bijective for any segment
   * content; node paths are recovered from stored nodes, not from keys.
   */
  export function encode(path: NodePath): string {
    return JSON.stringify(path);
  }
}

export default Tree;
