import path from "node:path";

import type { Config } from "letant";
import { Workspace } from "letant";
import { describe, expect, it } from "vitest";

// Scoping rules are specified in packages/go/SCOPING.md. Each source marks
// the position to resolve with ‹name› and the identifier it must land on with
// «name»; a source without «» must resolve to nothing. Requires `letant` and
// `@letant/go` to be built.
const config: Config = {
  rootDir: path.resolve(__dirname, "../__mocks__/fixture"),
  plugins: [
    {
      name: path.resolve(__dirname, "../dist/index.mjs"),
      extensions: [".go"],
    },
  ],
};

function parseMarks(marked: string) {
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
  workspace.openSource("scope.go", source);

  const resolved = workspace.origin("scope.go", offset);
  if (resolved === undefined || typeof resolved === "string") return resolved;
  if ("unsupported" in resolved) return resolved;

  const { at } = resolved.node;
  return typeof at === "string" ? at : at.startIndex;
}

/** Every source is a file of package `p`. */
async function expectOrigin(marked: string) {
  const { source, declaration, reference } = parseMarks(`package p\n${marked}`);
  expect(reference).toBeGreaterThan(-1);
  expect(await origin(source, reference)).toBe(declaration);
}

async function expectFrontier(marked: string, specifier: string) {
  const { source, reference } = parseMarks(`package p\n${marked}`);
  expect(await origin(source, reference)).toBe(specifier);
}

/** The plugin declines the position, naming a rule that contains `rule`. */
async function expectUnsupported(marked: string, rule: string) {
  const { source, reference } = parseMarks(`package p\n${marked}`);
  expect(await origin(source, reference)).toEqual({
    unsupported: expect.stringContaining(rule),
  });
}

const ORDER = "visible only after its declaration";
const KEY = "a key in a composite literal";
const GUARD = "a type switch guard";
const PACKAGE_NAME = "the name an import without one binds";

describe("package block", () => {
  it("sees a variable declared later in the file", () =>
    expectOrigin(`
      func f() { use(‹x›) }
      var «x» = 1
    `));

  it("sees a function", () =>
    expectOrigin(`
      func f() { ‹g›() }
      func «g»() {}
    `));

  it("sees a type", () =>
    expectOrigin(`
      type «T» int
      var v ‹T›
    `));

  it("sees a type alias", () =>
    expectOrigin(`
      type «A» = int
      var v ‹A›
    `));

  it("sees a constant", () =>
    expectOrigin(`
      const «c» = 1
      var v = ‹c›
    `));

  it("sees each name of a declaration with several", () =>
    expectOrigin(`
      var a, «b» = 1, 2
      var v = ‹b›
    `));

  it("sees each name of a constant declaration with several", () =>
    expectOrigin(`
      const a, «b» = 1, 2
      var v = ‹b›
    `));

  it("sees each name of a typed constant declaration with several", () =>
    expectOrigin(`
      const a, b, «c» int = 1, 2, 3
      var v = ‹c›
    `));

  it("sees a name of a grouped declaration", () =>
    expectOrigin(`
      const (
        a = iota
        «b»
      )
      var v = ‹b›
    `));

  it("answers a declaration with itself", () =>
    expectOrigin(`
      var «‹x›» = 1
    `));

  it("answers a function's name with itself, past a type parameter of that name", () =>
    expectOrigin(`
      func «‹F›»[F any]() {}
    `));

  it("does not bind a method's name", () =>
    expectOrigin(`
      type T int
      func (T) m() {}
      func f() { ‹m›() }
    `));

  it("does not bind init", () =>
    expectOrigin(`
      func init() {}
      func f() { ‹init›() }
    `));

  it("does not resolve the name of an init function", () =>
    expectOrigin(`
      func init() {}
      func ‹init›() {}
    `));

  it("leaves a predeclared name unresolved", () =>
    expectOrigin(`
      var v ‹int›
    `));

  it("resolves a predeclared name that is declared again", () =>
    expectOrigin(`
      func f(«len» int) { use(‹len›) }
    `));

  it("never resolves the blank identifier", () =>
    expectOrigin(`
      var _ = 1
      func f() { ‹_› = 2 }
    `));

  it("does not bind the package clause's name", () =>
    expectOrigin(`
      func f() { use(‹p›) }
    `));
});

