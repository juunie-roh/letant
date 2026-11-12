import type { NodePath } from "@/common/branded-types";
import { isNodeSource } from "@/common/branded-types";
import { defined } from "@/common/defined";
import type { Node, Offset } from "@/models";

import TreeError from "./error";
import type Tree from "./tree";

/**
 * A lightweight immutable cursor instance.
 */
class TreeCursor {
  private readonly _tree: Tree;
  private readonly _path: NodePath;

  constructor(tree: Tree, path: NodePath) {
    this._tree = tree;
    this._path = path;
  }

  /**
   * Get tree cursor instance at given {@link Offset | offset}.
   *
   * Descends over scope-bearing nodes only: a binding offers no space to
   * traverse or resolve within, so the entry is always the innermost
   * enclosing scope.
   *
   * @param tree A tree where to find cursor instance.
   * @param offset An offset to locate cursor within the given tree.
   * @returns The innermost scope cursor containing the given offset.
   */
  static at(tree: Tree, offset: Offset): TreeCursor {
    let cursor = tree.walk();
    let next: TreeCursor | undefined;
    while (
      (next = cursor
        .children()
        .find(
          (cursor) =>
            cursor.node.type !== "binding" &&
            TreeCursor.contains(cursor, offset),
        ))
    ) {
      cursor = next;
    }

    return cursor;
  }

  /**
   * Test whether a {@link TreeCursor | cursor}'s range contains the given {@link Offset | offset}.
   *
   * @param cursor A cursor to test for containment.
   * @param offset An offset to test for containment.
   * @returns Whether the cursor contains the given offset.
   */
  static contains(cursor: TreeCursor, offset: Offset): boolean {
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
    const n = this._tree.getNode(this._path);
    defined(
      n,
      new TreeError(
        "TREE_NO_NODE",
        `Failed to get node at path: ${this._path}`,
      ),
    );
    return n;
  }

  get path(): NodePath {
    return this._path;
  }

  get depth(): number {
    return this._tree.depth(this._path);
  }

  get name(): string {
    return this._path[this._path.length - 1];
  }

  get root(): string {
    return this._tree.root;
  }

  parent(): TreeCursor | undefined {
    const parentPath = this._tree.parent(this._path);
    return parentPath ? new TreeCursor(this._tree, parentPath) : undefined;
  }

  /**
   * Direct children of the current node, optionally filtered by node
   * {@link Node.type | type} (`"scope"`, `"anonymous"`, or `"binding"`).
   */
  children(type?: Node["type"]): TreeCursor[] {
    const cursors: TreeCursor[] = [];

    for (const childPath of this._tree.children(this._path)) {
      const cursor = new TreeCursor(this._tree, childPath);
      if (type && cursor.node.type !== type) continue;
      cursors.push(cursor);
    }

    return cursors;
  }

  /**
   * Find the closest ancestor of the current node that satisfies the given predicate.
   */
  closest(predicate: (cursor: TreeCursor) => boolean): TreeCursor | undefined {
    let c: TreeCursor | undefined = this;

    while (c) {
      if (predicate(c)) return c;
      c = c.parent();
    }

    return undefined;
  }

  /**
   * Find the closest node from ancestors of the current node having the given symbol as its name.
   *
   * Once the walk has left a {@link Node.barrier | barrier} scope, a binding
   * of `"local"` {@link Node.visibility | visibility} is passed over.
   * @see {@link https://github.com/juunie-roh/letant/blob/main/docs/architecture/decisions/0007-lookup-barriers-and-unsupported-references.md ADR-0007}
   */
  resolve(symbol: string): TreeCursor | undefined {
    let scope: TreeCursor | undefined = this;
    let crossed = false;

    while (scope) {
      const found = scope
        .children()
        .find(
          (child) =>
            child.name === symbol &&
            !(crossed && child.node.visibility === "local"),
        );
      if (found) return found;

      crossed ||= scope.node.barrier === true;
      scope = scope.parent();
    }

    return undefined;
  }

  toString(): string {
    const str = isNodeSource(this.node.at)
      ? `(${this.node.at})`
      : `(${this.root}:${this.node.at.startPosition.row + 1}:${this.node.at.startPosition.column + 1})`;
    return str;
  }
}

export default TreeCursor;
