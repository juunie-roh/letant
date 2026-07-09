import { readFileSync } from "node:fs";
import path from "node:path";
import { cwd } from "node:process";

import { describe, expect, it } from "vitest";

import { isNodeSource } from "@/common/branded-types";
import { TreeCursor } from "@/core";
import type { Config } from "@/models";

import Workspace from "./workspace";

// Exercises the real parse pipeline end-to-end: config → plugin load →
// tree-sitter parse → extract → import path resolution → serialized graph.
// The fixture covers every import specifier kind: relative (with and
// without extension), matched alias, unmatched alias, escaping the root,
// and bare. Requires `@letant/js` to be built (`pnpm build:all`).
const FIXTURE_ROOT = "src/__mocks__/workspace-fixture";

const config: Config = {
  rootDir: FIXTURE_ROOT,
  plugins: [
    {
      name: path.resolve(cwd(), "packages/js/dist/index.mjs"),
      extensions: [".js", ".mjs"],
      paths: {
        "@u/*": ["./lib/*"],
        "#missing/*": ["./nowhere/*"],
      },
    },
  ],
};

describe("Workspace", () => {
  it("parses a source file into a stable serialized graph", async () => {
    const workspace = await Workspace.create(config);
    const source = readFileSync(
      path.resolve(cwd(), FIXTURE_ROOT, "main.js"),
      "utf-8",
    );

    const { tree: graph, ext } = workspace.openSource("main.js", source);

    expect(ext).toBe(".js");
    expect(workspace.has("main.js")).toBe(true);

    // capture order is not part of the contract — sort for a stable
    // snapshot, and remap the capture-order-minted ids to sorted order
    const { nodes } = graph.serialize();
    nodes.sort((x, y) => x.path.join("\0").localeCompare(y.path.join("\0")));

    const remap = new Map(nodes.map((n, index) => [n.id, index]));
    const normalized = nodes.map((n) => ({
      ...n,
      id: remap.get(n.id),
      children: n.children
        .map((child) => remap.get(child)!)
        .sort((a, b) => a - b),
    }));

    expect({ nodes: normalized }).toMatchSnapshot();
  });

  describe("origin()", () => {
    const source = readFileSync(
      path.resolve(cwd(), FIXTURE_ROOT, "main.js"),
      "utf-8",
    );

    const open = async () => {
      const workspace = await Workspace.create(config);
      workspace.openSource("main.js", source);
      return workspace;
    };

    it("returns a cursor at a local declaration", async () => {
      const workspace = await open();
      const result = workspace.origin("main.js", source.indexOf("z ="));

      expect(result).toBeInstanceOf(TreeCursor);
      expect((result as TreeCursor).path).toEqual(["main.js", "z"]);
    });

    it("stops at the frontier when the source file is not opened", async () => {
      const workspace = await open();
      const result = workspace.origin("main.js", source.indexOf("a + b"));

      expect(result).toBe("a.js");
    });

    it("auto-follows into an already-opened source file", async () => {
      const workspace = await open();
      await workspace.openFile("a.js");

      const result = workspace.origin("main.js", source.indexOf("a + b"));

      expect(result).toBeInstanceOf(TreeCursor);
      const cursor = result as TreeCursor;
      expect(cursor.root).toBe("a.js");
      expect(cursor.path).toEqual(["a.js", "a"]);
      expect(isNodeSource(cursor.node.at)).toBe(false);
    });

    it("returns the specifier for an external module", async () => {
      const workspace = await open();
      const result = workspace.origin("main.js", source.indexOf("fs;"));

      expect(result).toBe("node:fs");
    });

    it("returns undefined for an unresolvable position", async () => {
      const workspace = await open();
      // offset 0 sits on the `import` keyword, not a name
      expect(workspace.origin("main.js", 0)).toBeUndefined();
    });
  });

  describe("at()", () => {
    it("returns the innermost scope containing the offset", async () => {
      const workspace = await Workspace.create(config);
      const source = readFileSync(
        path.resolve(cwd(), FIXTURE_ROOT, "main.js"),
        "utf-8",
      );
      workspace.openSource("main.js", source);

      // offset 0 sits on the `import` keyword — inside no ranged binding
      const root = workspace.at("main.js", 0);
      expect(root.depth).toBe(0);
      expect(root.children().map((c) => c.name)).toContain("z");

      // bindings offer no traversal space — descent lands on the enclosing scope
      const scope = workspace.at("main.js", source.indexOf("z ="));
      expect(scope.depth).toBe(0);
    });
  });

  it("lists top-level names for each opened file", async () => {
    const workspace = await Workspace.create(config);
    const source = readFileSync(
      path.resolve(cwd(), FIXTURE_ROOT, "main.js"),
      "utf-8",
    );
    workspace.openSource("main.js", source);

    expect(workspace.topLevelNames()).toEqual(
      new Map([["main.js", ["a", "b", "c", "fs", "m", "out", "z"]]]),
    );
  });
});