describe("functions", () => {
  it("sees a parameter in the body", () =>
    expectOrigin(`
      func f(«a» int) { use(‹a›) }
    `));

  it("sees a variadic parameter", () =>
    expectOrigin(`
      func f(a int, «xs» ...int) { use(‹xs›) }
    `));

  it("sees a named result", () =>
    expectOrigin(`
      func f() (n int, «err» error) {
        ‹err› = nil
        return
      }
    `));

  it("sees the receiver", () =>
    expectOrigin(`
      func («r» T) m() { use(‹r›) }
    `));

  it("answers a parameter's declaration with itself", () =>
    expectOrigin(`
      var a = 1
      func f(«‹a›» int) {}
    `));

  it("does not see a parameter outside its function", () =>
    expectOrigin(`
      var «a» = 1
      func f(a int) {}
      func g() { use(‹a›) }
    `));

  it("sees an enclosing function's parameter from a function literal", () =>
    expectOrigin(`
      func f(«a» int) {
        g := func() { use(‹a›) }
        g()
      }
    `));

  it("sees a function literal's parameter before an outer one", () =>
    expectOrigin(`
      func f(a int) {
        g := func(«a» string) { use(‹a›) }
        g("")
      }
    `));

  it("does not see a function literal's parameter after it", () =>
    expectOrigin(`
      func f(«a» int) {
        g := func(a string) {}
        use(g, ‹a›)
      }
    `));

  it("shares one scope between parameters and the body", () =>
    expectOrigin(`
      func f(«err» error) {
        v, err := g()
        use(v, ‹err›)
      }
    `));

  it("answers a function type's parameter with itself", () =>
    expectOrigin(`
      var a = 1
      var fn func(«‹a›» int)
    `));

  it("answers an interface method's parameter with itself", () =>
    expectOrigin(`
      var p = 1
      type I interface { Read(«‹p›» []byte) }
    `));

  // the grammar reads the first names of a list of ten or more as types
  it("sees the first of ten parameters that share a type", () =>
    expectOrigin(`
      var a0 = 1
      func f(«a0», a1, a2, a3, a4, a5, a6, a7, a8, a9 int) { use(‹a0›) }
    `));

  it("answers the first of ten parameters with itself", () =>
    expectOrigin(`
      var a0 = 1
      func f(«‹a0›», a1, a2, a3, a4, a5, a6, a7, a8, a9 int) {}
    `));

  it("sees the first of ten results that share a type", () =>
    expectOrigin(`
      var a0 = 1
      func f() («a0», a1, a2, a3, a4, a5, a6, a7, a8, a9 int) {
        ‹a0› = 2
        return
      }
    `));

  it("sees the first of ten parameters of a function literal", () =>
    expectOrigin(`
      var a0 = 1
      var g = func(«a0», a1, a2, a3, a4, a5, a6, a7, a8, a9 int) { use(‹a0›) }
    `));

  it("sees the first of ten parameters before a second group", () =>
    expectOrigin(`
      var a0 = 1
      func f(«a0», a1, a2, a3, a4, a5, a6, a7, a8, a9 int, s string) { use(‹a0›) }
    `));

  it("does not bind a type of a list without names", () =>
    expectOrigin(`
      type «T» int
      func f(T, int) { var v ‹T› }
    `));

  it("resolves a type in a signature outside the function", () =>
    expectOrigin(`
      type «T» int
      func f(a ‹T›) {}
    `));
});

