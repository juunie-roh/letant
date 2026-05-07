import { defined } from "@/common/defined";
import type {
  Edge as E,
  Node as N,
  NodeId,
  NodePath,
  UnionOmit,
} from "@/models";

import GraphCursor from "./cursor";
import GraphError from "./error";
import HashRegistry from "./hash-registry";

declare namespace Graph {
  type GraphNode = UnionOmit<N, "path"> & {
    id: NodeId;
    /**
     * Last element of path segments representing the node.
     */
    name: string;
  };

  type GraphEdge = Pick<E, "kind"> & {
    from: NodeId;
    to: NodeId;
  };

  export { GraphEdge as Edge, GraphNode as Node };
}

class Graph {
  private _registry: HashRegistry;
  private _nodes: Map<NodeId, Graph.Node>;
  private _edges: Map<NodeId, Map<NodeId, Set<Graph.Edge["kind"]>>>;
  private _edgeProps: Map<
    NodeId,
    Map<NodeId, Map<Graph.Edge["kind"], E["props"]>>
  >;
  private _root: NodeId | undefined;

  constructor(nodes: N[], edges: E[]) {
    this._registry = new HashRegistry();
    this._nodes = new Map();
    this._edges = new Map();
    this._edgeProps = new Map();

    for (const node of nodes) {
      this.addNode(node);
    }

    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  /**
   * @returns All the nodes added to the graph.
   */
  get nodes(): ReadonlyMap<NodeId, Graph.Node> {
    return this._nodes;
  }
  /**
   * @returns The adjacency list of the graph.
   */
  get edges(): ReadonlyMap<
    NodeId,
    ReadonlyMap<NodeId, ReadonlySet<Graph.Edge["kind"]>>
  > {
    return this._edges;
  }
  /**
   * @returns Language specific metadata for each edges.
   */
  get edgeProps(): ReadonlyMap<
    NodeId,
    ReadonlyMap<NodeId, ReadonlyMap<Graph.Edge["kind"], E["props"]>>
  > {
    return this._edgeProps;
  }

  /**
   * Adds a node to the graph.
   *
   * Deduplicates by `path`: when two nodes share the same path, a `scope` node
   * replaces a non-`scope` node; otherwise the first-added node is kept.
   *
   * @returns `this` for chaining.
   */
  addNode(node: N): this {
    const { path } = node;
    const id = this._registry.encode(path);
    if (path.length === 1) this._root = id;

    const existing = this._nodes.get(id);
    if (!existing || (node.type === "scope" && existing.type !== "scope")) {
      this._nodes.set(id, {
        ...node,
        id,
        name: path[path.length - 1],
      });
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
  removeNode(node: N): this {
    const id = this._registry.encode(node.path);
    this._edges.delete(id);
    this._nodes.delete(id);
    this._edgeProps.delete(id); // outgoing props

    for (const adjacentNodes of this._edges.values()) {
      adjacentNodes.delete(id);
    }

    for (const toMap of this._edgeProps.values()) {
      toMap.delete(id); // incoming props
    }

    return this;
  }

  /**
   * @returns The adjacent node ids set for the given node id.
   */
  adjacent(
    id: NodeId,
  ): ReadonlyMap<NodeId, ReadonlySet<Graph.Edge["kind"]>> | undefined {
    return this._edges.get(id);
  }

  getEdgeProperties(
    from: NodeId,
    to: NodeId,
    kind: Graph.Edge["kind"],
  ): E["props"] {
    return this._edgeProps.get(from)?.get(to)?.get(kind);
  }

  /**
   * Adds an edge to the graph.
   * @returns `this` for chaining.
   */
  addEdge(edge: E): this {
    const { from, to, kind, props } = edge;
    const fromId = this._registry.encode(from);
    const toId = this._registry.encode(to);

    if (!this._edges.has(fromId)) {
      throw new GraphError(
        "GRAPH_NO_NODE",
        `There is no node with id: ${fromId}`,
      );
    }

    const adjacentNodes = this._adjacent(fromId);
    defined(
      adjacentNodes,
      new GraphError(
        "GRAPH_UNDEFINED_INSTANCE",
        `No adjacency map found for node: ${fromId}`,
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
  removeEdge(from: NodeId, to: NodeId, kind: Graph.Edge["kind"]): this {
    this._edges.get(from)?.get(to)?.delete(kind);
    this._edgeProps.get(from)?.get(to)?.delete(kind);
    return this;
  }

  /**
   * @returns True if there is an edge from the `source` node to `target` node.
   */
  hasEdge(from: NodeId, to: NodeId, kind: Graph.Edge["kind"]): boolean {
    return this._edges.get(from)?.get(to)?.has(kind) ?? false;
  }

  /**
   * @param id - The `NodeId` of the node whose parent to look up.
   * @returns The {@link NodeId | `NodeId`} of the direct parent node in the scope chain, or `undefined` if the node has no registered parent.
   */
  parent(id: NodeId): NodeId | undefined {
    const path = this._registry.decode(id).slice(0, -1) as NodePath;

    if (!this._registry.has(path)) return;

    return this._registry.encode(path);
  }

  /**
   * @returns 0-based depth relative to root module.
   */
  depth(id: NodeId): number {
    return this._registry.decode(id).length - 1;
  }

  /**
   * @returns Path segments matching {@link NodeId | id} registered in the graph.
   */
  path(id: NodeId): NodePath {
    return this._registry.decode(id);
  }

  walk(): GraphCursor {
    return new GraphCursor(this, this._root!);
  }

  /**
   * @returns Serialized graph nodes and edges.
   */
  serialize() {
    const nodes = Array.from(
      this._nodes.values().map((n) => ({
        ...n,
        path: this.path(n.id),
        at:
          "name" in n.at
            ? {
                name: n.at.name,
                external: n.at.external ?? false,
              }
            : {
                byte: `${n.at.startIndex}:${n.at.endIndex}`,
                line: `L${n.at.startPosition.row}:L${n.at.endPosition.row}`,
              },
      })),
    );
    const edges = [];

    for (const [from, toMap] of this._edges) {
      for (const [to, kinds] of toMap) {
        for (const kind of kinds) {
          const props = this._edgeProps.get(from)?.get(to)?.get(kind);
          edges.push({
            from,
            fromPath: this._registry.decode(from),
            to,
            toPath: this._registry.decode(to),
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

  private _adjacent(
    id: NodeId,
  ): Map<NodeId, Set<Graph.Edge["kind"]>> | undefined {
    return this._edges.get(id);
  }

  /**
   * Sets the properties of the given edge.
   */
  private _setEdgeProperties(
    from: NodeId,
    to: NodeId,
    kind: Graph.Edge["kind"],
    props: E["props"],
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

export default Graph;
