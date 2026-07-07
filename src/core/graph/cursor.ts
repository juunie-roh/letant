import type { NodePath } from "@/common/branded-types";
import { isNodeSource } from "@/common/branded-types";
import { defined } from "@/common/defined";
import type { Node, Offset } from "@/models";

import GraphError from "./error";
import type Graph from "./graph";

/**
 * A lightweight immutable cursor instance.
 */
class GraphCursor {
  private readonly _graph: Graph;
  private readonly _path: NodePath;

  constructor(graph: Graph, path: NodePath) {
    this._graph = graph;
    this._path = path;
  }

  /**
   * Get graph cursor instance at given {@link Offset | offset}.
   *
   * Descends over scope-bearing nodes only: a binding offers no space to
   * traverse or resolve within, so the entry is always the innermost
   * enclosing scope.
   *
   * @param graph A graph where to find cursor instance.
   * @param offset An offset to locate cursor within the given graph.
   * @returns The innermost scope cursor containing the given offset.
   */
  static at(graph: Graph, offset: Offset): GraphCursor {
    let cursor = graph.walk();
    let next: GraphCursor | undefined;
    while (
      (next = cursor
        .children()
        .find(
          (cursor) =>
            cursor.node.type !== "binding" &&
            GraphCursor.contains(cursor, offset),
        ))
    ) {
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
    if (isNodeSource(cursor.node.at)) return false;
    // if the offset is byte offset:
    if (typeof offset === "number") {
      const { startIndex, endIndex } = cursor.node.at;
      // @see https://github.com/tree-sitter/blob/master/lib/include/tree_sitter/api.h#L120
      return startIndex <= offset && endIndex > offset;
    }

    const { startPosition, endPosition } = cursor.node.at;
    const startsBeforeOrAt =
      startPosition.row < offset.row ||
      (startPosition.row === offset.row &&
        startPosition.column <= offset.column);

    const endsAfterOrAt =
      endPosition.row > offset.row ||
      (endPosition.row === offset.row && endPosition.column > offset.column);

    return startsBeforeOrAt && endsAfterOrAt;
  }

  get node(): Node {
    const n = this._graph.getNode(this._path);
    defined(
      n,
      new GraphError(
        "GRAPH_NO_NODE",
        `Failed to get node at path: ${this._path}`,
      ),
    );
    return n;
  }

  get path(): NodePath {
    return this._path;
  }

  get depth(): number {
    return this._graph.depth(this._path);
  }

  get name(): string {
    return this._path[this._path.length - 1];
  }

  get root(): string {
    return this._graph.root;
  }

  parent(): GraphCursor | undefined {
    const parentPath = this._graph.parent(this._path);
    return parentPath ? new GraphCursor(this._graph, parentPath) : undefined;
  }

  children(edgeKind?: string): GraphCursor[] {
    const cursors: GraphCursor[] = [];

    this._graph.adjacent(this._path)?.forEach((kinds, childPath) => {
      if (edgeKind && !kinds.has(edgeKind)) return;
      cursors.push(new GraphCursor(this._graph, childPath));
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

  toString(): string {
    const str = isNodeSource(this.node.at)
      ? `(${this.node.at})`
      : `(${this.root}:${this.node.at.startPosition.row + 1}:${this.node.at.startPosition.column + 1})`;
    return str;
  }
}

export default GraphCursor;