describe("type parameters", () => {
  it("sees a function's type parameter in its parameters", () =>
    expectOrigin(`
      func F[«T» any](x ‹T›) {}
    `));

  it("sees a function's type parameter in its result", () =>
    expectOrigin(`
      func F[«T» any]() ‹T› { panic(0) }
    `));

  it("sees a function's type parameter in its body", () =>
    expectOrigin(`
      type T int
      func F[«T» any]() { var v ‹T›; use(v) }
    `));

  it("sees a type parameter declared later in the same list", () =>
    expectOrigin(`
      type E int
      func F[S ~[]‹E›, «E» any]() {}
    `));

  it("does not see a function's type parameter outside it", () =>
    expectOrigin(`
      type «T» int
      func F[T any]() {}
      var v ‹T›
    `));

  it("sees a type's type parameter in its definition", () =>
    expectOrigin(`
      type T int
      type List[«T» any] struct { items []‹T› }
    `));

  it("sees a generic type's own name in its definition", () =>
    expectOrigin(`
      type «List»[T any] struct { next *‹List›[T] }
    `));

  it("answers a generic type's name with itself, past a type parameter of that name", () =>
    expectOrigin(`
      type «‹T›»[T any] struct{}
    `));

  it("does not see a type's type parameter after its spec", () =>
    expectOrigin(`
      type «T» int
      type A[T any] []T
      var v ‹T›
    `));

  it("sees an alias's type parameter", () =>
    expectOrigin(`
      type P int
      type A[«P» any] = []‹P›
    `));

  it("sees a receiver's type parameter in the method", () =>
    expectOrigin(`
      type T int
      type List[T any] struct{}
      func (l *List[«T»]) Push(v ‹T›) {}
    `));

  it("answers a receiver's type parameter with itself", () =>
    expectOrigin(`
      type T int
      type List[T any] struct{}
      func (l *List[«‹T›»]) Len() int { return 0 }
    `));

  it("sees the type parameter of a parenthesized receiver", () =>
    expectOrigin(`
      type P int
      type List[T any] struct{}
      func (l (*List[«P»])) Push(v ‹P›) {}
    `));

  it("resolves a receiver's base type in the package", () =>
    expectOrigin(`
      type «List»[T any] struct{}
      func (l *‹List›[T]) Len() int { return 0 }
    `));

  it("does not bind a blank receiver type parameter", () =>
    expectOrigin(`
      type List[T any] struct{}
      func (List[‹_›]) Len() int { return 0 }
    `));
});

