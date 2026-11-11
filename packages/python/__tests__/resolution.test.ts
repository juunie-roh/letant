import path from "node:path";
import { cwd } from "node:process";

import type { Config } from "letant";
import { Workspace } from "letant";
import { describe, expect, it } from "vitest";

// Scoping rules are specified in packages/python/SCOPING.md. Each source marks
// the position to resolve with ‹name› and the identifier it must land on with
// «name»; a source without «» must resolve to nothing. Requires
// `@letant/python` to be built.
const config: Config = {
  rootDir: "packages/python/__mocks__/fixture",
  plugins: [
    {
      name: path.resolve(cwd(), "packages/python/dist/index.mjs"),
      extensions: [".py"],
    },
  ],
};

/** Removes the indentation the test file adds; Python's own is kept. */
function dedent(text: string) {
  const lines = text.replace(/^\n/, "").trimEnd().split("\n");
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.search(/\S/)),
  );
  return lines.map((l) => l.slice(indent)).join("\n") + "\n";
}

function parseMarks(text: string) {
  const marked = dedent(text);
  let source = "";
  let last = 0;
  let declaration: number | undefined;
  let reference = -1;

  // «‹name›» marks a declaration that is itself the position to resolve
  for (const match of marked.matchAll(/«‹([^›]*)›»|«([^»]*)»|‹([^›]*)›/g)) {
    source += marked.slice(last, match.index);
    if (match[3] === undefined) declaration = source.length;
    if (match[2] === undefined) reference = source.length;
    source += match[1] ?? match[2] ?? match[3];
    last = match.index + match[0].length;
  }

  return { source: source + marked.slice(last), declaration, reference };
}

