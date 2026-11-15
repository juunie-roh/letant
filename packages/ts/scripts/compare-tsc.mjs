// Acceptance check for the scoping rules (ADR 0006): every name the
// TypeScript compiler resolves by walking scopes must resolve, through
// Workspace.origin, to one of the declarations the compiler names for the
// meaning the position asks for — and every identifier the compiler finds no
// declaration for by that walk (a property, a member of a qualified name, an
// unbound name) must resolve to nothing. A reference the plugin declines
// (ADR 0007) is counted apart, under its rule, with whether the tree would
// have answered it correctly.
//
// Each file is compiled alone, without the standard library: names from other
// files and from the library have no declaration to land on.
//
// Usage: pnpm ts compare [paths...] [--files <n>] [--seed <n>] [--verbose]
//   paths     files or directories to compare (default: this repository's
//             own sources)
//   --files   how many files to sample from directories (default: 200)
//   --seed    sampling seed (default: 42)
//   --verbose list every disagreement instead of the first 20
//
// Requires `letant` and `@letant/ts` to be built. The compiler's own lexical
// walk (`resolveName`) and the meaning of a position or a declaration
// (`getMeaningFromLocation`, `getMeaningFromDeclaration`) are internal API:
// the `typescript` version is the one this package depends on.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { TreeCursor, Workspace } from "letant";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const plugin = path.resolve(here, "../dist/index.mjs");
const { default: descriptor } = await import(plugin);

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    files: { type: "string", default: "200" },
    seed: { type: "string", default: "42" },
    verbose: { type: "boolean", default: false },
  },
});

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const MIN_SIZE = 512;
const MAX_SIZE = 200 * 1024;
// identifier-like node types the compiler has an opinion about; private names
// are left out because they are not looked up by the scope walk
const IDENTIFIERS = new Set([
  "identifier",
  "type_identifier",
  "property_identifier",
  "shorthand_property_identifier",
  "shorthand_property_identifier_pattern",
  "statement_identifier",
]);
const IMPORTS = new Set([
  ts.SyntaxKind.ImportSpecifier,
  ts.SyntaxKind.ImportClause,
  ts.SyntaxKind.NamespaceImport,
]);
const COMPILER_OPTIONS = {
  noLib: true,
  noResolve: true,
  types: [],
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.Preserve,
  experimentalDecorators: true,
};

/**
 * Source files under a directory. Build output is not entered, and neither
 * are dependencies, unless the directory itself is inside them.
 */
function* sources(directory, vendored) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" && !vendored) continue;
      if (entry.name === "node_modules" && !vendored) continue;
      yield* sources(file, vendored);
    } else if (entry.isFile() && EXTENSIONS.includes(path.extname(file))) {
      const { size } = statSync(file);
      if (size >= MIN_SIZE && size <= MAX_SIZE) yield file;
    }
  }
}

function sample(directory, count, seed) {
  const vendored = directory.split(path.sep).includes("node_modules");
  const files = [...sources(directory, vendored)].sort();

  // seeded shuffle over a sorted list, so a seed always picks the same files
  let state = seed;
  const random = () =>
    (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }
  return files.slice(0, count);
}

/** The file compiled alone; `undefined` when the compiler rejects its syntax. */
function compile(fileName, source) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    true,
  );
  const program = ts.createProgram([fileName], COMPILER_OPTIONS, {
    getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    getCurrentDirectory: () => path.dirname(fileName),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name === fileName,
    readFile: () => undefined,
    writeFile: () => {},
  });
  if (program.getSyntacticDiagnostics(sourceFile).length > 0) return undefined;
  return { sourceFile, checker: program.getTypeChecker() };
}

const flagsOf = (meaning) =>
  (meaning & ts.SemanticMeaning.Value ? ts.SymbolFlags.Value : 0) |
  (meaning & ts.SemanticMeaning.Type ? ts.SymbolFlags.Type : 0) |
  (meaning & ts.SemanticMeaning.Namespace ? ts.SymbolFlags.Namespace : 0);

const isGlobalAugmentation = (declaration) => {
  for (let node = declaration; node; node = node.parent) {
    if (node.flags & ts.NodeFlags.GlobalAugmentation) return true;
  }
  return false;
};

/**
 * What the compiler says about an identifier: `undefined` for a declaration's
 * own name, which is not compared; otherwise the declarations a scope walk
 * lands on, empty when the name is not found that way.
 */
function expectation(checker, sourceFile, node) {
  let located;
  if (
    ts.isShorthandPropertyAssignment(node.parent) &&
    node.parent.name === node
  ) {
    located = checker.getShorthandAssignmentValueSymbol(node.parent);
  } else if (ts.isDeclarationName(node)) {
    return undefined;
  } else {
    located = checker.getSymbolAtLocation(node);
  }

  const meaning = ts.getMeaningFromLocation(node);
  const walked = checker.resolveName(node.text, node, flagsOf(meaning), false);
  // a member is found through its owner, not by the walk, even where the
  // walk would find the same declaration
  if (
    !located ||
    located !== walked ||
    ts.isRightSideOfQualifiedNameOrPropertyAccess(node)
  ) {
    return { declarations: [] };
  }

  const all = located.declarations ?? [];
  const meant = all.filter(
    (declaration) => ts.getMeaningFromDeclaration(declaration) & meaning,
  );
  const declarations = meant.length > 0 ? meant : all;

  return {
    declarations: declarations.map((declaration) =>
      (ts.getNameOfDeclaration(declaration) ?? declaration).getStart(
        sourceFile,
      ),
    ),
    imported: declarations.some(
      (declaration) =>
        IMPORTS.has(declaration.kind) ||
        (ts.isImportEqualsDeclaration(declaration) &&
          ts.isExternalModuleReference(declaration.moduleReference)),
    ),
    // declared for the global scope, which no file's tree holds
    global: declarations.every(isGlobalAugmentation),
  };
}