describe("blocks", () => {
  it("sees a block's declaration inside it", () =>
    expectOrigin(`
      func f() {
        x := 1
        {
          «x» := 2
          use(‹x›)
        }
        use(x)
      }
    `));

  it("does not see a block's declaration after it", () =>
    expectOrigin(`
      func f() {
        «x» := 1
        {
          x := 2
          use(x)
        }
        use(‹x›)
      }
    `));

  it("sees an if initializer in the condition", () =>
    expectOrigin(`
      var x = 0
      func f() {
        if «x» := g(); ‹x› > 0 {
        }
      }
    `));

  it("sees an if initializer in the consequence", () =>
    expectOrigin(`
      func f() {
        if «x» := g(); x > 0 {
          use(‹x›)
        }
      }
    `));

  it("sees an if initializer in an else-if and its else", () =>
    expectOrigin(`
      func f() {
        if «x» := g(); x > 0 {
        } else if y := h(); y > 0 {
        } else {
          use(‹x›)
        }
      }
    `));

  it("sees an else-if initializer in its else", () =>
    expectOrigin(`
      func f() {
        if x := g(); x > 0 {
        } else if «y» := h(); y > 0 {
        } else {
          use(‹y›)
        }
      }
    `));

  it("does not see an if initializer after the statement", () =>
    expectOrigin(`
      var «x» = 0
      func f() {
        if x := g(); x > 0 {
        }
        use(‹x›)
      }
    `));

  it("keeps an if's consequence apart from its initializer", () =>
    expectOrigin(`
      func f() {
        if x := 1; x > 0 {
          «x» := 2
          use(‹x›)
        }
      }
    `));

  it("does not see a consequence's declaration in the else", () =>
    expectOrigin(`
      func f() {
        «y» := 0
        if y > 0 {
          y := 1
          use(y)
        } else {
          use(‹y›)
        }
      }
    `));

  it("sees a for initializer in the condition", () =>
    expectOrigin(`
      var i = 0
      func f() {
        for «i» := 0; ‹i› < 3; i++ {
        }
      }
    `));

  it("sees a for initializer in the post statement", () =>
    expectOrigin(`
      func f() {
        for «i» := 0; i < 3; ‹i›++ {
        }
      }
    `));

  it("sees a for initializer in the body", () =>
    expectOrigin(`
      func f() {
        for «i» := 0; i < 3; i++ {
          use(‹i›)
        }
      }
    `));

  it("does not see a for initializer after the loop", () =>
    expectOrigin(`
      func f() {
        «i» := 9
        for i := 0; i < 3; i++ {
        }
        use(‹i›)
      }
    `));

  it("sees a range key in the body", () =>
    expectOrigin(`
      func f() {
        for «k», v := range m {
          use(‹k›, v)
        }
      }
    `));

  it("sees a range value in the body", () =>
    expectOrigin(`
      func f() {
        for k, «v» := range m {
          use(k, ‹v›)
        }
      }
    `));

  it("resolves a range expression outside the loop", () =>
    expectOrigin(`
      func f(«xs» []int) {
        for _, x := range ‹xs› {
          use(x)
        }
      }
    `));

  it("does not declare a range variable assigned with =", () =>
    expectOrigin(`
      func f() {
        var «k» int
        for k = range m {
          use(‹k›)
        }
      }
    `));

  it("sees a switch initializer in its tag", () =>
    expectOrigin(`
      func f() {
        switch «x» := g(); ‹x› {
        }
      }
    `));

  it("sees a switch initializer in a clause", () =>
    expectOrigin(`
      func f() {
        switch «x» := g(); {
        case true:
          use(‹x›)
        }
      }
    `));

  it("does not see a switch initializer after the statement", () =>
    expectOrigin(`
      var «x» = 0
      func f() {
        switch x := g(); x {
        }
        use(‹x›)
      }
    `));

  it("sees a clause's declaration in the clause", () =>
    expectOrigin(`
      func f() {
        x := 0
        switch {
        case x > 0:
          «x» := 1
          use(‹x›)
        }
      }
    `));

  it("does not see a clause's declaration in another clause", () =>
    expectOrigin(`
      func f() {
        «x» := 0
        switch {
        case true:
          x := 1
          use(x)
        default:
          use(‹x›)
        }
      }
    `));

  it("sees a type switch variable in a clause", () =>
    expectOrigin(`
      func f(v any) {
        switch «v» := v.(type) {
        case int:
          use(‹v›)
        }
      }
    `));

  it("sees a type switch variable in the default clause", () =>
    expectOrigin(`
      func f(v any) {
        switch «v» := v.(type) {
        default:
          use(‹v›)
        }
      }
    `));

  it("sees a type switch initializer in a clause", () =>
    expectOrigin(`
      var x = 0
      func f(v any) {
        switch «x» := g(); v.(type) {
        case int:
          use(‹x›)
        }
      }
    `));

  it("does not see a type switch initializer after the switch", () =>
    expectOrigin(`
      var «x» = 0
      func f(v any) {
        switch x := g(); v.(type) {
        case int:
          use(x)
        }
        use(‹x›)
      }
    `));

  it("resolves a type switch's operand outside its clauses", () =>
    expectOrigin(`
      func f(«v» any) {
        switch v := ‹v›.(type) {
        case int:
          use(v)
        }
      }
    `));

  it("does not see a type switch variable after the switch", () =>
    expectOrigin(`
      func f(«v» any) {
        switch v := v.(type) {
        case int:
          use(v)
        }
        use(‹v›)
      }
    `));

  it("resolves a type in a type switch clause", () =>
    expectOrigin(`
      type «T» int
      func f(v any) {
        switch v := v.(type) {
        case ‹T›:
          use(v)
        }
      }
    `));

  it("sees a received value in its select clause", () =>
    expectOrigin(`
      func f(ch chan int) {
        select {
        case «v» := <-ch:
          use(‹v›)
        }
      }
    `));

  it("does not see a received value in another select clause", () =>
    expectOrigin(`
      var «v» = 0
      func f(ch chan int) {
        select {
        case v := <-ch:
          use(v)
        default:
          use(‹v›)
        }
      }
    `));

  it("does not declare a received value assigned with =", () =>
    expectOrigin(`
      func f(ch chan int) {
        var «v» int
        select {
        case v = <-ch:
          use(‹v›)
        }
      }
    `));
});

