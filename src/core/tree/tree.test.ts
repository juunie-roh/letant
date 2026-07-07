import { beforeEach, describe, expect, it } from "vitest";

import { NodePath, NodeSource } from "@/common/branded-types";
import type { Node } from "@/models";

import Tree from "./tree";

const makeRange = (start: number, end: number) => ({
  startIndex: start,
  endIndex: end,
  startPosition: { row: 0, column: start },
  endPosition: { row: 0, column: end },
});

const scope = (path: string[], kind = "class"): Node => ({
  path: NodePath(path),
  kind,
  type: "scope",
  blockStartIndex: 0,
  at: makeRange(0, 100),
});

const binding = (path: string[], kind = "variable"): Node => ({
  path: NodePath(path),
  kind,
  type: "binding",
  at: makeRange(10, 20),
});

const anonymous = (path: string[]): Node => ({
  path: NodePath(path),
  kind: "if",
  type: "anonymous",
  blockStartIndex: 0,
  at: makeRange(30, 40),
});

describe("Tree", () => {
  let tree: Tree;

  beforeEach(() => {
    tree = new Tree(
      [
        {
          path: NodePath(["file.ts"]),
          kind: "module",
          type: "scope",
          blockStartIndex: 0,
          at: NodeSource("file.ts"),
        },
        scope(["file.ts", "Foo"]),
        binding(["file.ts", "x"]),
        anonymous(["file.ts", "if#0"]),
        binding(["file.ts", "Foo", "y"], "member"),
      ],
      "file.ts",
    );
  });

  describe("id()", () => {
    it("mints a distinct integer id per path", () => {
      const a = tree.id(NodePath(["file.ts"]));
      const b = tree.id(NodePath(["file.ts", "Foo"]));

      expect(Number.isInteger(a)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
      expect(a).not.toBe(b);
    });

    it("returns the same id for the same path", () => {
      expect(tree.id(NodePath(["file.ts", "Foo"]))).toBe(
        tree.id(NodePath(["file.ts", "Foo"])),
      );
    });

    it("returns undefined for an unregistered path", () => {
      expect(tree.id(NodePath(["ghost"]))).toBeUndefined();
    });

    it("keeps the id stable when a scope replaces a binding at the same path", () => {
      const path = NodePath(["file.ts", "x"]);
      const before = tree.id(path);

      tree.addNode(scope(["file.ts", "x"], "function"));

      expect(tree.id(path)).toBe(before);
      expect(tree.getNode(path)?.type).toBe("scope");
    });
  });

  describe("path interning", () => {
    it("does not collide on segments containing the NUL character", () => {
      tree.addNode(binding(["file.ts", "a\0b"]));

      expect(tree.getNode(NodePath(["file.ts", "a\0b"]))).toBeDefined();
      expect(tree.getNode(NodePath(["file.ts", "a", "b"]))).toBeUndefined();
    });
  });

  describe("addNode()", () => {
    it("keeps the first node when neither is a scope", () => {
      tree.addNode(binding(["file.ts", "x"], "parameter"));
      expect(tree.getNode(NodePath(["file.ts", "x"]))?.kind).toBe("variable");
    });

    it("does not duplicate the parent attachment on replacement", () => {
      tree.addNode(scope(["file.ts", "x"], "function"));
      expect(tree.children(NodePath(["file.ts"]))).toHaveLength(3);
    });

    it("attaches children regardless of insertion order", () => {
      // plugins emit the root module last — children intern their parent first
      const g = new Tree(
        [
          binding(["f.ts", "Foo", "y"], "member"),
          scope(["f.ts", "Foo"]),
          {
            path: NodePath(["f.ts"]),
            kind: "module",
            type: "scope",
            blockStartIndex: 0,
            at: NodeSource("f.ts"),
          },
        ],
        "f.ts",
      );

      expect(g.children(NodePath(["f.ts"])).map((p) => [...p])).toEqual([
        ["f.ts", "Foo"],
      ]);
      expect(g.children(NodePath(["f.ts", "Foo"])).map((p) => [...p])).toEqual([
        ["f.ts", "Foo", "y"],
      ]);
    });
  });

  describe("children()", () => {
    it("returns direct children paths in insertion order", () => {
      expect(tree.children(NodePath(["file.ts"])).map((p) => [...p])).toEqual([
        ["file.ts", "Foo"],
        ["file.ts", "x"],
        ["file.ts", "if#0"],
      ]);
    });

    it("does not include deeper descendants", () => {
      const children = tree.children(NodePath(["file.ts"]));
      expect(children.map((p) => p.length)).toEqual([2, 2, 2]);
    });

    it("returns empty for a leaf node", () => {
      expect(tree.children(NodePath(["file.ts", "x"]))).toEqual([]);
    });

    it("returns empty for an unregistered path", () => {
      expect(tree.children(NodePath(["ghost"]))).toEqual([]);
    });
  });

  describe("parent()", () => {
    it("returns the parent path for a nested node", () => {
      expect(tree.parent(NodePath(["file.ts", "Foo", "y"]))).toEqual([
        "file.ts",
        "Foo",
      ]);
    });

    it("returns undefined for the root", () => {
      expect(tree.parent(NodePath(["file.ts"]))).toBeUndefined();
    });

    it("returns undefined when the parent path is not registered", () => {
      expect(tree.parent(NodePath(["ghost", "child"]))).toBeUndefined();
    });
  });

  describe("removeNode()", () => {
    it("removes the node, its id, and detaches it from its parent", () => {
      const path = NodePath(["file.ts", "Foo"]);
      tree.removeNode(scope(["file.ts", "Foo"]));

      expect(tree.getNode(path)).toBeUndefined();
      expect(tree.id(path)).toBeUndefined();
      expect(tree.children(NodePath(["file.ts"]))).toHaveLength(2);
    });
  });

  describe("topLevelNames()", () => {
    it("lists sorted non-anonymous names directly under the root", () => {
      expect(tree.topLevelNames()).toEqual(["Foo", "x"]);
    });

    it("excludes nested nodes", () => {
      expect(tree.topLevelNames()).not.toContain("y");
    });
  });

  describe("walk()", () => {
    it("returns a cursor at the root path", () => {
      expect(tree.walk().path).toEqual(["file.ts"]);
    });
  });
});
