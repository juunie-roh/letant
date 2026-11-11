import path from "node:path";
import { cwd } from "node:process";

import type { Config } from "letant";
import { Workspace } from "letant";
import { describe, expect, it } from "vitest";

// Scoping rules are specified in packages/js/SCOPING.md. Each source marks the
// position to resolve with ‹name› and the identifier it must land on with
// «name»; a source without «» must resolve to nothing. Requires `@letant/js` to
// be built.
const config: Config = {
  rootDir: "packages/js/__mocks__/fixture",
  plugins: [
    {
      name: path.resolve(cwd(), "packages/js/dist/index.mjs"),
      extensions: [".js"],
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
  workspace.openSource("scope.js", source);

  const resolved = workspace.origin("scope.js", offset);
  if (resolved === undefined || typeof resolved === "string") return resolved;

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

describe("blocks and branches", () => {
  it("does not see a block's declaration after the block", () =>
    expectOrigin(`
      const «x» = "outer";
      { let x = "inner"; }
      use( ‹x› );
    `));

  it("resolves an if condition in the enclosing scope", () =>
    expectOrigin(`
      const «x» = "outer";
      if ( ‹x› ) { const x = "inner"; }
    `));

  it("resolves a declaration inside an else branch", () =>
    expectOrigin(`
      const x = "outer";
      if ( flag ) { noop(); } else { const «x» = "inner"; use( ‹x› ); }
    `));

  it("resolves a declaration inside an else-if branch", () =>
    expectOrigin(`
      const x = "outer";
      if ( flag ) { noop(); } else if ( other ) { const «x» = "inner"; use( ‹x› ); }
    `));

  it("resolves a while condition in the enclosing scope", () =>
    expectOrigin(`
      const «x» = "outer";
      while ( ‹x› ) { const x = "inner"; }
    `));

  it("resolves a do-while condition in the enclosing scope", () =>
    expectOrigin(`
      const «x» = "outer";
      do { const x = "inner"; } while ( ‹x› );
    `));

  it("resolves a labeled block's declaration", () =>
    expectOrigin(`
      const q = "outer";
      lbl: { const «q» = "inner"; use( ‹q› ); }
    `));
});

describe("switch", () => {
  it("resolves the discriminant in the enclosing scope", () =>
    expectOrigin(`
      const «x» = "outer";
      switch ( ‹x› ) { case 1: { const x = "inner"; } }
    `));

  it("resolves the discriminant past an unbraced case", () =>
    expectOrigin(`
      const «x» = "outer";
      switch ( ‹x› ) { case 1: let x = "inner"; }
    `));

  it("shares one scope across cases", () =>
    expectOrigin(`
      switch ( v ) { case 1: let «x» = 1; case 2: use( ‹x› ); }
    `));

  it("does not leak a case's declaration into the enclosing scope", () =>
    expectOrigin(`
      switch ( v ) { case 1: let x = "inner"; }
      const «x» = "outer";
      use( ‹x› );
    `));

  it("does not see a case's declaration after the switch", () =>
    expectOrigin(`
      const «x» = "outer";
      switch ( v ) { case 1: let x = "inner"; }
      use( ‹x› );
    `));
});

describe("loops", () => {
  it("resolves a for condition against the loop's own binding", () =>
    expectOrigin(`
      const i = "outer";
      for ( let «i» = 0; ‹i› < 1; i ++ ) {}
    `));

  it("gives the body a scope separate from the head", () =>
    expectOrigin(`
      for ( let i = 0;; ) { let «i» = "body"; use( ‹i› ); }
    `));

  it("resolves a for-in declaration", () =>
    expectOrigin(`
      const key = "outer";
      for ( let «key» in obj ) { use( ‹key› ); }
    `));

  it("resolves a destructured for-of declaration", () =>
    expectOrigin(`
      const k = "outer";
      for ( const [ «k», v ] of entries ) { use( ‹k› ); }
    `));

  it("resolves a for-await declaration", () =>
    expectOrigin(`
      const chunk = "outer";
      async function read() {
        for await ( const «chunk» of stream ) { use( ‹chunk› ); }
      }
    `));

  it("resolves the iterated expression against the loop's binding", () =>
    expectOrigin(`
      const x = [];
      for ( const «x» of ‹x› ) {}
    `));

  it("resolves an undeclared for-of target in the enclosing scope", () =>
    expectOrigin(`
      let «x»;
      for ( x of xs ) { use( ‹x› ); }
    `));

  it("resolves a labeled loop's head", () =>
    expectOrigin(`
      outer: for ( let «i» = 0; i < 1; i ++ ) { use( ‹i› ); }
    `));
});

describe("try", () => {
  it("resolves a try block's declaration", () =>
    expectOrigin(`try { const «t» = 1; use( ‹t› ); } catch {}`));

  it("does not see a try block's declaration in catch", () =>
    expectOrigin(`try { const t = 1; } catch { use( ‹t› ); }`));

  it("resolves a finally block's declaration", () =>
    expectOrigin(`try {} finally { const «z» = 1; use( ‹z› ); }`));

  it("resolves a catch parameter", () =>
    expectOrigin(`
      const err = "outer";
      try {} catch ( «err» ) { use( ‹err› ); }
    `));

  it("resolves a destructured catch parameter", () =>
    expectOrigin(`try {} catch ( { «message» } ) { use( ‹message› ); }`));

  it("does not see a catch parameter after the clause", () =>
    expectOrigin(`try {} catch ( err ) {} use( ‹err› );`));

  it("resolves a function declared in try", () =>
    expectOrigin(`try { function g( «p» ) { use( ‹p› ); } } catch {}`));
});

describe("declarations", () => {
  it("resolves a top-level declaration", () =>
    expectOrigin(`const «x» = 1; use( ‹x› );`));

  it("resolves the second declarator of a declaration", () =>
    expectOrigin(`const a = 1, «b» = 2; use( ‹b› );`));

  it("resolves a renamed name from an object pattern", () =>
    expectOrigin(`const { a, b: «renamed» } = obj; use( ‹renamed› );`));

  it("resolves a rest name from an array pattern", () =>
    expectOrigin(`const [ first, ...«others» ] = list; use( ‹others› );`));

  it("resolves a defaulted name from a nested pattern", () =>
    expectOrigin(`const { a: { «b» = 1 } } = obj; use( ‹b› );`));

  it("resolves a using declaration within its block", () =>
    expectOrigin(`{ using «res» = open(); use( ‹res› ); }`));

  it("resolves a declared undefined", () =>
    expectOrigin(`var «undefined»; use( ‹undefined› );`));

  it("keeps the first of repeated var declarations", () =>
    expectOrigin(`var «x»; var x; use( ‹x› );`));

  it("keeps the last of repeated function declarations", () =>
    expectOrigin(`function x() {} function «x»() {} use( ‹x› );`));

  it("prefers a function declaration over a var", () =>
    expectOrigin(`var x; function «x»() {} use( ‹x› );`));
});

describe("var hoisting", () => {
  it("attaches var in a block to the function", () =>
    expectOrigin(`function f() { if ( c ) { var «v» = 1; } return ‹v›; }`));

  it("attaches var in an unbraced branch to the function", () =>
    expectOrigin(`function f() { if ( c ) var «v»; return ‹v›; }`));

  it("attaches var in a for head to the function", () =>
    expectOrigin(`function f() { for ( var «i» = 0;; ) {} return ‹i›; }`));

  it("attaches var in a for-of head to the function", () =>
    expectOrigin(`function f() { for ( var «i» of xs ) {} return ‹i›; }`));

  it("does not hoist var out of a function", () =>
    expectOrigin(`function f() { var v; } use( ‹v› );`));

  it("does not hoist var out of a static block", () =>
    expectOrigin(`class A { static { var v = 1; } } use( ‹v› );`));
});

describe("functions", () => {
  it("resolves a parameter of a function declaration", () =>
    expectOrigin(`const a = "outer"; function f( «a» ) { use( ‹a› ); }`));

  it("resolves a body declaration", () =>
    expectOrigin(`
      const v = "outer";
      function f() { const «v» = "inner"; use( ‹v› ); }
    `));

  it("resolves a declared function's name from the enclosing scope", () =>
    expectOrigin(`function «foo»() {} ‹foo›();`));

  it("resolves a declared function's name inside its own body", () =>
    expectOrigin(`function «fact»( n ) { return ‹fact›( n - 1 ); }`));

  it("resolves an outer parameter inside a nested function", () =>
    expectOrigin(`
      const p = "outer";
      function outer( «p» ) { function inner() { use( ‹p› ); } }
    `));

  it("resolves a parameter of a function declared in a block", () =>
    expectOrigin(
      `const q = "outer"; { function inner( «q» ) { use( ‹q› ); } }`,
    ));

  it("scopes a function declared in a block to the block", () =>
    expectOrigin(`{ function inner() {} } ‹inner›();`));

  it("resolves a parameter of a generator declaration", () =>
    expectOrigin(`const a = "outer"; function* gen( «a» ) { yield ‹a›; }`));

  it("resolves a parameter of an arrow function with a block body", () =>
    expectOrigin(`const a = "outer"; const f = ( «a» ) => { use( ‹a› ); };`));

  it("resolves a parameter of an arrow function with an expression body", () =>
    expectOrigin(`const a = "outer"; const f = ( «a» ) => use( ‹a› );`));

  it("resolves an unparenthesized arrow parameter", () =>
    expectOrigin(`const a = "outer"; const f = «a» => use( ‹a› );`));

  it("resolves a parameter of an async arrow function", () =>
    expectOrigin(
      `const a = "outer"; const f = async ( «a» ) => await use( ‹a› );`,
    ));

  it("resolves a parameter of an assigned function expression", () =>
    expectOrigin(
      `const a = "outer"; const f = function ( «a» ) { use( ‹a› ); };`,
    ));

  it("resolves a defaulted parameter", () =>
    expectOrigin(`const a = "outer"; function f( «a» = 1 ) { use( ‹a› ); }`));

  it("resolves a rest parameter", () =>
    expectOrigin(`const r = "outer"; function f( ...«r» ) { use( ‹r› ); }`));

  it("resolves a name from a destructured parameter", () =>
    expectOrigin(
      `const c = "outer"; function f( { a, b: [ «c» ] } ) { use( ‹c› ); }`,
    ));

  it("merges a var redeclaring a parameter into the parameter", () =>
    expectOrigin(`function f( «a» ) { var a; use( ‹a› ); }`));

  it("hides body declarations from parameter expressions", () =>
    expectOrigin(`const «b» = 1; function f( a = ‹b› ) { var b; }`));

  it("lets parameters see each other", () =>
    expectOrigin(`function f( «a», b = ‹a› ) {}`));

  it("resolves an assigned function's name", () =>
    expectOrigin(`const «f» = () => {}; ‹f›();`));

  it("resolves a parameter of an exported function", () =>
    expectOrigin(
      `const a = "outer"; export function f( «a» ) { use( ‹a› ); }`,
    ));

  it("resolves a parameter of an exported arrow function", () =>
    expectOrigin(
      `const a = "outer"; export const f = ( «a» ) => { use( ‹a› ); };`,
    ));

  it("resolves a parameter of a default-exported named function", () =>
    expectOrigin(
      `const a = "outer"; export default function f( «a» ) { use( ‹a› ); }`,
    ));

  it("resolves a parameter of a default-exported anonymous function", () =>
    expectOrigin(
      `const a = "outer"; export default function ( «a» ) { use( ‹a› ); }`,
    ));

  it("resolves a parameter of a default-exported arrow function", () =>
    expectOrigin(`const a = "outer"; export default ( «a» ) => use( ‹a› );`));
});

describe("functions inside expressions", () => {
  it("resolves a callback parameter", () =>
    expectOrigin(
      `const x = "outer"; items.map( ( «x» ) => { use( ‹x› ); } );`,
    ));

  it("resolves a callback's body declaration", () =>
    expectOrigin(`items.forEach( () => { const «y» = 1; use( ‹y› ); } );`));

  it("resolves a callback function expression's body declaration", () =>
    expectOrigin(`setTimeout( function () { const «t» = 1; use( ‹t› ); } );`));

  it("resolves a callback nested inside a function", () =>
    expectOrigin(`
      const x = "outer";
      function f() { return items.map( ( «x» ) => use( ‹x› ) ); }
    `));

  it("resolves a deeply nested callback", () =>
    expectOrigin(`a( b( c( ( «x» ) => use( ‹x› ) ) ) );`));

  it("resolves an object method's parameter", () =>
    expectOrigin(`const a = "outer"; const o = { m( «a» ) { use( ‹a› ); } };`));

  it("resolves an object property arrow's parameter", () =>
    expectOrigin(`const a = "outer"; const o = { m: ( «a» ) => use( ‹a› ) };`));

  it("resolves an object getter's body declaration", () =>
    expectOrigin(`const o = { get g() { const «w» = 1; return ‹w›; } };`));

  it("evaluates a computed method key outside the method", () =>
    expectOrigin(`const «k» = 1; const o = { [ ‹k› ]( k ) {} };`));

  it("resolves an IIFE parameter", () =>
    expectOrigin(
      `const a = "outer"; ( function ( «a» ) { use( ‹a› ); } )( 1 );`,
    ));

  it("resolves an arrow IIFE parameter", () =>
    expectOrigin(`const a = "outer"; ( ( «a» ) => use( ‹a› ) )( 1 );`));

  it("resolves an assigned IIFE parameter", () =>
    expectOrigin(
      `const a = "outer"; const r = ( function ( «a» ) { return ‹a›; } )( 1 );`,
    ));

  it("resolves an IIFE argument in the enclosing scope", () =>
    expectOrigin(
      `const «x» = "outer"; ( function () { const x = "inner"; } )( ‹x› );`,
    ));

  it("resolves the name an IIFE's result is assigned to", () =>
    expectOrigin(`const «r» = ( function () {} )(); use( ‹r› );`));
});

describe("expression own names", () => {
  it("sees a function expression's own name inside it", () =>
    expectOrigin(`const g = function «h»() { return ‹h›; };`));

  it("sees a callback's own name inside it", () =>
    expectOrigin(`items.map( function «each»() { return ‹each›; } );`));

  it("does not see a function expression's own name outside it", () =>
    expectOrigin(`const g = function h() {}; use( ‹h› );`));

  it("lets a parameter shadow the own name", () =>
    expectOrigin(`const g = function h( «h» ) { return ‹h›; };`));

  it("does not see a class expression's own name outside it", () =>
    expectOrigin(`const B = class A {}; use( ‹A› );`));

  it("does not see a private name outside its class", () =>
    expectOrigin(`class A { #p; } class B { m() { return this.‹#p›; } }`));

  it("sees a class expression's own name inside it", () =>
    expectOrigin(`const B = class «A» { m() { return ‹A›; } };`));
});

describe("classes", () => {
  it("resolves a class name from the enclosing scope", () =>
    expectOrigin(`class «A» {} new ‹A›();`));

  it("resolves a class name inside its own method", () =>
    expectOrigin(`class «Point» { clone() { return new ‹Point›(); } }`));

  it("resolves a method parameter", () =>
    expectOrigin(`const a = "outer"; class A { m( «a» ) { use( ‹a› ); } }`));

  it("resolves a method body declaration", () =>
    expectOrigin(
      `const v = "outer"; class A { m() { const «v» = "inner"; use( ‹v› ); } }`,
    ));

  it("resolves a constructor parameter", () =>
    expectOrigin(
      `const a = "outer"; class A { constructor( «a» ) { use( ‹a› ); } }`,
    ));

  it("resolves a getter body declaration", () =>
    expectOrigin(
      `const w = "outer"; class A { get v() { const «w» = "inner"; return ‹w›; } }`,
    ));

  it("reaches a setter beside a getter of the same name", () =>
    expectOrigin(`class A { get g() {} set g( «v» ) { use( ‹v› ); } }`));

  it("resolves a parameter of an arrow function field", () =>
    expectOrigin(
      `const a = "outer"; class A { handle = ( «a» ) => { use( ‹a› ); }; }`,
    ));

  it("resolves a static block declaration", () =>
    expectOrigin(
      `const t = "outer"; class A { static { const «t» = "inner"; use( ‹t› ); } }`,
    ));

  it("resolves a method parameter of an assigned class expression", () =>
    expectOrigin(
      `const a = "outer"; const B = class { m( «a» ) { use( ‹a› ); } };`,
    ));

  it("resolves a method parameter of an exported class", () =>
    expectOrigin(
      `const a = "outer"; export class A { m( «a» ) { use( ‹a› ); } }`,
    ));

  it("resolves a method parameter of a default-exported class", () =>
    expectOrigin(
      `const a = "outer"; export default class A { m( «a» ) { use( ‹a› ); } }`,
    ));

  it("resolves a method parameter of a default-exported anonymous class", () =>
    expectOrigin(
      `const a = "outer"; export default class { m( «a» ) { use( ‹a› ); } }`,
    ));

  it("resolves a method parameter of a class declared in a function", () =>
    expectOrigin(
      `const a = "outer"; function f() { class Inner { m( «a» ) { use( ‹a› ); } } }`,
    ));

  it("does not let a field shadow an outer name", () =>
    expectOrigin(
      `const «count» = 0; class A { count = 1; inc() { return ‹count›; } }`,
    ));

  it("does not let a method shadow an outer function", () =>
    expectOrigin(
      `function «helper»() {} class A { helper() {} run() { ‹helper›(); } }`,
    ));

  it("does not resolve a public member through this", () =>
    expectOrigin(`class A { helper() {} run() { this.‹helper›(); } }`));

  it("resolves a private field", () =>
    expectOrigin(`class A { «#p»; m() { return this.‹#p›; } }`));

  it("resolves a private method", () =>
    expectOrigin(`class A { «#m»() {} run() { this.‹#m›(); } }`));
});

// An import binds its local name to the module it names; while that module is
// not opened, resolution stops at the module's specifier.
describe("imports", () => {
  it("resolves a default import beside named imports", () =>
    expectFrontier(`import d, { n } from "pkg"; use( ‹d› );`, "pkg"));

  it("resolves a named import beside a default import", () =>
    expectFrontier(`import d, { n } from "pkg"; use( ‹n› );`, "pkg"));

  it("resolves a namespace import", () =>
    expectFrontier(`import * as ns from "pkg"; use( ‹ns› );`, "pkg"));

  it("resolves an aliased import by its local name", () =>
    expectFrontier(`import { a as b } from "pkg"; use( ‹b› );`, "pkg"));

  it("does not bind an aliased import's original name", () =>
    expectOrigin(`import { a as b } from "pkg"; use( ‹a› );`));

  it("resolves an import of default by alias", () =>
    expectFrontier(`import { default as d } from "pkg"; use( ‹d› );`, "pkg"));

  it("resolves an import of a string name by alias", () =>
    expectFrontier(`import { "s" as d } from "pkg"; use( ‹d› );`, "pkg"));
});

// `origin` resolves a position only when the plugin's `references` names it.
describe("positions that are not references", () => {
  it("does not resolve a property after a dot", () =>
    expectOrigin(`const name = 1; use( obj.‹name› );`));

  it("does not resolve the inside of a string", () =>
    expectOrigin(`const a = 1; const s = "‹a›";`));

  it("does not resolve a comment", () => expectOrigin(`const a = 1; // ‹a›`));

  it("does not resolve an object key", () =>
    expectOrigin(`const k = 1; const o = { ‹k›: 2 };`));

  it("does not resolve a label", () =>
    expectOrigin(`const outer = 1; outer: for ( ;; ) { break ‹outer›; }`));

  it("does not resolve a lowercase JSX tag", () =>
    expectOrigin(`const div = 1; const e = <‹div› />;`));

  it("does not resolve a JSX attribute name", () =>
    expectOrigin(`const id = 1; const e = <Item ‹id›="x" />;`));

  it("does not resolve an aliased import's original name", () =>
    expectOrigin(`const a = 1; import { ‹a› as b } from "pkg";`));

  it("does not resolve an export alias", () =>
    expectOrigin(`const x = 1; const y = 2; export { x as ‹y› };`));

  it("does not resolve a re-exported name", () =>
    expectOrigin(`const x = 1; export { ‹x› } from "pkg";`));

  it("resolves the local name of an export alias", () =>
    expectOrigin(`const «x» = 1; const y = 2; export { ‹x› as y };`));

  it("resolves a JSX member tag's root", () =>
    expectOrigin(`const «ui» = {}; const e = <‹ui›.Item />;`));
});

describe("references outside plain identifiers", () => {
  it("resolves a shorthand property to its variable", () =>
    expectOrigin(`const «k» = 1; const o = { ‹k› };`));

  it("resolves a JSX tag to its component", () =>
    expectOrigin(`
      const Item = "outer";
      function App() { const «Item» = () => null; return <‹Item› />; }
    `));
});
