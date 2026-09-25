import path from "node:path";
import { cwd } from "node:process";

import type { Config } from "letant";
import { Workspace } from "letant";
import { describe, expect, it } from "vitest";

// A scope node's `at` is the interval position lookup descends through, so it
// must cover exactly the region where that scope's names are visible. The head
// of a construct — an `if` / `while` / `do` condition, a `switch` discriminant —
// is evaluated in the *enclosing* scope, and an `else` clause is a sibling of
// the consequence rather than part of it. Requires `@letant/js` to be built.
const config: Config = {
  rootDir: "packages/js/__mocks__/fixture",
  plugins: [
    {
      name: path.resolve(cwd(), "packages/js/dist/index.mjs"),
      extensions: [".js"],
    },
  ],
};

/**
 * Resolve the identifier `name` at its first occurrence inside `needle`, and
 * return the source text of the declaration it resolves to.
 */
async function declarationFor(source: string, needle: string, name: string) {
  const workspace = await Workspace.create(config);
  workspace.openSource("scope.js", source);

  const offset = source.indexOf(needle) + needle.indexOf(name);
  const resolved = workspace.origin("scope.js", offset);

  if (resolved === undefined || typeof resolved === "string") return resolved;

  const { at } = resolved.node;
  if (typeof at === "string") return at;

  return source.slice(at.startIndex, at.endIndex);
}

describe("resolution against scope boundaries", () => {
  it("resolves an if condition in the enclosing scope", async () => {
    const source = [
      'const x = "outer";',
      "if ( x ) {",
      '  const x = "inner";',
      "}",
    ].join("\n");

    expect(await declarationFor(source, "if ( x )", "x")).toBe(
      'const x = "outer";',
    );
  });

  it("resolves a declaration inside an else branch", async () => {
    const source = [
      'const x = "outer";',
      "if ( flag ) {",
      "  noop();",
      "} else {",
      '  const x = "inner";',
      "  use( x );",
      "}",
    ].join("\n");

    expect(await declarationFor(source, "use( x )", "x")).toBe(
      'const x = "inner";',
    );
  });

  it("resolves a while condition in the enclosing scope", async () => {
    const source = [
      'const x = "outer";',
      "while ( x ) {",
      '  const x = "inner";',
      "}",
    ].join("\n");

    expect(await declarationFor(source, "while ( x )", "x")).toBe(
      'const x = "outer";',
    );
  });

  it("resolves a do-while condition in the enclosing scope", async () => {
    const source = [
      'const x = "outer";',
      "do {",
      '  const x = "inner";',
      "} while ( x );",
    ].join("\n");

    expect(await declarationFor(source, "while ( x )", "x")).toBe(
      'const x = "outer";',
    );
  });

  it("resolves a switch discriminant in the enclosing scope", async () => {
    const source = [
      'const x = "outer";',
      "switch ( x ) {",
      "  case 1: {",
      '    const x = "inner";',
      "    use( x );",
      "  }",
      "}",
    ].join("\n");

    expect(await declarationFor(source, "switch ( x )", "x")).toBe(
      'const x = "outer";',
    );
  });

  it("resolves a switch discriminant past an unbraced case", async () => {
    const source = [
      'const x = "outer";',
      "switch ( x ) {",
      "  case 1:",
      '    let x = "inner";',
      "    use( x );",
      "}",
    ].join("\n");

    expect(await declarationFor(source, "switch ( x )", "x")).toBe(
      'const x = "outer";',
    );
  });

  it("resolves an IIFE argument in the enclosing scope", async () => {
    const source = [
      'const x = "outer";',
      '( function () { const x = "inner"; } )( x );',
    ].join("\n");

    expect(await declarationFor(source, ")( x )", "x")).toBe(
      'const x = "outer";',
    );
  });

  // the head of a `for` *is* part of the loop scope — guard against
  // over-narrowing it along with the constructs above
  it("resolves a for condition against the loop's own binding", async () => {
    const source = [
      'const i = "outer";',
      "for ( let i = 0; i < 1; i ++ ) {",
      "  use( i );",
      "}",
    ].join("\n");

    expect(await declarationFor(source, "i < 1", "i")).toBe("let i = 0;");
  });
});
