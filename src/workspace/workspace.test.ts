import { readFileSync } from "node:fs";
import path from "node:path";
import { cwd } from "node:process";

import { describe, expect, it } from "vitest";

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

    const { graph, ext } = workspace.openSource("main.js", source);

    expect(ext).toBe(".js");
    expect(workspace.has("main.js")).toBe(true);

    // capture order is not part of the contract — sort for a stable snapshot
    const { nodes, edges } = graph.serialize();
    nodes.sort((x, y) => x.path.join("\0").localeCompare(y.path.join("\0")));
    edges.sort((x, y) =>
      `${x.from.join("\0")} ${x.to.join("\0")} ${x.kind}`.localeCompare(
        `${y.from.join("\0")} ${y.to.join("\0")} ${y.kind}`,
      ),
    );

    expect({ nodes, edges }).toMatchSnapshot();
  });
});