async function origin(source: string, offset: number) {
  const workspace = await Workspace.create(config);
  workspace.openSource("scope.py", source);

  const resolved = workspace.origin("scope.py", offset);
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

describe("compound statements open no scope", () => {
  it("sees an if branch's binding after the statement", () =>
    expectOrigin(`
      if flag:
          «x» = 1
      use(‹x›)
    `));

  it("sees a for target after the loop", () =>
    expectOrigin(`
      for «i», j in pairs:
          pass
      use(‹i›)
    `));

  it("sees a nested destructured for target", () =>
    expectOrigin(`
      for i, (j, *«rest») in pairs:
          use(‹rest›)
    `));

  it("sees a with target after the block", () =>
    expectOrigin(`
      with open(p) as «f», lock:
          pass
      use(‹f›)
    `));

  it("sees a parenthesized with target", () =>
    expectOrigin(`
      with (open(p) as «f»):
          use(‹f›)
    `));

  it("sees an except target inside its clause", () =>
    expectOrigin(`
      e = "outer"
      def f():
          try:
              pass
          except Error as «e»:
              use(‹e›)
    `));

  it("sees a while body's binding in an else clause", () =>
    expectOrigin(`
      def f():
          while cond:
              «x» = 1
          else:
              use(‹x›)
    `));

  it("binds a function-level name in the function, not the module", () =>
    expectOrigin(`
      «x» = "outer"
      def f():
          if flag:
              x = "inner"
      use(‹x›)
    `));
});

describe("assignment targets", () => {
  it("binds every name of a chained assignment", () =>
    expectOrigin(`
      a = «b» = 1
      use(‹b›)
    `));

  it("binds names inside a nested target", () =>
    expectOrigin(`
      (a, [b, *«c»]), d.e, f[0] = value
      use(‹c›)
    `));

  it("does not bind an attribute target", () =>
    expectOrigin(`
      «d» = make()
      d.e = 1
      use(‹d›)
    `));

  it("makes an augmented target local to its function", () =>
    expectOrigin(`
      x = "outer"
      def f():
          «x» += 1
          use(‹x›)
    `));

  it("makes an annotated name local even without a value", () =>
    expectOrigin(`
      x = "outer"
      def f():
          «x»: int
          use(‹x›)
    `));

  it("does not bind a parenthesized name that is only annotated", () =>
    expectOrigin(`
      «x» = "outer"
      def f():
          (x): int
          use(‹x›)
    `));

  it("binds a parenthesized name that is annotated and assigned", () =>
    expectOrigin(`
      x = "outer"
      def f():
          («x»): int = 1
          use(‹x›)
    `));

  it("makes a del target local", () =>
    expectOrigin(`
      x = "outer"
      def f():
          del «x»
          use(‹x›)
    `));

  it("binds an assignment expression in the enclosing function", () =>
    expectOrigin(`
      n = "outer"
      def f():
          if («n» := compute()) > 1:
              pass
          use(‹n›)
    `));

  it("keeps the first binding across different binding forms", () =>
    expectOrigin(`
      def «f»():
          pass
      f = wrap(f)
      for f in items:
          pass
      use(‹f›)
    `));

  it("keeps the first binding of a name as its declaration", () =>
    expectOrigin(`
      «x» = 1
      x = 2
      use(‹x›)
    `));
});

describe("functions", () => {
  it("resolves a parameter from the body", () =>
    expectOrigin(`
      a = "outer"
      def f(«a», b=1):
          use(‹a›)
    `));

  it.each([
    ["a default", "def f(a, «b»=1): use(‹b›)"],
    ["an annotation", "def f(a, «b»: int): use(‹b›)"],
    ["an annotation and a default", "def f(a, «b»: int = 1): use(‹b›)"],
    ["a star", "def f(a, *«b»): use(‹b›)"],
    ["a double star", "def f(a, **«b»): use(‹b›)"],
    ["an annotated star", "def f(a, *«b»: int): use(‹b›)"],
    ["a keyword-only marker", "def f(a, *, «b»): use(‹b›)"],
    ["a positional-only marker", "def f(«b», /, a): use(‹b›)"],
  ])("resolves a parameter with %s", (_, source) => expectOrigin(source));

  it("treats a name bound later in the body as local", () =>
    expectOrigin(`
      x = "outer"
      def f():
          use(‹x›)
          «x» = "inner"
    `));

  it("does not leak a local into the enclosing scope", () =>
    expectOrigin(`
      «x» = "outer"
      def f():
          x = "inner"
      use(‹x›)
    `));

  it("binds a function's name in the enclosing scope", () =>
    expectOrigin(`
      def «f»():
          return ‹f›()
    `));

  it("does not bind a function's name inside itself", () =>
    expectOrigin(`
      def outer():
          def «f»():
              pass
          def g(f=1):
              pass
          return ‹f›
    `));

  it("sees an enclosing function's local from a nested function", () =>
    expectOrigin(`
      x = "outer"
      def f():
          «x» = "enclosing"
          def g():
              return ‹x›
    `));

  it("resolves a decorator in the enclosing scope", () =>
    expectOrigin(`
      «d» = make()
      @‹d›
      def f(d):
          pass
    `));

  it("resolves a return annotation in the enclosing scope", () =>
    expectOrigin(`
      «T» = int
      def f(a) -> ‹T›:
          pass
    `));

  it("a default value does not see the function's parameters", () =>
    expectOrigin(`
      «x» = "outer"
      def f(x=‹x›):
          pass
    `));

  it("a lambda's default value does not see its parameters", () =>
    expectOrigin(`
      for «i» in range(3):
          callbacks.append(lambda i=‹i›: i)
    `));

  it("a parameter annotation does not see the parameters", () =>
    expectOrigin(`
      «date» = object
      def f(date: ‹date›):
          pass
    `));

  it("a return annotation does not see the function's locals", () =>
    expectOrigin(`
      «T» = int
      def f() -> ‹T›:
          T = str
    `));

  it("binds an assignment expression in a default value outside the function", () =>
    expectOrigin(`
      y = "outer"
      def outer():
          def f(a=(«y» := 1)):
              pass
          return ‹y›
    `));

  it("binds an assignment expression in a lambda's default value outside it", () =>
    expectOrigin(`
      y = "outer"
      def outer():
          f = lambda a=(«y» := 1): a
          return ‹y›
    `));

  it("reaches a lambda used as a default value", () =>
    expectOrigin(`
      k = "outer"
      def f(key=lambda «k»: ‹k›.name):
          pass
    `));

  it("binds a nested def inside a compound statement", () =>
    expectOrigin(`
      try:
          def «f»(): pass
      except Error:
          pass
      ‹f›()
    `));
});

describe("lambdas", () => {
  it("resolves a lambda parameter", () =>
    expectOrigin(`
      a = "outer"
      f = lambda «a», b=1: ‹a› + b
    `));

  it("resolves a free name of a lambda in the enclosing scope", () =>
    expectOrigin(`
      def f():
          «x» = 1
          return lambda a: a + ‹x›
    `));

  it("does not leak a lambda parameter", () =>
    expectOrigin(`
      «a» = "outer"
      f = lambda a: a
      use(‹a›)
    `));

  it("reaches a lambda nested in a call argument", () =>
    expectOrigin(`
      k = "outer"
      items.sort(key=lambda «k»: ‹k›.name)
    `));
});

describe("classes", () => {
  it("resolves a class-level name from the class body", () =>
    expectOrigin(`
      x = "outer"
      class A:
          «x» = 1
          y = ‹x› + 1
    `));

  it("resolves a property name in its setter decorator", () =>
    expectOrigin(`
      class A:
          @property
          def «x»(self): pass
          @‹x›.setter
          def x(self, value): pass
    `));

  it("binds a class's name in the enclosing scope", () =>
    expectOrigin(`
      class «A»:
          def m(self):
              return ‹A›()
    `));

  it("resolves a base class outside the class body", () =>
    expectOrigin(`
      «B» = object
      class A(‹B›):
          B = 1
    `));

  it("binds an assignment expression in a base class outside the class", () =>
    expectOrigin(`
      b = "outer"
      def outer():
          class A((«b» := make())):
              pass
          return ‹b›
    `));

  it("does not leak a class-level name into the enclosing scope", () =>
    expectOrigin(`
      «x» = "outer"
      class A:
          x = 1
      use(‹x›)
    `));

  it("resolves a method's local before anything else", () =>
    expectOrigin(`
      class A:
          x = 1
          def m(self, «x»):
              return ‹x›
    `));

  it("resolves an annotation in a class body against the class", () =>
    expectOrigin(`
      Nested = "outer"
      class A:
          class «Nested»: pass
          field: ‹Nested›
    `));
});

describe("comprehensions", () => {
  it("resolves the element against the comprehension's target", () =>
    expectOrigin(`
      x = "outer"
      [‹x› for «x» in items]
    `));

  it("does not leak a comprehension target", () =>
    expectOrigin(`
      «x» = "outer"
      [x for x in items]
      use(‹x›)
    `));

  it("resolves a condition against the target", () =>
    expectOrigin(`
      x = "outer"
      {x for «x» in items if ‹x›}
    `));

  it("resolves a later clause's iterable against an earlier target", () =>
    expectOrigin(`
      row = "outer"
      [cell for «row» in grid for cell in ‹row›]
    `));

  it("resolves a dictionary comprehension's key", () =>
    expectOrigin(`
      k = "outer"
      {‹k›: v for «k», v in pairs}
    `));

  it("resolves a generator expression's element", () =>
    expectOrigin(`
      x = "outer"
      total = sum(‹x› for «x» in items)
    `));

  it("resolves the first iterable in the enclosing scope", () =>
    expectOrigin(`
      «items» = load()
      [x for x in ‹items›]
    `));

  it("reaches a comprehension written in another's first iterable", () =>
    expectOrigin(`
      y = "outer"
      [x for x in [‹y› for «y» in items]]
    `));

  it("resolves a free name against the enclosing function", () =>
    expectOrigin(`
      def f(«scale»):
          return [x * ‹scale› for x in items]
    `));

  it("binds an assignment expression outside the comprehension", () =>
    expectOrigin(`
      def f():
          [(«last» := x) for x in items]
          return ‹last›
    `));

  it("binds an assignment expression outside nested comprehensions", () =>
    expectOrigin(`
      def f():
          [[(«last» := x) for x in row] for row in grid]
          return ‹last›
    `));

  it("keeps a nested comprehension's target to itself", () =>
    expectOrigin(`
      [[x for x in row] + [‹x›] for row in grid for «x» in row]
    `));
});

describe("global and nonlocal", () => {
  it("resolves a global name to the module's binding", () =>
    expectOrigin(`
      «count» = 0
      def f():
          global count
          count = 1
          use(‹count›)
    `));

  it("binds a global name assigned only inside a function", () =>
    expectOrigin(`
      def f():
          global cache
          «cache» = {}
      use(‹cache›)
    `));

  it("applies a global statement to the whole function", () =>
    expectOrigin(`
      «x» = 0
      def f():
          def g():
              pass
          global x
          for x in items:
              pass
          use(‹x›)
    `));

  it("answers a name in a global statement with the module's binding", () =>
    expectOrigin(`
      «x» = 0
      def f():
          global ‹x›
          x = 1
    `));

  it("resolves a nonlocal name to the enclosing function's binding", () =>
    expectOrigin(`
      x = "module"
      def f():
          «x» = 0
          def g():
              nonlocal x
              x = 1
              use(‹x›)
    `));

  it("honors a global statement for an assignment expression", () =>
    expectOrigin(`
      «seen» = None
      def f():
          global seen
          [(seen := x) for x in items]
          use(‹seen›)
    `));
});

describe("match", () => {
  it("binds a capture pattern", () =>
    expectOrigin(`
      match command:
          case «action»:
              use(‹action›)
    `));

  it("binds names inside sequence and mapping patterns", () =>
    expectOrigin(`
      match command:
          case [first, *«rest»]:
              use(‹rest›)
    `));

  it("binds the rest of a mapping pattern", () =>
    expectOrigin(`
      match command:
          case {"k": v, **«rest»}:
              use(‹rest›)
    `));

  it("binds an as pattern", () =>
    expectOrigin(`
      match command:
          case [a, b] as «pair»:
              use(‹pair›)
    `));

  it("binds a class pattern's sub-patterns, not its keywords", () =>
    expectOrigin(`
      match point:
          case Point(x=«px», y=py):
              use(‹px›)
    `));

  it("does not resolve a class pattern's keyword", () =>
    expectOrigin(`
      x = "outer"
      match point:
          case Point(‹x›=px):
              pass
    `));

  it("reads a class pattern's class as a reference", () =>
    expectOrigin(`
      class «Point»: pass
      match point:
          case ‹Point›(x=0):
              pass
    `));

  it("reads a dotted value pattern as a reference", () =>
    expectOrigin(`
      class «Color»: pass
      match color:
          case ‹Color›.RED:
              pass
    `));

  it("does not bind the wildcard", () =>
    expectOrigin(`
      match command:
          case _:
              use(‹_›)
    `));

  it("sees a capture after the match statement", () =>
    expectOrigin(`
      def f():
          match command:
              case [«head», _]:
                  pass
          return ‹head›
    `));
});

describe("type parameters", () => {
  it("resolves a type parameter in a function's annotations", () =>
    expectOrigin(`
      T = "outer"
      def f[«T»](a: ‹T›) -> T:
          pass
    `));

  it("resolves a type parameter in a function's body", () =>
    expectOrigin(`
      T = "outer"
      def f[«T»](a):
          return ‹T›
    `));

  it("resolves a type parameter in a class's bases", () =>
    expectOrigin(`
      T = "outer"
      class A[«T»](Base[‹T›]):
          pass
    `));

  it("resolves a type parameter in a type alias's value", () =>
    expectOrigin(`
      K = "outer"
      type Pairs[«K»] = list[tuple[‹K›, K]]
    `));

  it("resolves a type parameter with a bound and a star", () =>
    expectOrigin(`
      def f[T: int, *«Ts»](*args: *‹Ts›):
          pass
    `));

  it("resolves a bound in the enclosing scope", () =>
    expectOrigin(`
      «Base» = object
      def f[T: ‹Base›](a: T):
          pass
    `));

  it("does not leak a type parameter", () =>
    expectOrigin(`
      «T» = "outer"
      def f[T](a: T):
          pass
      use(‹T›)
    `));

  it("binds a generic function's name outside its type parameters", () =>
    expectOrigin(`
      def «f»[T](a: T):
          pass
      ‹f›(1)
    `));

  it("binds a type alias's name in the enclosing scope", () =>
    expectOrigin(`
      type «Alias»[K] = list[K]
      value: ‹Alias›[int]
    `));

  it("binds a plain type alias's name", () =>
    expectOrigin(`
      type «Tree» = list[int]
      value: ‹Tree›
    `));

  it("resolves a plain type alias's value in the enclosing scope", () =>
    expectOrigin(`
      class «Node»: pass
      type Tree = list[‹Node›]
    `));
});

describe("imports", () => {
  it("binds the first segment of a dotted import", () =>
    expectFrontier(
      `
      import os.path
      use(‹os›)
    `,
      "os",
    ));

  it("binds an alias to the whole dotted module", () =>
    expectFrontier(
      `
      import os.path as p
      use(‹p›)
    `,
      "os.path",
    ));

  it("binds a name imported from a module", () =>
    expectFrontier(
      `
      from pkg.mod import name as local
      use(‹local›)
    `,
      "pkg.mod",
    ));

  it.each([
    ["from . import sibling", "./sibling"],
    ["from .pkg.mod import sibling", "./pkg/mod"],
  ])("turns the relative module of `%s` into a path", (statement, specifier) =>
    expectFrontier(`${statement}\nuse(‹sibling›)`, specifier),
  );

  it("answers an imported name's declaration with its module", () =>
    expectFrontier("from pkg.mod import ‹name›", "pkg.mod"));

  it("binds an import inside a function to that function", () =>
    expectOrigin(`
      «json» = "outer"
      def f():
          import json
      use(‹json›)
    `));

  it("binds an import inside a compound statement", () =>
    expectFrontier(
      `
      try:
          import simplejson as json
      except ImportError:
          pass
      use(‹json›)
    `,
      "simplejson",
    ));

  it("binds a future import's name", () =>
    expectFrontier(
      `
      from __future__ import annotations
      use(‹annotations›)
    `,
      "__future__",
    ));

  it("binds nothing for a star import", () =>
    expectOrigin(`
      from pkg import *
      use(‹name›)
    `));
});

describe("positions that are not references", () => {
  it.each([
    ["an attribute", "x = 1\nobj.‹x›"],
    ["a keyword argument's name", "x = 1\ncall(‹x›=2)"],
    ["a class keyword's name", "metaclass = 1\nclass A(‹metaclass›=M): pass"],
    ["a later segment of a dotted import", "path = 1\nimport os.‹path›"],
    ["an aliased import's module", "os = 1\nimport ‹os›.path as p"],
    ["the module of a from import", "pkg = 1\nfrom ‹pkg› import name"],
    ["the imported side of an alias", "name = 1\nfrom pkg import ‹name› as n"],
    ["a relative import's module", "mod = 1\nfrom .‹mod› import name"],
    [
      "an attribute in a value pattern",
      "RED = 1\nmatch c:\n    case Color.‹RED›: pass",
    ],
    ["the inside of a string annotation", 'T = 1\nvalue: "‹T›" = 2'],
  ])("does not resolve %s", (_, source) => expectOrigin(source));

  it("resolves the object of an attribute", () =>
    expectOrigin(`
      «obj» = make()
      obj.attr.other = ‹obj›.attr
    `));

  it("resolves a keyword argument's value", () =>
    expectOrigin(`
      «x» = 1
      call(x=‹x›)
    `));

  it("resolves a name inside an f-string", () =>
    expectOrigin(`
      «width» = 3
      text = f"{value:>{‹width›}}"
    `));
});

// What follows is decided by syntax, but the core model cannot express it
// yet: SCOPING.md §7. Each case fails today and must pass once it can.
describe("rules the core model cannot express yet", () => {
  it.fails("M1: a method does not see a class-level name", () =>
    expectOrigin(`
      «open» = "outer"
      class File:
          def open(self): pass
          def read(self):
              return ‹open›(self.path)
    `),
  );

  it.fails(
    "M1: a comprehension in a class body does not see a class-level name",
    () =>
      expectOrigin(`
      «scale» = "outer"
      class A:
          scale = 2
          values = [x * ‹scale› for x in range(3)]
    `),
  );

  it.fails("M1: a nested class does not see the outer class's names", () =>
    expectOrigin(`
      «x» = "outer"
      class A:
          x = 1
          class B:
              y = ‹x›
    `),
  );

  it("M2: does not answer a parameter's declaration with an outer binding", () =>
    expectOrigin(`
      a = "outer"
      def f(‹a›, *args, key=None):
          pass
    `));

  it.fails("M2: a parameter's declaration answers with itself", () =>
    expectOrigin(`
      a = "outer"
      def f(«‹a›»):
          pass
    `),
  );

  it.fails("M2: a default value does not see the type parameters", () =>
    expectOrigin(`
      «T» = "outer"
      def f[T](a=‹T›):
          pass
    `),
  );

  it.fails("M2: a scope in the first iterable does not see the targets", () =>
    expectOrigin(`
      «x» = load()
      [x for x in filter(lambda v: v != ‹x›, items)]
    `),
  );

  it.fails(
    "M2: the first iterable does not see the comprehension's targets",
    () =>
      expectOrigin(`
      «x» = load()
      [x for x in ‹x›]
    `),
  );

  it.fails("M3: a global name skips an enclosing function's binding", () =>
    expectOrigin(`
      «x» = "module"
      def f():
          x = "enclosing"
          def g():
              global x
              return ‹x›
    `),
  );

  it.fails("M4: a private name in a class is looked up mangled", () =>
    expectOrigin(`
      __secret = "module"
      class A:
          def m(self):
              return ‹__secret›
    `),
  );
});
