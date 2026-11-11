// Acceptance check for the scoping rules (ADR 0006): every reference
// eslint-scope finds must resolve, through Workspace.origin, to a declaration
// eslint-scope names — and every identifier it does not treat as a reference
// or a declaration must resolve to nothing.
//
// Usage: pnpm js compare [paths...] [--files <n>] [--seed <n>] [--verbose]
//   paths     files or directories to compare (default: node_modules/.pnpm)
//   --files   how many files to sample from directories (default: 200)
//   --seed    sampling seed (default: 42)
//   --verbose list every disagreement instead of the first 20
//
// Requires `letant` and `@letant/js` to be built. eslint-scope and espree are
// taken from the workspace's eslint installation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { Workspace } from "letant";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const plugin = path.resolve(here, "../dist/index.mjs");

const fromEslint = createRequire(
  createRequire(path.join(repo, "package.json")).resolve("eslint"),
);
const load = (name) => import(pathToFileURL(fromEslint.resolve(name)).href);
const espree = await load("espree");
const eslintScope = await load("eslint-scope");

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    files: { type: "string", default: "200" },
    seed: { type: "string", default: "42" },
    verbose: { type: "boolean", default: false },
  },
});

const EXTENSIONS = [".js", ".mjs", ".cjs"];
const MIN_SIZE = 1024;
const MAX_SIZE = 3 * 1024 * 1024;
// identifier-like node types eslint-scope has an opinion about; private names
// are left out because it does not track them
const IDENTIFIERS = new Set([
  "identifier",
  "property_identifier",
  "shorthand_property_identifier",
  "shorthand_property_identifier_pattern",
  "statement_identifier",
]);

function sample(directory, count, seed) {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => {
      if (!EXTENSIONS.includes(path.extname(file))) return false;
      const { size } = statSync(file);
      return size >= MIN_SIZE && size <= MAX_SIZE;
    })
    .sort();

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

function analyze(source) {
  const parse = (sourceType) =>
    espree.parse(source, {
      ecmaVersion: "latest",
      sourceType,
      range: true,
      ecmaFeatures: { jsx: true, globalReturn: sourceType === "script" },
    });

  let ast;
  let sourceType = "module";
  try {
    ast = parse("module");
  } catch {
    sourceType = "script";
    ast = parse("script");
  }

  return eslintScope.analyze(ast, {
    ecmaVersion: 2025,
    sourceType,
    ignoreEval: true,
    // top-level names of a script resolve statically, as in a module
    nodejsScope: sourceType === "script",
  });
}

function* walk(node) {
  yield node;
  for (const child of node.children) yield* walk(child);
}

const targets = positionals.length
  ? positionals.map((p) => path.resolve(p))
  : [path.join(repo, "node_modules/.pnpm")];
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
  wrong: 0,
  missing: 0,
  extra: 0,
  nonReferences: 0,
  falselyResolved: 0,
};
const disagreements = [];

for (const [index, file] of files.entries()) {
  if (index % 25 === 0) {
    process.stderr.write(`\r${index}/${files.length} files`);
  }

  const source = readFileSync(file, "utf8");
  const { root } = path.parse(file);
  const relative = path.relative(root, file);
  const workspace = await Workspace.create({
    rootDir: root,
    plugins: [{ name: plugin, extensions: EXTENSIONS }],
  });

  let scopes;
  let tree;
  try {
    scopes = analyze(source).scopes;
    tree = workspace.openSource(relative, source).tsTree;
  } catch {
    // one of the two parsers rejects the file — nothing to compare
    total.skipped++;
    continue;
  }
  total.files++;

  const report = (verdict, name, offset, expected, resolved) => {
    total[verdict]++;
    const line = source.slice(0, offset).split("\n").length;
    disagreements.push(
      `${verdict.padEnd(15)} ${name} at ${file}:${line} — expected ${
        expected ? `declaration at offset ${expected.join(" or ")}` : "nothing"
      }, got ${
        resolved === undefined
          ? "nothing"
          : typeof resolved === "string"
            ? `"${resolved}"`
            : `${resolved.path.join("/")} at offset ${resolved.node.at.startIndex}`
      }`,
    );
  };

  const known = new Set();
  for (const scope of scopes) {
    for (const variable of scope.variables) {
      for (const definition of variable.defs) {
        if (definition.name?.range) known.add(definition.name.range[0]);
      }
    }

    for (const reference of scope.references) {
      const offset = reference.identifier.range[0];
      known.add(offset);

      const definitions = reference.resolved?.defs;
      // implicit `arguments` has no declaration to compare
      if (definitions?.length === 0) continue;
      total.references++;

      const expected = definitions?.map((d) => d.name.range[0]);
      const resolved = workspace.origin(relative, offset);

      if (!expected) {
        if (resolved === undefined) total.agreed++;
        else report("extra", reference.identifier.name, offset, null, resolved);
      } else if (resolved === undefined) {
        report("missing", reference.identifier.name, offset, expected);
      } else if (
        // an import counts wherever it stops: cross-file resolution is not
        // part of this comparison
        definitions.some((d) => d.type === "ImportBinding") ||
        (typeof resolved !== "string" &&
          expected.includes(resolved.node.at.startIndex))
      ) {
        total.agreed++;
      } else {
        report("wrong", reference.identifier.name, offset, expected, resolved);
      }
    }
  }

  for (const node of walk(tree.rootNode)) {
    if (!IDENTIFIERS.has(node.type) || known.has(node.startIndex)) continue;
    total.nonReferences++;

    const resolved = workspace.origin(relative, node.startIndex);
    if (resolved !== undefined) {
      report("falselyResolved", node.text, node.startIndex, null, resolved);
    }
  }

  workspace.destroy();
}

process.stderr.write(`\r${files.length}/${files.length} files\n`);
console.log(total);

const shown = options.verbose ? disagreements : disagreements.slice(0, 20);
for (const line of shown) console.log(line);
if (shown.length < disagreements.length) {
  console.log(`… ${disagreements.length - shown.length} more (--verbose)`);
}

process.exitCode = disagreements.length === 0 ? 0 : 1;
