import path from "node:path";
import { cwd } from "node:process";

import type { Config } from "letant";
import { Workspace } from "letant";
import { describe, expect, it } from "vitest";

// Scoping rules are specified in packages/ts/SCOPING.md. Each source marks the
// position to resolve with ‹name› and the identifier it must land on with
// «name»; a source without «» must resolve to nothing. The value side follows
// packages/js/SCOPING.md and is covered there; the cases here are the rules
// TypeScript adds. Requires `@letant/ts` to be built.
const config: Config = {
  rootDir: "packages/ts",
  plugins: [
    {
      name: path.resolve(cwd(), "packages/ts/dist/index.mjs"),
      extensions: [".ts", ".tsx"],
    },
  ],
};

function parseMarks(marked: string) {
  let source = "";
  let last = 0;
  let declaration: number | undefined;
  let reference = -1;

  for (const match of marked.matchAll(/«([^»]*)»|‹([^›]*)›/g)) {
    source += marked.slice(last, match.index);
    if (match[1] !== undefined) declaration = source.length;
    else reference = source.length;
    source += match[1] ?? match[2];
    last = match.index + match[0].length;
  }

  return { source: source + marked.slice(last), declaration, reference };
}

async function origin(source: string, offset: number) {
  const workspace = await Workspace.create(config);
  workspace.openSource("scope.tsx", source);

  const resolved = workspace.origin("scope.tsx", offset);
  if (resolved === undefined || typeof resolved === "string") return resolved;
  if ("unsupported" in resolved) return resolved;

  const { at } = resolved.node;
  return typeof at === "string" ? at : at.startIndex;
}

async function expectOrigin(marked: string) {
  const { source, declaration, reference } = parseMarks(marked);
  expect(await origin(source, reference)).toBe(declaration);
}

async function expectFrontier(marked: string, specifier: string) {
  const { source, reference } = parseMarks(marked);
  expect(await origin(source, reference)).toBe(specifier);
}

async function expectUnsupported(marked: string) {
  const { source, reference } = parseMarks(marked);
  expect(await origin(source, reference)).toHaveProperty("unsupported");
}

describe("spaces", () => {
  it("resolves a type past a nearer value of the same name", () =>
    expectOrigin(`
      type «X» = string;
      function f() { const X = 1; let a: ‹X›; }
    `));

  it("resolves a value past a nearer type of the same name", () =>
    expectOrigin(`
      const «X» = 1;
      function f() { interface X { a: 1 } return ‹X›; }
    `));

  it("tells a type from a value of the same name in one scope", async () => {
    await expectOrigin(`interface «A» { a: 1 } const A = 1; let b: ‹A›;`);
    await expectOrigin(`interface A { a: 1 } const «A» = 1; use( ‹A› );`);
  });

  it("resolves a class as a value and as a type", async () => {
    await expectOrigin(`class «C» {} let c: ‹C›;`);
    await expectOrigin(`class «C» {} new ‹C›();`);
  });

  it("resolves an enum as a value, a type and a namespace", async () => {
    await expectOrigin(`enum «E» { A } use( ‹E›.A );`);
    await expectOrigin(`enum «E» { A } let e: ‹E›;`);
    await expectOrigin(`enum «E» { A } let e: ‹E›.A;`);
  });

  it("resolves the operand of typeof as a value", () =>
    expectOrigin(`
      const «x» = 1;
      type x = string;
      let y: typeof ‹x›;
    `));

  it("resolves the root of a qualified type name as a namespace", () =>
    expectOrigin(`
      namespace «N» { export type T = 1 }
      function f() { interface N { a: 1 } let a: ‹N›.T; }
    `));

  it("does not resolve the member of a qualified type name", () =>
    expectOrigin(`
      type T = 1;
      namespace N { export type T = 2 }
      let a: N.‹T›;
    `));

  it("passes a namespace that holds types only when a value is asked for", () =>
    expectOrigin(`
      const «M» = 1;
      namespace Outer {
        namespace M { export type T = 1 }
        export const v = ‹M›;
      }
    `));

  it("resolves a value to a namespace that holds one", () =>
    expectOrigin(`
      const M = 1;
      namespace Outer {
        namespace «M» { export const z = 1 }
        export const v = ‹M›;
      }
    `));

  it("resolves an exported name in whatever space it is bound", () =>
    expectOrigin(`
      interface «Shape» { a: 1 }
      export { ‹Shape› };
    `));
});