describe("declarations in a function", () => {
  it("sees a variable after its declaration", () =>
    expectOrigin(`
      var x = 0
      func f() {
        «x» := 1
        use(‹x›)
      }
    `));

  it("sees a var declaration", () =>
    expectOrigin(`
      func f() {
        var a, «b» int
        use(a, ‹b›)
      }
    `));

  it("sees a const declaration", () =>
    expectOrigin(`
      func f() {
        const «c» = 1
        use(‹c›)
      }
    `));

  it("sees a local type", () =>
    expectOrigin(`
      type T int
      func f() {
        type «T» string
        var v ‹T›
        use(v)
      }
    `));

  it("sees a local type inside its own spec", () =>
    expectOrigin(`
      type T int
      func f() {
        type «T» struct { next *‹T› }
      }
    `));

  it("answers a declaration with itself where it shadows", () =>
    expectOrigin(`
      func f(x int) {
        if true {
          «‹x›» := x + 1
          use(x)
        }
      }
    `));

  it("resolves a second := of a name to the first", () =>
    expectOrigin(`
      func f() {
        a, «err» := g()
        b, err := h()
        use(a, b, ‹err›)
      }
    `));

  it("answers the identifier of a second := with the first", () =>
    expectOrigin(`
      func f() {
        a, «err» := g()
        b, ‹err› := h()
        use(a, b)
      }
    `));

  it("declares a new variable with := in a nested block", () =>
    expectOrigin(`
      func f(err error) {
        if true {
          v, «err» := g()
          use(v, ‹err›)
        }
      }
    `));

  it("declines a name used in its own short declaration", () =>
    expectUnsupported(
      `
      func f(x int) {
        if true {
          x := ‹x› + 1
          use(x)
        }
      }
    `,
      ORDER,
    ));

  it("declines a name used in its own var declaration", () =>
    expectUnsupported(
      `
      func f(x int) {
        {
          var x = ‹x›
          use(x)
        }
      }
    `,
      ORDER,
    ));

  it("declines a name used before a later declaration in its block", () =>
    expectUnsupported(
      `
      func f() {
        x := 1
        {
          use(‹x›)
          x := 2
          use(x)
        }
      }
    `,
      ORDER,
    ));

  it("declines a name used in a function literal before its declaration", () =>
    expectUnsupported(
      `
      var x = 0
      func f() {
        g := func() { use(‹x›) }
        x := 1
        use(g, x)
      }
    `,
      ORDER,
    ));

  it("declines a type used before its local declaration", () =>
    expectUnsupported(
      `
      type T int
      func f() {
        var v ‹T›
        type T string
        use(v)
      }
    `,
      ORDER,
    ));

  it("declines a range expression with the name of a range variable", () =>
    expectUnsupported(
      `
      func f(x []int) {
        for _, x := range ‹x› {
          use(x)
        }
      }
    `,
      ORDER,
    ));

  it("declines a name in a signature that a parameter also has", () =>
    expectUnsupported(
      `
      import url "net/url"
      func f(url *‹url›.URL) {}
    `,
      ORDER,
    ));

  it("resolves a name in a signature that no parameter has", () =>
    expectFrontier(
      `
      import url "net/url"
      func f(u *‹url›.URL) {}
    `,
      "net/url",
    ));

  it("declines a name in a function type that one of its parameters has", () =>
    expectUnsupported(
      `
      const n = 1
      var fn func(n int, b [‹n›]int)
    `,
      ORDER,
    ));

  it("declines a receiver's base type with the name of its type parameter", () =>
    expectUnsupported(
      `
      type T[P any] struct{}
      func (r ‹T›[T]) m() {}
    `,
      ORDER,
    ));

  it("declines a type switch guard", () =>
    expectUnsupported(
      `
      func f(v any) {
        switch ‹v› := v.(type) {
        case int:
          use(v)
        }
      }
    `,
      GUARD,
    ));
});

