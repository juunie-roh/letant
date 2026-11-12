import { beforeEach, describe, expect, it, vi } from "vitest";

import { NodePath, NodeSource } from "@/common/branded-types";
import { PluginHandler, Tree, TreeCursor } from "@/core";

import Workspace from "./workspace";

const range = (start: number, end: number) => ({
  startIndex: start,
  endIndex: end,
  startPosition: { row: 0, column: start },
  endPosition: { row: 0, column: end },
});

// One syntax node per offset: what the plugin says about the position there.
const syntax = [
  { id: 0, text: "local", reference: true },
  { id: 1, text: "imported", reference: true },
  { id: 2, text: "missing", reference: true },
  { id: 3, text: "local", reference: false },
  { id: 4, text: "local", reference: true, unsupported: "a rule" },
  { id: 5, text: "written", reference: true, name: "local" },
];

const tree = new Tree(
  [
    {
      path: NodePath(["a.x"]),
      kind: "module",
      type: "scope",
      blockStartIndex: 0,
      at: NodeSource("a.x"),
    },
    {
      path: NodePath(["a.x", "local"]),
      kind: "variable",
      type: "binding",
      at: range(10, 15),
    },
    {
      path: NodePath(["a.x", "imported"]),
      kind: "module",
      type: "binding",
      at: NodeSource("b.x"),
    },
  ],
  "a.x",
);

const handler = {
  parse: () => ({
    tree,
    tsTree: { rootNode: { descendantForIndex: (o: number) => syntax[o] } },
    ext: ".x",
  }),
  references: (node: (typeof syntax)[number]) => (node.reference ? [node] : []),
  nameOf: (node: (typeof syntax)[number]) => node.name ?? node.text,
  unsupported: (node: (typeof syntax)[number]) => node.unsupported,
};

describe("Workspace.origin()", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    vi.spyOn(PluginHandler, "create").mockResolvedValue(
      handler as unknown as PluginHandler,
    );
    workspace = await Workspace.create({ rootDir: ".", plugins: [] });
    workspace.openSource("a.x", "");
  });

  it("answers with a cursor at the declaration", () => {
    const result = workspace.origin("a.x", 0);
    expect(result).toBeInstanceOf(TreeCursor);
    expect((result as TreeCursor).path).toEqual(["a.x", "local"]);
  });

  it("answers with the source of an import whose file is not open", () => {
    expect(workspace.origin("a.x", 1)).toBe("b.x");
  });

  it("answers nothing for a name no scope binds", () => {
    expect(workspace.origin("a.x", 2)).toBeUndefined();
  });

  it("answers nothing for a position that is not a reference", () => {
    expect(workspace.origin("a.x", 3)).toBeUndefined();
  });

  it("looks up the name the plugin gives for the reference, not its text", () => {
    const result = workspace.origin("a.x", 5);
    expect((result as TreeCursor).path).toEqual(["a.x", "local"]);
  });

  it("answers unsupported, with the plugin's reason, instead of resolving", () => {
    expect(workspace.origin("a.x", 4)).toEqual({ unsupported: "a rule" });
  });
});