describe("type parameters", () => {
  it("resolves a function's type parameter in its signature and body", async () => {
    await expectOrigin(`type T = 1; function f<«T»>(a: ‹T›) {}`);
    await expectOrigin(
      `type T = 1; function f<«T»>(): ‹T› { return 1 as any }`,
    );
    await expectOrigin(`type T = 1; function f<«T»>() { let a: ‹T›; }`);
  });

  it("resolves a type parameter in a later parameter's constraint", () =>
    expectOrigin(`type T = 1; function f<«T», U extends ‹T›>() {}`));

  it("resolves a class's type parameter in a member and in the heritage", async () => {
    await expectOrigin(`type T = 1; class C<«T»> { p: ‹T› }`);
    await expectOrigin(
      `type T = 1; class B<X> {} class C<«T»> extends B<‹T›> {}`,
    );
  });

  it("resolves an interface's and a type alias's type parameter", async () => {
    await expectOrigin(`type T = 1; interface I<«T»> { p: ‹T› }`);
    await expectOrigin(`type T = 1; type A<«T»> = ‹T›[];`);
  });

  it("does not see a type parameter outside its declaration", () =>
    expectOrigin(`type «T» = 1; type A<T> = T[]; let a: ‹T›;`));

  it("resolves a signature's type parameter inside a type", async () => {
    await expectOrigin(`type T = 1; type F = <«T»>(a: ‹T›) => void;`);
    await expectOrigin(`type T = 1; type O = { m<«T»>(a: ‹T›): void };`);
    await expectOrigin(`type «T» = 1; type O = { m<T>(a: T): void; n: ‹T› };`);
  });

  it("resolves an inferred type in the true branch only", async () => {
    await expectOrigin(
      `type U = 1; type E<T> = T extends (infer «U»)[] ? ‹U› : never;`,
    );
    await expectOrigin(
      `type «U» = 1; type E<T> = T extends (infer U)[] ? 1 : ‹U›;`,
    );
  });

  it("resolves an inferred type of a signature inside the operand", () =>
    expectOrigin(`
      type R = 1;
      type Ret<T> = T extends (...a: any[]) => infer «R» ? ‹R› : never;
    `));

  it("resolves a nested conditional type's inferred type", () =>
    expectOrigin(`
      type N<T> = T extends infer V ? (V extends infer «W» ? [V, ‹W›] : V) : never;
    `));

  it("resolves a mapped type's key", async () => {
    await expectOrigin(`type K = 1; type M<T> = { [«K» in keyof T]: ‹K› };`);
    await expectOrigin(
      `type «K» = 1; type M<T> = { [K in keyof T]: 1 }; let k: ‹K›;`,
    );
  });

  it("resolves a function expression's and a class expression's type parameter", async () => {
    await expectOrigin(`const f = function <«T»>(a: ‹T›) {};`);
    await expectOrigin(`const c = class <«T»> { p: ‹T› };`);
  });
});

describe("signatures", () => {
  it("resolves a parameter in a return type", async () => {
    await expectOrigin(
      `const y = 1; function h(«y»: number): typeof ‹y› { return y }`,
    );
    await expectOrigin(
      `const x = 1; function g(«x»: unknown): ‹x› is string { return true }`,
    );
  });

  it("resolves a function type's parameter in its return type", () =>
    expectOrigin(`const a = 1; type F = («a»: number) => typeof ‹a›;`));

  it("does not see a body declaration from a parameter's type", async () => {
    await expectOrigin(
      `const «q» = 2; function i(p: typeof ‹q›) { var q = 1 }`,
    );
    await expectOrigin(
      `interface «L» {} function l(a: ‹L›) { interface L {} }`,
    );
  });

  it("does not see a body declaration from a constraint or a return type", async () => {
    await expectOrigin(
      `type «V» = 1; function k<T extends ‹V›>() { type V = 2 }`,
    );
    await expectOrigin(
      `type «V» = 1; function k(): ‹V› { type V = 2; return 1 }`,
    );
  });

  it("resolves a body declaration from the body", () =>
    expectOrigin(
      `interface L {} function l(a: L) { interface «L» {} let z: ‹L›; }`,
    ));

  it("resolves an overloaded function to its implementation", () =>
    expectOrigin(`
      function o(a: string): void;
      function «o»(a: any) {}
      ‹o›("");
    `));

  it("resolves an ambient function", () =>
    expectOrigin(`declare function «d»(a: number): void; ‹d›(1);`));

  it("resolves a constructor's parameter property as a parameter", () =>
    expectOrigin(
      `class C { constructor(private «p»: number) { use( ‹p› ); } }`,
    ));

  it("does not resolve a tuple member's name", () =>
    expectOrigin(`const first = 1; type T = [‹first›: string];`));

  it("resolves an index signature's parameter inside the signature only", async () => {
    await expectOrigin(
      `const key = 1; type O = { [«key»: string]: typeof ‹key› };`,
    );
    await expectOrigin(
      `const «key» = 1; type O = { [key: string]: 1; p: typeof ‹key› };`,
    );
  });
});