const isUnsupported = (resolved) =>
  typeof resolved === "object" &&
  resolved !== null &&
  "unsupported" in resolved;

function* walk(node) {
  yield node;
  for (const child of node.children) yield* walk(child);
}

const targets = positionals.length
  ? positionals.map((p) => path.resolve(p))
  : [path.join(repo, "src"), path.join(repo, "packages")];
const files = targets.flatMap((target) =>
  statSync(target).isDirectory()
    ? sample(target, Number(options.files), Number(options.seed))
    : [target],
);

const total = {
  files: 0,
  skipped: 0,
  references: 0,
  agreed: 0,
  unsupported: 0,
  unsupportedButRight: 0,
  wrong: 0,
  missing: 0,
  extra: 0,
  nonReferences: 0,
  falselyResolved: 0,
};
const declined = {};
const disagreements = [];

for (const [index, file] of files.entries()) {
  if (index % 10 === 0) {
    process.stderr.write(`\r${index}/${files.length} files`);
  }

  const source = readFileSync(file, "utf8");
  const { root } = path.parse(file);
  const relative = path.relative(root, file);
  const workspace = await Workspace.create({
    rootDir: root,
    plugins: [{ name: plugin, extensions: EXTENSIONS }],
  });

  let compiled;
  let parsed;
  try {
    compiled = compile(file, source);
    parsed = workspace.openSource(relative, source);
  } catch {
    compiled = undefined;
  }
  if (!compiled) {
    // one of the two parsers rejects the file — nothing to compare
    total.skipped++;
    workspace.destroy();
    continue;
  }
  total.files++;
  const { checker, sourceFile } = compiled;
  const tree = parsed.tsTree;

  const report = (verdict, name, offset, expected, resolved) => {
    total[verdict]++;
    const line = source.slice(0, offset).split("\n").length;
    disagreements.push(
      `${verdict.padEnd(15)} ${name} at ${file}:${line} — expected ${
        expected?.length
          ? `declaration at offset ${expected.join(" or ")}`
          : "nothing"
      }, got ${
        resolved === undefined
          ? "nothing"
          : typeof resolved === "string"
            ? `"${resolved}"`
            : `${resolved.path.join("/")} at offset ${resolved.node.at.startIndex}`
      }`,
    );
  };

  const seen = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text !== "") {
      const offset = node.getStart(sourceFile);
      seen.add(offset);

      const expected = expectation(checker, sourceFile, node);
      if (expected) {
        total.references++;
        const resolved = workspace.origin(relative, offset);
        const { declarations } = expected;

        if (isUnsupported(resolved)) {
          total.unsupported++;
          declined[resolved.unsupported] =
            (declined[resolved.unsupported] ?? 0) + 1;
          // what the tree would have answered, had the plugin not declined
          const at = tree.rootNode.descendantForIndex(offset);
          const answer = TreeCursor.at(parsed.tree, offset).resolve(
            node.text,
            descriptor.spacesOf(at),
          )?.node.at;
          if (
            answer === undefined
              ? declarations.length === 0 || expected.global
              : expected.imported || declarations.includes(answer.startIndex)
          ) {
            total.unsupportedButRight++;
          }
        } else if (declarations.length === 0) {
          if (resolved === undefined) total.agreed++;
          else report("extra", node.text, offset, null, resolved);
        } else if (resolved === undefined) {
          if (expected.global) total.agreed++;
          else report("missing", node.text, offset, declarations);
        } else if (
          // an import counts wherever it stops: cross-file resolution is not
          // part of this comparison
          expected.imported ||
          (typeof resolved !== "string" &&
            declarations.includes(resolved.node.at.startIndex))
        ) {
          total.agreed++;
        } else {
          report("wrong", node.text, offset, declarations, resolved);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const node of walk(tree.rootNode)) {
    if (!IDENTIFIERS.has(node.type) || seen.has(node.startIndex)) continue;
    total.nonReferences++;

    const resolved = workspace.origin(relative, node.startIndex);
    if (resolved !== undefined && !isUnsupported(resolved)) {
      report("falselyResolved", node.text, node.startIndex, null, resolved);
    }
  }

  workspace.destroy();
}

process.stderr.write(`\r${files.length}/${files.length} files\n`);
console.log(total);
console.log({ declined });

const shown = options.verbose ? disagreements : disagreements.slice(0, 20);
for (const line of shown) console.log(line);
if (shown.length < disagreements.length) {
  console.log(`… ${disagreements.length - shown.length} more (--verbose)`);
}

process.exitCode = disagreements.length === 0 ? 0 : 1;
