import { readFileSync } from "node:fs";
import path from "node:path";
import { cwd } from "node:process";

import type { Config } from "letant";
import { TreeCursor } from "letant";
import { Workspace } from "letant";
import { isNodeSource } from "letant/utils";
import { describe, expect, it } from "vitest";

// Exercises the pipeline against the Python plugin — the language-agnostic
// proof: Python has no block scope (bindings inside `if`/`for` attach to
// the enclosing scope), methods are plain function definitions, and import
// specifiers are dotted module references, not file paths.
// Requires `@letant/python` to be built (`pnpm build:all`).
const FIXTURE_ROOT = "packages/python/__mocks__/fixture";

const config: Config = {
  rootDir: FIXTURE_ROOT,
  plugins: [
    {
      name: path.resolve(cwd(), "packages/python/dist/index.mjs"),
      extensions: [".py"],
    },
  ],
};

const source = readFileSync(
  path.resolve(cwd(), FIXTURE_ROOT, "main.py"),
  "utf-8",
);

const open = async () => {
  const workspace = await Workspace.create(config);
  workspace.openSource("main.py", source);
  return workspace;
};

describe("Workspace (python)", () => {
  it("parses a source file into a stable serialized tree", async () => {
    const workspace = await open();
    const { tree } = workspace.get("main.py");

    const { nodes } = tree.serialize();
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

  it("attaches bindings inside compound statements to the enclosing scope", async () => {
    const workspace = await open();

    // `flag` is assigned inside a module-level `if` — Python has no block
    // scope, so it is a top-level name
    expect(workspace.topLevelNames().get("main.py")).toEqual([
      "Greeter",
      "alpha",
      "beta",
      "flag",
      "greet",
      "np",
      "os",
      "value",
    ]);
  });

  describe("origin()", () => {
    it("stops at the frontier for an unopened relative import", async () => {
      const workspace = await open();
      const result = workspace.origin("main.py", source.indexOf("alpha)"));

      expect(result).toBe("a.py");
    });

    it("auto-follows into an already-opened source file", async () => {
      const workspace = await open();
      await workspace.openFile("a.py");

      const result = workspace.origin("main.py", source.indexOf("alpha)"));

      expect(result).toBeInstanceOf(TreeCursor);
      const cursor = result as TreeCursor;
      expect(cursor.root).toBe("a.py");
      expect(cursor.path).toEqual(["a.py", "alpha"]);
      expect(isNodeSource(cursor.node.at)).toBe(false);
    });

    it("returns the dotted specifier for an external module", async () => {
      const workspace = await open();
      const result = workspace.origin("main.py", source.indexOf("np"));

      expect(result).toBe("numpy");
    });

    it("resolves a local declaration through a function scope", async () => {
      const workspace = await open();
      // `name` inside greet's body resolves to the parameter
      const result = workspace.origin(
        "main.py",
        source.indexOf("name + punct"),
      );

      expect(result).toBeInstanceOf(TreeCursor);
      expect((result as TreeCursor).path).toEqual(["main.py", "greet", "name"]);
    });
  });
});
