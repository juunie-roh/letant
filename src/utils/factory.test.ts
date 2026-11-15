import type Parser from "tree-sitter";
import { describe, expect, it, vi } from "vitest";

import { NodePath } from "@/common/branded-types";

import { createChildPath, createReferences } from "./factory";

describe("createChildPath()", () => {
  it("appends a segment without changing the parent", () => {
    const parent = NodePath(["a.js", "f@0"]);
    expect(createChildPath(parent, "x")).toEqual(["a.js", "f@0", "x"]);
    expect(parent).toEqual(["a.js", "f@0"]);
  });
});

describe("createReferences()", () => {
  const a = { text: "a" } as Parser.SyntaxNode;
  const b = { text: "b" } as Parser.SyntaxNode;
  const captures = vi.fn(() => [{ node: a }, { node: b }]);
  const query = { captures } as unknown as Parser.Query;

  it("captures within the range of the node it is given", () => {
    const within = { startIndex: 4, endIndex: 9 } as Parser.SyntaxNode;
    createReferences(query, () => true)(within);
    expect(captures).toHaveBeenCalledWith(within, {
      startIndex: 4,
      endIndex: 9,
    });
  });

  it("keeps the captured nodes isReference accepts", () => {
    const references = createReferences(query, (node) => node.text === "b");
    expect(references({} as Parser.SyntaxNode)).toEqual([b]);
  });
});