describe("references", () => {
  it("does not resolve a selected field or method", () =>
    expectOrigin(`
      var y = 1
      func f(x T) { use(x.‹y›) }
    `));

  it("resolves the operand of a selector", () =>
    expectOrigin(`
      func f(«x» T) { use(‹x›.y) }
    `));

  it("does not resolve a struct field's name", () =>
    expectOrigin(`
      var a = 1
      type T struct { ‹a› int }
    `));

  it("resolves a struct field's type", () =>
    expectOrigin(`
      type «A» int
      type T struct { a ‹A› }
    `));

  it("resolves an embedded field to its type", () =>
    expectOrigin(`
      type «A» int
      type T struct { ‹A› }
    `));

  it("does not resolve a method's name at its declaration", () =>
    expectOrigin(`
      var m = 1
      func (T) ‹m›() {}
    `));

  it("does not resolve an interface method's name", () =>
    expectOrigin(`
      var m = 1
      type I interface { ‹m›() }
    `));

  it("does not resolve the type of a qualified type", () =>
    expectOrigin(`
      import pk "x/pk"
      type T int
      var v pk.‹T›
    `));

  it("does not resolve the package clause", async () => {
    const { source, reference } = parseMarks("package ‹p›\nvar p = 1\n");
    expect(await origin(source, reference)).toBeUndefined();
  });

  it("does not resolve a label", () =>
    expectOrigin(`
      func f() {
        L := 1
        use(L)
      L:
        for {
          break ‹L›
        }
      }
    `));

  it("resolves a variable that shares its name with a label", () =>
    expectOrigin(`
      func f() {
        «L» := 1
      L:
        for {
          use(‹L›)
          break L
        }
      }
    `));

  it("resolves a type in a conversion", () =>
    expectOrigin(`
      type «T» int
      var v = ‹T›(1)
    `));

  it("resolves an instantiated function", () =>
    expectOrigin(`
      func «F»[T any]() {}
      var g = ‹F›[int]
    `));

  it("resolves a type argument", () =>
    expectOrigin(`
      type «T» int
      func F[P any]() {}
      var g = F[‹T›]
    `));
});

// `true`, `false`, `nil` and `iota` are predeclared names, not keywords
describe("predeclared names a program declares again", () => {
  it("does not resolve a predeclared name", () =>
    expectOrigin(`
      func f() { use(‹nil›) }
    `));

  it("sees a parameter named true", () =>
    expectOrigin(`
      func f(«true» bool) { use(‹true›) }
    `));

  it("sees a short variable declaration of nil", () =>
    expectOrigin(`
      func f() {
        «nil» := 1
        use(‹nil›)
      }
    `));

  it("sees a range variable named iota", () =>
    expectOrigin(`
      func f(xs []int) {
        for «iota» := range xs { use(‹iota›) }
      }
    `));

  it("sees a received value named false", () =>
    expectOrigin(`
      func f(ch chan int) {
        select {
        case «false» := <-ch:
          use(‹false›)
        }
      }
    `));

  it("sees a type switch guard named true in a clause", () =>
    expectOrigin(`
      func f(x any) {
        switch «true» := x.(type) {
        case int:
          use(‹true›)
        }
      }
    `));

  it("declines a use of nil before its declaration in the block", () =>
    expectUnsupported(
      `
      func f() {
        use(‹nil›)
        nil := 1
        use(nil)
      }
    `,
      ORDER,
    ));
});

