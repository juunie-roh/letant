// Acceptance check for the scoping rules (ADR 0006): every identifier Go's
// own type checker (go/types) resolves must resolve, through letant, to the
// same declaring identifier — and a field, a method or a label must resolve
// to nothing. A reference the plugin declines (ADR 0007) is counted apart,
// with whether the tree would have answered it correctly. The reference side
// is scripts/gotypes_reference.go.
//
// Usage: pnpm --filter @letant/go compare [paths...] [--files <n>] [--seed <n>] [--go <exe>] [--verbose]
//   paths     files or directories to compare (default: the standard
//             library of the Go installation, `go env GOROOT`/src)
//   --files   how many files to sample from directories (default: 200)
//   --seed    sampling seed (default: 42)
//   --go      the `go` command of a Go 1.24 or later installation
//             (default: $GO, else go)
//   --verbose list every disagreement instead of the first 20
//
// Requires `letant` and `@letant/go` to be built.
import { execFileSync, spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { TreeCursor, Workspace } from "letant";

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.resolve(here, "../dist/index.mjs");
const reference = path.join(here, "gotypes_reference.go");

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    files: { type: "string", default: "200" },
    seed: { type: "string", default: "42" },
    go: { type: "string", default: process.env.GO ?? "go" },
    verbose: { type: "boolean", default: false },
  },
});

function sample(directory, count, seed) {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".go"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    // `testdata` holds input for tools, much of it deliberately invalid
    .filter((file) => !file.split(path.sep).includes("testdata"))
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

/** A resolved binding, named as the reference names it. */
function answerOf(cursor) {
  if (!cursor) return { kind: "none" };
  const { at } = cursor.node;
  return typeof at === "string"
    ? { kind: "import", value: at }
    : { kind: "decl", value: at.startIndex };
}

/** Whether an answer is what the reference expects at a position. */
function agrees(got, kind, value) {
  switch (kind) {
    case "decl":
    case "import":
      return got.kind === kind && got.value === value;
    // nothing in the file to land on
    default:
      return got.kind === "none";
  }
}

const describe = ({ kind, value }) =>
  kind === "decl" ? `declaration at ${value}` : `${kind} ${value ?? ""}`.trim();

const goroot = execFileSync(options.go, ["env", "GOROOT"], {
  encoding: "utf8",
}).trim();

const targets = positionals.length
  ? positionals.map((p) => path.resolve(p))
  : [path.join(goroot, "src")];
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
  // the two parsers do not put the same identifier at the position
  misaligned: 0,
  // an import without a name (SCOPING.md G2): the plugin declines its
  // references when the name it assumes is the package's, and leaves them
  // unanswered when it is not
  unnamedDeclined: 0,
  unnamedAssumedOtherName: 0,
  // declined by the plugin for another rule (SCOPING.md §7), and how many
  // of those the tree would have answered correctly
  unsupported: 0,
  unsupportedButRight: 0,
  // letant answers where the type checker recorded nothing
  unrecorded: 0,
  disagreed: 0,
};
const declined = {};
const categories = {};
const disagreements = [];

const go = spawn(options.go, ["run", reference], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, GOROOT: goroot },
});
go.stdin.end(files.join("\n"));

for await (const line of createInterface({ input: go.stdout })) {
  const { file, names, skip } = JSON.parse(line);
  const done = total.files + total.skipped;
  if (done % 25 === 0) process.stderr.write(`\r${done}/${files.length} files`);

  const { root } = path.parse(file);
  const relative = path.relative(root, file);
  const workspace = await Workspace.create({
    rootDir: root,
    plugins: [{ name: plugin, extensions: [".go"] }],
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

  for (const [offset, name, kind, value] of names) {
    const node = parsed.tsTree.rootNode.descendantForIndex(offset);
    if (node.text !== name || node.startIndex !== offset) {
      total.misaligned++;
      continue;
    }
    total.names++;

    const origin = workspace.origin(relative, offset);
    const isDeclined = typeof origin === "object" && "unsupported" in origin;

    // `origin` answers an import with its path: the binding is on the tree
    const onTree = () =>
      answerOf(TreeCursor.at(parsed.tree, offset).resolve(name));
    const got =
      typeof origin === "string" ? { kind: "import", value: origin } : null;

    if (kind === "unnamed") {
      // the name at the position is the package's own; the plugin declines
      // it exactly when that is the name it assumes
      if (isDeclined && origin.unsupported.includes("import")) {
        total.unnamedDeclined++;
        continue;
      }
      if (origin === undefined) {
        total.unnamedAssumedOtherName++;
        continue;
      }
    }

    if (isDeclined) {
      total.unsupported++;
      declined[origin.unsupported] = (declined[origin.unsupported] ?? 0) + 1;
      if (agrees(onTree(), kind, value)) total.unsupportedButRight++;
      continue;
    }

    const answer = got ?? answerOf(origin);
    if (agrees(answer, kind, value)) {
      total.agreed++;
      continue;
    }

    if (kind === "unrecorded") {
      total.unrecorded++;
      continue;
    }

    total.disagreed++;
    const category = `expected ${kind}, got ${answer.kind}`;
    categories[category] = (categories[category] ?? 0) + 1;
    const { row, column } = node.startPosition;
    disagreements.push(
      `${name} at ${file}:${row + 1}:${column + 1} — expected ${describe({ kind, value })}, got ${describe(answer)}`,
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