describe("namespaces and enums", () => {
  it("resolves a namespace's declaration inside it", () =>
    expectOrigin(`
      const a = "outer";
      namespace N { export const «a» = 1; export const b = ‹a›; }
    `));

  it("does not see a namespace's declaration outside it", () =>
    expectOrigin(`
      const «a» = "outer";
      namespace N { export const a = 1; }
      use( ‹a› );
    `));

  it("keeps var inside its namespace", () =>
    expectOrigin(`
      var «a» = "outer";
      namespace N { { var a = 1; } }
      use( ‹a› );
    `));

  it("resolves a namespace nested in another", () =>
    expectOrigin(`
      namespace A { export namespace «B» { export const c = 1 } export const d = ‹B›.c; }
    `));

  it("resolves the first name of a qualified namespace declaration", () =>
    expectOrigin(`namespace «A».B { export const c = 1 } use( ‹A› );`));

  it("resolves an enum member by its bare name inside the enum", async () => {
    await expectOrigin(`const A = 0; enum E { «A» = 1, B = ‹A› }`);
    await expectOrigin(`const «A» = 0; enum E { A = 1 } use( ‹A› );`);
  });

  it("resolves an import alias and the root of its target", async () => {
    await expectOrigin(
      `namespace N { export const a = 1 } import «Q» = N.a; use( ‹Q› );`,
    );
    await expectOrigin(
      `namespace «N» { export const a = 1 } import Q = ‹N›.a;`,
    );
  });

  it("keeps a global augmentation's declarations in its block", () =>
    expectOrigin(`
      export {};
      declare global { var gv: number }
      use( ‹gv› );
    `));
});

describe("imports", () => {
  it("stops a type reference at an import", () =>
    expectFrontier(`import type { T } from "ext"; let a: ‹T›;`, "ext"));

  it("stops a value reference at an import", () =>
    expectFrontier(`import { v as w } from "ext"; use( ‹w› );`, "ext"));

  it("stops a namespace reference at an import", () =>
    expectFrontier(`import * as ns from "ext"; let a: ‹ns›.T;`, "ext"));

  it("stops at an import assigned from require", () =>
    expectFrontier(`import r = require("ext"); use( ‹r› );`, "ext"));
});

describe("classes", () => {
  it("resolves a class member's decorator outside the method", () =>
    expectOrigin(`
      const «v» = 1;
      class C { @dec(‹v›) m(v: string) {} }
    `));

  it("resolves a class decorator outside the class's type parameters", () =>
    expectOrigin(`
      type «T» = 1;
      @dec<‹T›>() class C<T> {}
    `));

  it("does not resolve a member's name", () =>
    expectOrigin(`const p = 1; class C { ‹p› = 2 }`));

  it("resolves an abstract class and its members' types", async () => {
    await expectOrigin(`abstract class «A» {} let a: ‹A›;`);
    await expectOrigin(`abstract class A<«T»> { abstract m(p: ‹T›): void }`);
  });

  it("resolves a class expression's own name as a type inside it", () =>
    expectOrigin(`const c = class «Self» { m(): ‹Self› { return this } };`));
});

describe("declined (SCOPING.md §7)", () => {
  it("declines a name merged from several declarations", async () => {
    await expectUnsupported(
      `interface I { a: 1 } interface I { b: 2 } let i: ‹I›;`,
    );
    await expectUnsupported(
      `class K {} namespace K { export const m = 1 } use( ‹K› );`,
    );
  });

  it("resolves a name that only looks merged: a type and a value", () =>
    expectOrigin(`interface «I» { a: 1 } function I() {} let i: ‹I›;`));

  it("declines a name another declaration of the namespace exports", () =>
    expectUnsupported(`
      const a = "outer";
      namespace N { export const a = 1 }
      namespace N { export const b = ‹a›; }
    `));

  it("resolves a name no other declaration of the namespace declares", () =>
    expectOrigin(`
      const «z» = "outer";
      namespace N { export const a = 1 }
      namespace N { export const b = ‹z›; }
    `));

  it("declines a member another declaration of the enum declares", () =>
    expectUnsupported(`const A = 0; enum E { A } enum E { B = ‹A› }`));

  it("declines a name of a qualified namespace declaration inside it", () =>
    expectUnsupported(`const B = 0; namespace A.B { export const c = ‹B›; }`));

  it("declines a class's type parameter in a static member", () =>
    expectUnsupported(`type T = 1; class C<T> { static s: ‹T› }`));

  it("resolves a class's type parameter in an instance member", () =>
    expectOrigin(`type T = 1; class C<«T»> { s: ‹T› }`));

  it("declines a parameter decorator naming a parameter of its function", () =>
    expectUnsupported(`
      const p = 1;
      class C { m(@dec(‹p›) p: number) {} }
    `));

  it("resolves a parameter decorator past the function's body", () =>
    expectOrigin(`
      const «tok» = 1;
      class C { m(@dec(‹tok›) p: number) { const tok = 2; } }
    `));
});
