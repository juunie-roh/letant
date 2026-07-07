import { isNodeSource, NodeId, NodePath } from "@/common/branded-types";
import { defined } from "@/common/defined";
import type { Edge, Node } from "@/models";

import GraphCursor from "./cursor";
import GraphError from "./error";

/**
 *
 * @see {@link https://github.com/juunie-roh/letant/blob/main/docs/architecture/decisions/0002-sha-256-based-nodepath-encryption.md ADR-0002}
 */
class Graph {
  private readonly _root: string;
  private _nextId: number;
  /**
   * Interned path key → id. The only string-keyed map; every other
   * structure keys by integer id.
   */
  private _ids: Map<string, NodeId>;
  private _nodes: Map<NodeId, Node>;
  private _edges: Map<NodeId, Map<NodeId, Set<string>>>;
  private _edgeProps: Map<NodeId, Map<NodeId, Map<string, Edge["props"]>>>;

  constructor(nodes: Node[], edges: Edge[], filePath: string) {
    this._nextId = 0;
    this._ids = new Map();
    this._nodes = new Map();
    this._edges = new Map();
    this._edgeProps = new Map();
    this._root = filePath;

    for (const node of nodes) {
      this.addNode(node);
    }

    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  get root(): string {
    return this._root;
  }

  /**
   * @returns The intra-graph id for the path, or `undefined` if the path
   * is not registered. Ephemeral — never persist or compare across graphs.
   */
  id(path: NodePath): NodeId | undefined {
    return this._ids.get(Graph.encode(path));
  }

  /**
   * @returns The node at the given path, or `undefined` if not found.
   */
  getNode(path: NodePath): Node | undefined {
    const id = this.id(path);
    return id === undefined ? undefined : this._nodes.get(id);
  }

  /**
   * Adds a node to the graph, minting an id for its path on first sight.
   *
   * Deduplicates by `path`: when two nodes share the same path, a `scope` node
   * replaces a non-`scope` node; otherwise the first-added node is kept.
   * The id is stable across replacement.
   *
   * @returns `this` for chaining.
   */
  addNode(node: Node): this {
    const key = Graph.encode(node.path);

    let id = this._ids.get(key);
    if (id === undefined) {
      id = NodeId(this._nextId++);
      this._ids.set(key, id);
    }

    const existing = this._nodes.get(id);
    if (!existing || (node.type === "scope" && existing.type !== "scope")) {
      this._nodes.set(id, node);
    }

    if (!this._edges.has(id)) {
      this._edges.set(id, new Map());
    }

    return this;
  }

  /**
   * Removes a node from the graph.
   * @returns `this` for chaining.
   */
  removeNode(node: Node): this {
    const key = Graph.encode(node.path);
    const id = this._ids.get(key);
    if (id === undefined) return this;

    this._ids.delete(key);
    this._nodes.delete(id);
    this._edges.delete(id);
    this._edgeProps.delete(id);

    for (const adjacentNodes of this._edges.values()) {
      adjacentNodes.delete(id);
    }

    for (const toMap of this._edgeProps.values()) {
      toMap.delete(id);
    }

    return this;
  }

  /**
   * @returns The adjacent nodes and their edge kinds for the given path.
   */
  adjacent(
    path: NodePath,
  ): ReadonlyMap<NodePath, ReadonlySet<string>> | undefined {
    const id = this.id(path);
    const inner = id === undefined ? undefined : this._edges.get(id);
    if (!inner) return undefined;

    const result = new Map<NodePath, Set<string>>();
    for (const [toId, kinds] of inner) {
      result.set(this._pathOf(toId), kinds);
    }

    return result;
  }

  getEdgeProperties(from: NodePath, to: NodePath, kind: string): Edge["props"] {
    const fromId = this.id(from);
    const toId = this.id(to);
    if (fromId === undefined || toId === undefined) return undefined;

    return this._edgeProps.get(fromId)?.get(toId)?.get(kind);
  }

  /**
   * Adds an edge to the graph. Both endpoints must already be registered.
   * @returns `this` for chaining.
   */
  addEdge(edge: Edge): this {
    const fromId = this.id(edge.from);
    if (fromId === undefined) {
      throw new GraphError(
        "GRAPH_NO_NODE",
        `There is no node with key: ${Graph.encode(edge.from)}`,
      );
    }

    const toId = this.id(edge.to);
    if (toId === undefined) {
      throw new GraphError(
        "GRAPH_NO_NODE",
        `There is no node with key: ${Graph.encode(edge.to)}`,
      );
    }

    const { kind, props } = edge;

    const adjacentNodes = this._edges.get(fromId);
    defined(
      adjacentNodes,
      new GraphError(
        "GRAPH_UNDEFINED_INSTANCE",
        `No adjacency map found for node: ${Graph.encode(edge.from)}`,
      ),
    );

    if (!adjacentNodes.has(toId)) {
      adjacentNodes.set(toId, new Set());
    }

    adjacentNodes.get(toId)!.add(kind);

    if (props !== undefined) {
      this._setEdgeProperties(fromId, toId, kind, props);
    }

    return this;
  }

  /**
   * @returns `this` for chaining.
   */
  removeEdge(from: NodePath, to: NodePath, kind: string): this {
    const fromId = this.id(from);
    const toId = this.id(to);
    if (fromId === undefined || toId === undefined) return this;

    this._edges.get(fromId)?.get(toId)?.delete(kind);
    this._edgeProps.get(fromId)?.get(toId)?.delete(kind);
    return this;
  }

  /**
   * @returns True if there is an edge from `from` to `to` with the given kind.
   */
  hasEdge(from: NodePath, to: NodePath, kind: string): boolean {
    const fromId = this.id(from);
    const toId = this.id(to);
    if (fromId === undefined || toId === undefined) return false;

    return this._edges.get(fromId)?.get(toId)?.has(kind) ?? false;
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

  walk(): GraphCursor {
    return new GraphCursor(this, NodePath([this._root]));
  }

  /**
   * @returns Serialized graph nodes and edges.
   */
  serialize() {
    const nodes = Array.from(
      this._nodes.values().map((n) => ({
        ...n,
        at: isNodeSource(n.at)
          ? n.at
          : {
              byte: `${n.at.startIndex}:${n.at.endIndex}`,
              line: `L${n.at.startPosition.row}:L${n.at.endPosition.row}`,
            },
      })),
    );
    const edges = [];

    for (const [fromId, toMap] of this._edges) {
      for (const [toId, kinds] of toMap) {
        for (const kind of kinds) {
          const props = this._edgeProps.get(fromId)?.get(toId)?.get(kind);
          edges.push({
            from: this._pathOf(fromId),
            to: this._pathOf(toId),
            kind,
            ...(props !== undefined && { props }),
          });
        }
      }
    }

    return { nodes, edges };
  }

  destroy() {
    this._ids.clear();
    this._nodes.clear();
    this._edges.clear();
    this._edgeProps.clear();
  }

  private _pathOf(id: NodeId): NodePath {
    const node = this._nodes.get(id);
    defined(
      node,
      new GraphError(
        "GRAPH_UNDEFINED_INSTANCE",
        `No node registered for id: ${id}`,
      ),
    );

    return node.path;
  }

  private _setEdgeProperties(
    from: NodeId,
    to: NodeId,
    kind: string,
    props: Edge["props"],
  ): this {
    if (!this._edgeProps.has(from)) {
      this._edgeProps.set(from, new Map());
    }

    const fromMap = this._edgeProps.get(from);
    defined(
      fromMap,
      new GraphError(
        "GRAPH_UNDEFINED_INSTANCE",
        `No edge properties map found for node: ${from}`,
      ),
    );

    if (!fromMap.has(to)) {
      fromMap.set(to, new Map());
    }

    fromMap.get(to)!.set(kind, props);
    return this;
  }
}

namespace Graph {
  /**
   * Interning key for a path, used only inside the graph boundary and
   * never decoded. JSON keeps the encoding bijective for any segment
   * content; node paths are recovered from stored nodes, not from keys.
   */
  export function encode(path: NodePath): string {
    return JSON.stringify(path);
  }
}

export default Graph;
