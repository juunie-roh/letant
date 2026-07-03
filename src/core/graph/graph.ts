import { isNodeSource, NodePath } from "@/common/branded-types";
import { defined } from "@/common/defined";
import type { Edge, Node } from "@/models";

import GraphCursor from "./cursor";
import GraphError from "./error";

class Graph {
  private readonly _root: string;
  private _nodes: Map<string, Node>;
  private _edges: Map<string, Map<string, Set<string>>>;
  private _edgeProps: Map<string, Map<string, Map<string, Edge["props"]>>>;

  constructor(nodes: Node[], edges: Edge[], filePath: string) {
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
   * @returns The node at the given path, or `undefined` if not found.
   */
  getNode(path: NodePath): Node | undefined {
    return this._nodes.get(Graph.encode(path));
  }

  /**
   * Adds a node to the graph.
   *
   * Deduplicates by `path`: when two nodes share the same path, a `scope` node
   * replaces a non-`scope` node; otherwise the first-added node is kept.
   *
   * @returns `this` for chaining.
   */
  addNode(node: Node): this {
    const { path } = node;
    const key = Graph.encode(path);

    const existing = this._nodes.get(key);
    if (!existing || (node.type === "scope" && existing.type !== "scope")) {
      this._nodes.set(key, node);
    }

    if (!this._edges.has(key)) {
      this._edges.set(key, new Map());
    }

    return this;
  }

  /**
   * Removes a node from the graph.
   * @returns `this` for chaining.
   */
  removeNode(node: Node): this {
    const key = Graph.encode(node.path);
    this._edges.delete(key);
    this._nodes.delete(key);
    this._edgeProps.delete(key);

    for (const adjacentNodes of this._edges.values()) {
      adjacentNodes.delete(key);
    }

    for (const toMap of this._edgeProps.values()) {
      toMap.delete(key);
    }

    return this;
  }

  /**
   * @returns The adjacent nodes and their edge kinds for the given path.
   */
  adjacent(
    path: NodePath,
  ): ReadonlyMap<NodePath, ReadonlySet<string>> | undefined {
    const inner = this._edges.get(Graph.encode(path));
    if (!inner) return undefined;

    const result = new Map<NodePath, Set<string>>();
    for (const [toKey, kinds] of inner) {
      result.set(Graph.decode(toKey), kinds);
    }
    return result;
  }

  getEdgeProperties(from: NodePath, to: NodePath, kind: string): Edge["props"] {
    return this._edgeProps
      .get(Graph.encode(from))
      ?.get(Graph.encode(to))
      ?.get(kind);
  }

  /**
   * Adds an edge to the graph.
   * @returns `this` for chaining.
   */
  addEdge(edge: Edge): this {
    const fromKey = Graph.encode(edge.from);
    const toKey = Graph.encode(edge.to);
    const { kind, props } = edge;

    if (!this._edges.has(fromKey)) {
      throw new GraphError(
        "GRAPH_NO_NODE",
        `There is no node with key: ${fromKey}`,
      );
    }

    const adjacentNodes = this._adjacent(fromKey);
    defined(
      adjacentNodes,
      new GraphError(
        "GRAPH_UNDEFINED_INSTANCE",
        `No adjacency map found for node: ${fromKey}`,
      ),
    );

    if (!adjacentNodes.has(toKey)) {
      adjacentNodes.set(toKey, new Set());
    }

    adjacentNodes.get(toKey)!.add(kind);

    if (props !== undefined) {
      this._setEdgeProperties(fromKey, toKey, kind, props);
    }

    return this;
  }

  /**
   * @returns `this` for chaining.
   */
  removeEdge(from: NodePath, to: NodePath, kind: string): this {
    const fromKey = Graph.encode(from);
    const toKey = Graph.encode(to);
    this._edges.get(fromKey)?.get(toKey)?.delete(kind);
    this._edgeProps.get(fromKey)?.get(toKey)?.delete(kind);
    return this;
  }

  /**
   * @returns True if there is an edge from `from` to `to` with the given kind.
   */
  hasEdge(from: NodePath, to: NodePath, kind: string): boolean {
    return (
      this._edges.get(Graph.encode(from))?.get(Graph.encode(to))?.has(kind) ??
      false
    );
  }

  /**
   * @returns The path of the direct parent, or `undefined` for the root.
   */
  parent(path: NodePath): NodePath | undefined {
    if (path.length <= 1) return undefined;
    const parentKey = Graph.encode(NodePath(path.slice(0, -1)));
    return this._edges.has(parentKey) ? Graph.decode(parentKey) : undefined;
  }

  /**
   * @returns 0-based depth relative to root module.
   */
  depth(path: NodePath): number {
    return path.length - 1;
  }

  walk(): GraphCursor {
    return new GraphCursor(this, Graph.decode(this._root!));
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

    for (const [fromKey, toMap] of this._edges) {
      for (const [toKey, kinds] of toMap) {
        for (const kind of kinds) {
          const props = this._edgeProps.get(fromKey)?.get(toKey)?.get(kind);
          edges.push({
            from: Graph.decode(fromKey),
            to: Graph.decode(toKey),
            kind,
            ...(props !== undefined && { props }),
          });
        }
      }
    }

    return { nodes, edges };
  }

  destroy() {
    this._nodes.clear();
    this._edges.clear();
    this._edgeProps.clear();
  }

  private _adjacent(key: string): Map<string, Set<string>> | undefined {
    return this._edges.get(key);
  }

  private _setEdgeProperties(
    from: string,
    to: string,
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
  const DELIMITER = "\0";

  export function encode(path: NodePath): string {
    return path.join(DELIMITER);
  }

  export function decode(key: string): NodePath {
    return NodePath(key.split(DELIMITER));
  }
}

export default Graph;
