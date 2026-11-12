// Acceptance check for the scoping rules (ADR 0006): every name CPython's own
// symbol table resolves must resolve, through letant, to a binding in the same
// scope — and an attribute or a keyword argument's name must resolve to
// nothing. A reference the plugin declines (ADR 0007) is counted apart, with
// whether the tree would have answered it correctly. The reference side is
// scripts/symtable_reference.py.
//
// Usage: pnpm --filter @letant/python compare [paths...] [--files <n>] [--seed <n>] [--python <exe>] [--verbose]
//   paths     files or directories to compare (default: the interpreter's
//             standard library)
//   --files   how many files to sample from directories (default: 200)
//   --seed    sampling seed (default: 42)
//   --python  a Python 3.14 or later interpreter (default: $PYTHON, else python3)
//   --verbose list every disagreement instead of the first 20
//
// Requires `letant` and `@letant/python` to be built.
import { execFileSync, spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { TreeCursor, Workspace } from "letant";

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.resolve(here, "../dist/index.mjs");
const reference = path.join(here, "symtable_reference.py");

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    files: { type: "string", default: "200" },
    seed: { type: "string", default: "42" },
    python: { type: "string", default: process.env.PYTHON ?? "python3" },
    verbose: { type: "boolean", default: false },
  },
});

const DEFINITIONS = new Set([
  "function_definition",
  "class_definition",
  "type_alias_statement",
]);

function sample(directory, count, seed) {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".py"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    // packages installed beside the standard library are not part of it
    .filter((file) => !file.split(path.sep).includes("site-packages"))
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

/** The scope a resolved binding lies in, named as the reference names it. */
function scopeOf(cursor, tsTree) {
  if (cursor.path.length === 2) return { id: "module" };

  const scope = cursor.parent();
  const { kind } = scope.node;
  const start = Number(scope.name.slice(scope.name.lastIndexOf("@") + 1));
  if (kind !== "generic") return { id: String(start), kind };

  // the reference names a type parameter scope after its definition
  let owner = tsTree.rootNode.descendantForIndex(start);
  while (!DEFINITIONS.has(owner.type)) owner = owner.parent;
  return { id: `g${owner.startIndex}`, kind };
}

/** Which rule of SCOPING.md §7 a disagreement falls under, if any. */
function classify({ context, expected, got, node }) {
  if (node.type === "type") {
    return "grammar: `type(x).attr = …` parses as a type alias";
  }
  if (expected === "!") return "falsely resolved: not a name";
  if (context === "first-iterable" && got.kind !== "class") {
    return "M2: the first iterable of a comprehension";
  }
  if (got.kind === "class") return "M1: a class scope seen from a nested scope";
  return "other";
}

const stdlib = () =>
  execFileSync(
    options.python,
    ["-c", "import sysconfig; print(sysconfig.get_paths()['stdlib'])"],
    { encoding: "utf8" },
  ).trim();

const targets = positionals.length
  ? positionals.map((p) => path.resolve(p))
  : [stdlib()];
const files = targets.flatMap((target) =>
  statSync(target).isDirectory()
    ? sample(target, Number(options.files), Number(options.seed))
    : [target],
);

const total = {
  files: 0,
  skipped: 0,
  names: 0,
  agreed: 0,
  // a parameter's declaration lies outside its scope's region (SCOPING.md M2)
  notOffered: 0,
  // declined by the plugin (SCOPING.md §7), and how many of those the tree
  // would have answered correctly
  unsupported: 0,
  unsupportedButRight: 0,
  disagreed: 0,
};
const categories = {};
const declined = {};
const disagreements = [];

const { nameOf } = (await import(plugin)).default;

const python = spawn(options.python, [reference], {
  stdio: ["pipe", "pipe", "inherit"],
});
python.stdin.end(files.join("\n"));

for await (const line of createInterface({ input: python.stdout })) {
  const { file, names, skip } = JSON.parse(line);
  const done = total.files + total.skipped;
  if (done % 25 === 0) process.stderr.write(`\r${done}/${files.length} files`);

  const { root } = path.parse(file);
  const relative = path.relative(root, file);
  const workspace = await Workspace.create({
    rootDir: root,
    plugins: [{ name: plugin, extensions: [".py"] }],
  });

  let parsed;
  try {
    if (skip) throw new Error(skip);
    parsed = workspace.openSource(relative, readFileSync(file, "utf8"));
  } catch {
    // one of the two parsers rejects the file — nothing to compare
    total.skipped++;
    continue;
  }
  total.files++;

  for (const [offset, name, expected, context] of names) {
    total.names++;
    const node = parsed.tsTree.rootNode.descendantForIndex(offset);

    // `origin` answers nothing for a position that is not a reference, and
    // with a module path for an import: that binding is read off the tree
    const origin = workspace.origin(relative, offset);
    const onTree = () =>
      TreeCursor.at(parsed.tree, offset).resolve(nameOf(node));

    if (typeof origin === "object" && "unsupported" in origin) {
      total.unsupported++;
      declined[origin.unsupported] = (declined[origin.unsupported] ?? 0) + 1;
      const cursor = onTree();
      const id = cursor ? scopeOf(cursor, parsed.tsTree).id : null;
      if (id === expected) total.unsupportedButRight++;
      continue;
    }

    const cursor = typeof origin === "string" ? onTree() : origin;
    const got = cursor ? scopeOf(cursor, parsed.tsTree) : { id: null };

    if (got.id === (expected === "!" ? null : expected)) {
      total.agreed++;
      continue;
    }

    if (context === "parameter" && got.id === null) {
      total.notOffered++;
      continue;
    }

    total.disagreed++;
    const category = classify({ context, expected, got, node });
    categories[category] = (categories[category] ?? 0) + 1;
    const { row, column } = node.startPosition;
    disagreements.push(
      `${name} at ${file}:${row + 1}:${column + 1} — expected ${
        expected === "!" ? "not a name" : (expected ?? "nothing")
      }, got ${got.id ?? "nothing"}${got.kind ? ` (${got.kind})` : ""} — ${category}`,
    );
  }

  workspace.destroy();
}

process.stderr.write(`\r${files.length}/${files.length} files\n`);
console.log(total);
console.log({ declined, disagreements: categories });

const shown = options.verbose ? disagreements : disagreements.slice(0, 20);
for (const line of shown) console.log(line);
if (shown.length < disagreements.length) {
  console.log(`… ${disagreements.length - shown.length} more (--verbose)`);
}
