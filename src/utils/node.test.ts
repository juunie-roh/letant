import type Parser from "tree-sitter";
import { describe, expect, it } from "vitest";

import { ancestors, getRange, isField } from "./node";

type Fake = {
  id: number;
  parent: Fake | null;
  startIndex: number;
  endIndex: number;
  startPosition: Parser.Point;
  endPosition: Parser.Point;
  fields: Record<string, Fake>;
  childForFieldName(name: string): Fake | null;
};

let ids = 0;
function fake(start: number, end: number, parent: Fake | null = null): Fake {
  return {
    id: ids++,
    parent,
    startIndex: start,
    endIndex: end,
    startPosition: { row: 0, column: start },
    endPosition: { row: 0, column: end },
    fields: {},
    childForFieldName(name) {
      return this.fields[name] ?? null;
    },
  };
}
const node = (n: Fake) => n as unknown as Parser.SyntaxNode;

const root = fake(0, 30);
const fn = fake(0, 20, root);
const parameters = fake(8, 12, fn);
const body = fake(13, 20, fn);
const leaf = fake(15, 16, body);
fn.fields = { parameters, body };

describe("getRange()", () => {
  it("gives the range of a node", () => {
    expect(getRange(node(fn))).toEqual({
      startIndex: 0,
      endIndex: 20,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 20 },
    });
  });

  it("runs from the start of one node to the end of another", () => {
    expect(getRange(node(parameters), node(fn))).toEqual({
      startIndex: 8,
      endIndex: 20,
      startPosition: { row: 0, column: 8 },
      endPosition: { row: 0, column: 20 },
    });
  });
});

describe("ancestors()", () => {
  it("yields each parent with the child the walk came from, up to the root", () => {
    expect([...ancestors(node(leaf))]).toEqual([
      [body, leaf],
      [fn, body],
      [root, fn],
    ]);
  });

  it("yields nothing for the root", () => {
    expect([...ancestors(node(root))]).toEqual([]);
  });
});

describe("isField()", () => {
  it("is true for the node in the field", () => {
    expect(isField(node(fn), "body", node(body))).toBe(true);
  });

  it("is false for another child, and for a field the parent lacks", () => {
    expect(isField(node(fn), "body", node(parameters))).toBe(false);
    expect(isField(node(fn), "name", node(body))).toBe(false);
  });
});
