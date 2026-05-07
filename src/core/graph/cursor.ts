import { defined } from "@/common/defined";
import Logger from "@/common/logger";
import type { NodeId, NodePath, Offset } from "@/models";

import GraphError from "./error";
import type Graph from "./graph";

/**
 * A lightweight immutable cursor instance.
 */
class GraphCursor {
  private readonly _graph: Graph;
  private readonly _id: NodeId;

  constructor(graph: Graph, id: NodeId) {
    this._graph = graph;
    this._id = id;
  }

  /**
   * Get graph cursor instance at given {@link Offset | offset}.
   */
  static at(graph: Graph, offset: Offset): GraphCursor {
    let cursor = graph.walk();
    let next: GraphCursor | undefined;
    while (
      (next = cursor
        .children()
        .find((cursor) => GraphCursor.contains(cursor, offset)))
    ) {
      Logger.get().debug(
        `Given offset: ${JSON.stringify(offset)}\n`,
        `       Next: ${next.name} at ${JSON.stringify(next.node.at)}`,
      );
      cursor = next;
    }

    return cursor;
  }

  /**
   * Test whether a {@link GraphCursor | cursor}'s range contains the given {@link Offset | offset}.
   *
   * @param cursor A cursor to test for containment.
   * @param offset An offset to test for containment.
   * @returns Whether the cursor contains the given offset.
   */
  static contains(cursor: GraphCursor, offset: Offset): boolean {
    // if the cursor is at an imported module:
    if ("name" in cursor.node.at) return false;
    // if the offset is byte offset:
    if (typeof offset === "number") {
      const { startIndex, endIndex } = cursor.node.at;
      return startIndex <= offset && endIndex >= offset;
    }

    const { startPosition, endPosition } = cursor.node.at;
    const startsBeforeOrAt =
      startPosition.row < offset.row ||
      (startPosition.row === offset.row &&
        startPosition.column <= offset.column);

    const endsAfterOrAt =
      endPosition.row > offset.row ||
      (endPosition.row === offset.row && endPosition.column >= offset.column);

    return startsBeforeOrAt && endsAfterOrAt;
  }

  get node(): Graph.Node {
    const n = this._graph.nodes.get(this._id);
    defined(
      n,
      new GraphError(
        "GRAPH_NO_NODE",
        `Failed to get node with id: ${this._id}`,
      ),
    );
    return n;
  }

  get path(): NodePath {
    return this._graph.path(this._id);
  }

  get depth(): number {
    return this._graph.depth(this._id);
  }

  get name(): string {
    return this.node.name;
  }

  parent(): GraphCursor | undefined {
    const parentId = this._graph.parent(this._id);
    return parentId ? new GraphCursor(this._graph, parentId) : undefined;
  }

  children(edgeKind?: string): GraphCursor[] {
    const cursors: GraphCursor[] = [];

    this._graph.adjacent(this._id)?.forEach((kinds, id) => {
      if (edgeKind && !kinds.has(edgeKind)) return;
      cursors.push(new GraphCursor(this._graph, id));
    });

    return cursors;
  }

  /**
   * Find the closest ancestor of the current node that satisfies the given predicate.
   */
  closest(
    predicate: (cursor: GraphCursor) => boolean,
  ): GraphCursor | undefined {
    let c: GraphCursor | undefined = this;

    while (c) {
      if (predicate(c)) return c;
      c = c.parent();
    }

    return undefined;
  }

  /**
   * Find the closest node from ancestors of the current node having the given symbol as its name.
   */
  resolve(symbol: string): GraphCursor | undefined {
    const scope = this.closest((c) =>
      c.children().some((child) => child.name === symbol),
    );
    // scope is the parent — you probably want the child
    return scope?.children().find((child) => child.name === symbol);
  }
}

export default GraphCursor;