describe("composite literal keys", () => {
  it("does not resolve a key of a struct type literal", () =>
    expectOrigin(`
      var a = 1
      var v = struct{ a int }{‹a›: 1}
    `));

  it("resolves a key of a map literal", () =>
    expectOrigin(`
      var «k» = "x"
      var m = map[string]int{‹k›: 1}
    `));

  it("resolves an index of an array literal", () =>
    expectOrigin(`
      const «i» = 1
      var a = [...]string{‹i›: "x"}
    `));

  it("resolves an index of a slice literal", () =>
    expectOrigin(`
      const «i» = 1
      var a = []string{‹i›: "x"}
    `));

  it("declines a key of a literal of a named type", () =>
    expectUnsupported(
      `
      var a = 1
      var v = T{‹a›: 1}
    `,
      KEY,
    ));

  it("declines a key of a literal of a qualified type", () =>
    expectUnsupported(
      `
      import pk "x/pk"
      var a = 1
      var v = pk.T{‹a›: 1}
    `,
      KEY,
    ));

  it("declines a key of a literal of a generic type", () =>
    expectUnsupported(
      `
      var a = 1
      var v = T[int]{‹a›: 1}
    `,
      KEY,
    ));

  it("resolves the value of a keyed element", () =>
    expectOrigin(`
      var «a» = 1
      var v = T{b: ‹a›}
    `));

  it("resolves an element without a key", () =>
    expectOrigin(`
      var «a» = 1
      var v = T{‹a›}
    `));

  it("does not resolve a key of an elided struct type", () =>
    expectOrigin(`
      var a = 1
      var v = []struct{ a int }{{‹a›: 1}}
    `));

  it("does not resolve a key behind an elided pointer", () =>
    expectOrigin(`
      var a = 1
      var v = []*struct{ a int }{{‹a›: 1}}
    `));

  it("does not resolve a key of a parenthesized struct type", () =>
    expectOrigin(`
      var a = 1
      var v = [](struct{ a int }){{‹a›: 1}}
    `));

  it("does not resolve a key in an elided map key of struct type", () =>
    expectOrigin(`
      var a = 1
      var v = map[struct{ a int }]string{{‹a›: 1}: "x"}
    `));

  it("resolves a key of an elided map type", () =>
    expectOrigin(`
      var «k» = "x"
      var v = []map[string]int{{‹k›: 1}}
    `));

  it("resolves an index in the elided value of a map", () =>
    expectOrigin(`
      const «i» = 1
      var v = map[string][]int{"x": {‹i›: 1}}
    `));

  it("declines a key of an elided named type", () =>
    expectUnsupported(
      `
      var a = 1
      var v = []T{{‹a›: 1}}
    `,
      KEY,
    ));

  it("declines a key in an elided element of a named type's literal", () =>
    expectUnsupported(
      `
      var a = 1
      var v = T{{‹a›: 1}}
    `,
      KEY,
    ));
});

