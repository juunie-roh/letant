import { readFileSync } from "node:fs";
import path from "node:path";

import type { Config } from "letant";
import { TreeCursor } from "letant";
import { Workspace } from "letant";
import { describe, expect, it } from "vitest";

// Exercises the pipeline against the Go plugin: every block is a scope, a
// name declared in a function is visible from a point in its block, and an
// import names a package, not a file.
// Requires `@letant/go` to be built (`pnpm build:all`).
const FIXTURE_ROOT = path.resolve(__dirname, "../__mocks__/fixture");

const config: Config = {
  rootDir: FIXTURE_ROOT,
  plugins: [
    {
      name: path.resolve(__dirname, "../dist/index.mjs"),
      extensions: [".go"],
    },
  ],
};

const source = readFileSync(path.resolve(FIXTURE_ROOT, "main.go"), "utf-8");

const open = async () => {
  const workspace = await Workspace.create(config);
  workspace.openSource("main.go", source);
  return workspace;
};

describe("Workspace (go)", () => {
  it("parses a source file into a stable serialized tree", async () => {
    const workspace = await open();
    const { tree } = workspace.get("main.go");

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

  it("lists the names of the package block and the named import", async () => {
    const workspace = await open();

    // a method (`Greet`) is not a name of the package block, and the import
    // of "fmt" has no name the file spells
    expect(workspace.topLevelNames().get("main.go")).toEqual([
      "Greeter",
      "Map",
      "greeting",
      "main",
      "str",
    ]);
  });

  describe("origin()", () => {
    it("answers a named import with its path", async () => {
      const workspace = await open();
      const result = workspace.origin("main.go", source.indexOf("str.ToUpper"));

      expect(result).toBe("strings");
    });

    it("declines the name of an import without one", async () => {
      const workspace = await open();
      const result = workspace.origin("main.go", source.indexOf("fmt.Println"));

      expect(result).toEqual({
        unsupported: expect.stringContaining("import"),
      });
    });

    it("resolves a declaration through the scopes of a function", async () => {
      const workspace = await open();
      // `msg` in the call resolves to the `if` statement's initializer
      const result = workspace.origin(
        "main.go",
        source.indexOf("msg, version"),
      );

      expect(result).toBeInstanceOf(TreeCursor);
      expect((result as TreeCursor).path).toEqual([
        "main.go",
        `main@${source.indexOf("func main")}`,
        `if@${source.indexOf("if msg")}`,
        "msg",
      ]);
    });

    it("resolves a type parameter inside a function type", async () => {
      const workspace = await open();
      const result = workspace.origin("main.go", source.indexOf("T) U"));

      expect(result).toBeInstanceOf(TreeCursor);
      expect((result as TreeCursor).path).toEqual([
        "main.go",
        `Map@${source.indexOf("func Map")}`,
        "T",
      ]);
    });

    it("does not reach a name declared in another file of the package", async () => {
      const workspace = await open();
      await workspace.openFile("version.go");
      // the package block spans both files; a tree holds one (SCOPING.md G3)
      const result = workspace.origin("main.go", source.indexOf("version)"));

      expect(result).toBeUndefined();
    });
  });
});
