import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { createCommand } from "@commander-js/extra-typings";
import { assertTreeSitterLanguage } from "letant/utils";
import Parser from "tree-sitter";

import { fileArg } from "../args";
import BinaryError from "../error";
import { group } from "../groups";
import { encodingOption } from "../options";

const queryCommand = createCommand("query")
  .helpGroup(group.command.dev)
  .description(
    "Run a tree-sitter query against a source file with depth-gated matching. Requires the grammar package to be installed locally.",
  )
  .addArgument(fileArg)
  .addOption(encodingOption)
  .requiredOption(
    "--grammar <package-name>",
    "A module name for tree-sitter language plugin",
  )
  .option(
    "--grammar-spec <language-name>",
    "Specify which to use from the language record",
  )
  .option("--query <query-path>", "A file of tree-sitter query to run")
  .option("--query-string <string>", "String of tree-sitter query to run")
  .option(
    "--max-start-depth <depth>",
    "Depth limit for query to start match from",
    (v) => parseInt(v, 10),
    1,
  )
  .action((filePath, options) => {
    // Resolve the grammar from the user's working directory, not from where
    // the CLI itself is installed.
    const requireFromCwd = createRequire(
      resolve(process.cwd(), "package.json"),
    );

    let mod: any;
    try {
      mod = requireFromCwd(options.grammar);
    } catch (e: any) {
      throw new BinaryError(
        "BIN_MODULE_NOT_FOUND",
        e.code === "MODULE_NOT_FOUND"
          ? `Module "${options.grammar}" not found`
          : `Module "${options.grammar}" failed to load: ${e.message}`,
        { cause: e },
      );
    }

    const language = options.grammarSpec ? mod[options.grammarSpec] : mod;

    assertTreeSitterLanguage(
      language,
      options.grammar,
      new BinaryError("BIN_INVALID_LANGUAGE", "Invalid tree-sitter language"),
    );

    const parser = new Parser();
    parser.setLanguage(language);
    const source = readFileSync(filePath, options.encoding);
    const tree = parser.parse(source);

    if (!!options.query === !!options.queryString) {
      throw new BinaryError(
        "BIN_INVALID_OPTION",
        "Exactly one of --query or --query-string must be specified",
      );
    }

    const querySource = options.query
      ? readFileSync(options.query)
      : options.queryString;

    const query = new Parser.Query(language, querySource!);

    const matches = query.matches(tree.rootNode, {
      maxStartDepth: options.maxStartDepth,
    });

    matches.forEach((m, i) => {
      const captures = m.captures.map((c) => {
        const { row: sr, column: sc } = c.node.startPosition;
        const { row: er, column: ec } = c.node.endPosition;
        const lines = er - sr + 1;
        const preview =
          lines > 1
            ? `(${lines} lines)`
            : c.node.text.length > 20
              ? `"${c.node.text.slice(0, 20)}…"`
              : `"${c.node.text}"`;
        return {
          name: `@${c.name}`,
          type: c.node.type,
          range: `[${sr}:${sc} - ${er}:${ec}]`,
          preview,
        };
      });

      const nameW = Math.max(...captures.map((c) => c.name.length));
      const typeW = Math.max(...captures.map((c) => c.type.length));
      const rangeW = Math.max(...captures.map((c) => c.range.length));

      process.stdout.write(`Match ${i}\n`);
      for (const c of captures) {
        process.stdout.write(
          `  ${c.name.padEnd(nameW)}  ${c.type.padEnd(typeW)}  ${c.range.padEnd(rangeW)}  ${c.preview}\n`,
        );
      }
    });
  });

export default queryCommand;