describe("imports", () => {
  it("resolves a named import to its path", () =>
    expectFrontier(
      `
      import f "fmt"
      func g() { ‹f›.Println() }
    `,
      "fmt",
    ));

  it("resolves a named import in a group", () =>
    expectFrontier(
      `
      import (
        "os"
        f "fmt"
      )
      func g() { ‹f›.Println() }
    `,
      "fmt",
    ));

  it("answers an import's name with its path", () =>
    expectFrontier(
      `
      import ‹f› "fmt"
    `,
      "fmt",
    ));

  it("resolves the package of a qualified type", () =>
    expectFrontier(
      `
      import pk "x/pk"
      var v ‹pk›.T
    `,
      "x/pk",
    ));

  it("declines the assumed name of an import without a name", () =>
    expectUnsupported(
      `
      import "fmt"
      func g() { ‹fmt›.Println() }
    `,
      PACKAGE_NAME,
    ));

  it("assumes the last element of the path", () =>
    expectUnsupported(
      `
      import "net/http"
      var v ‹http›.Client
    `,
      PACKAGE_NAME,
    ));

  it("assumes the element before a major version", () =>
    expectUnsupported(
      `
      import "math/rand/v2"
      func g() { ‹rand›.Int() }
    `,
      PACKAGE_NAME,
    ));

  it("assumes a name without what follows a dot", () =>
    expectUnsupported(
      `
      import "gopkg.in/yaml.v3"
      func g() { ‹yaml›.Marshal(0) }
    `,
      PACKAGE_NAME,
    ));

  it("assumes a name without a go- prefix", () =>
    expectUnsupported(
      `
      import "example.com/x/go-foo"
      func g() { ‹foo›.Bar() }
    `,
      PACKAGE_NAME,
    ));

  it("resolves a local name that an import is assumed to bind", () =>
    expectOrigin(`
      import "fmt"
      func g(«fmt» int) { use(‹fmt›) }
    `));

  it("resolves a package-level name that an import is assumed to bind", () =>
    expectOrigin(`
      import "example.com/x/config"
      var «config» = 1
      func g() { use(‹config›) }
    `));

  it("does not resolve a name no import is assumed to bind", () =>
    expectOrigin(`
      import "fmt"
      func g() { ‹other›.Println() }
    `));

  it("binds nothing for a blank import", () =>
    expectOrigin(`
      import _ "embed"
      func g() { ‹embed›.X() }
    `));

  it("binds nothing for a dot import", () =>
    expectOrigin(`
      import . "math"
      func g() { use(‹Pi›, math) }
    `));
});

// What the core model cannot express yet (SCOPING.md §7). The plugin declines
// each of these positions or leaves it unanswered; the right answer is pinned
// here and must pass once core can give it.
describe("not expressed by the core model", () => {
  describe("G1: a name is visible from a point in its block", () => {
    it.fails("resolves a name used in its own short declaration", () =>
      expectOrigin(`
        func f(«x» int) {
          if true {
            x := ‹x› + 1
            use(x)
          }
        }
      `),
    );

    it.fails("resolves a name used before a later declaration", () =>
      expectOrigin(`
        func f() {
          «x» := 1
          {
            use(‹x›)
            x := 2
            use(x)
          }
        }
      `),
    );

    it.fails("resolves a name used in an earlier function literal", () =>
      expectOrigin(`
        var «x» = 0
        func f() {
          g := func() { use(‹x›) }
          x := 1
          use(g, x)
        }
      `),
    );

    it.fails("resolves a type used before its local declaration", () =>
      expectOrigin(`
        type «T» int
        func f() {
          var v ‹T›
          type T string
          use(v)
        }
      `),
    );

    it.fails("resolves a range expression named like a range variable", () =>
      expectOrigin(`
        func f(«x» []int) {
          for _, x := range ‹x› {
            use(x)
          }
        }
      `),
    );

    it.fails("resolves a package in a signature past a parameter", () =>
      expectFrontier(
        `
        import url "net/url"
        func f(url *‹url›.URL) {}
      `,
        "net/url",
      ),
    );

    it.fails("resolves a name in a function type past its parameter", () =>
      expectOrigin(`
        const «n» = 1
        var fn func(n int, b [‹n›]int)
      `),
    );

    it.fails("resolves a receiver's base type past its type parameter", () =>
      expectOrigin(`
        type «T»[P any] struct{}
        func (r ‹T›[T]) m() {}
      `),
    );
  });

  describe("G2: an import without a name", () => {
    it.fails("resolves the package's name to the import", () =>
      expectFrontier(
        `
        import "fmt"
        func g() { ‹fmt›.Println() }
      `,
        "fmt",
      ),
    );
  });

  describe("G3: the package block spans the files of a package", () => {
    it.fails("resolves a name declared in another file", async () => {
      const workspace = await Workspace.create(config);
      workspace.openSource("a.go", "package p\nvar shared = 1\n");
      const source = "package p\nfunc f() { use(shared) }\n";
      workspace.openSource("b.go", source);

      const resolved = workspace.origin("b.go", source.indexOf("shared"));
      expect(resolved).toBeDefined();
    });
  });
});
