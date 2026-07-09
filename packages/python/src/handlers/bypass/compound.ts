import type { CaptureConfigOptions } from "letant";
import type Parser from "tree-sitter";

import { query } from "@/query";
import type { QueryConfig } from "@/types";

/**
 * Python compound statements do not create scopes — declarations inside
 * their blocks bind to the enclosing scope. This bypass recursively
 * re-runs a query inside every compound-statement block (and unwraps
 * `decorated_definition`), without descending into nested `def`/`class`
 * bodies: those are matched as scope nodes themselves and recursed by
 * their own handlers.
 */
const COMPOUND = new Set([
  "if_statement",
  "elif_clause",
  "else_clause",
  "for_statement",
  "while_statement",
  "try_statement",
  "except_clause",
  "finally_clause",
  "with_statement",
  "match_statement",
  "case_clause",
]);

function bypassCompound(
  queryKey: keyof QueryConfig,
): NonNullable<CaptureConfigOptions["bypass"]> {
  const blocks = (node: Parser.SyntaxNode): Parser.SyntaxNode[] =>
    node.namedChildren.flatMap((child) => {
      if (child.type === "block") return [child];
      if (COMPOUND.has(child.type)) return blocks(child);
      return [];
    });

  const run = (node: Parser.SyntaxNode): Parser.QueryMatch[] => {
    const matches: Parser.QueryMatch[] = [];

    for (const child of node.namedChildren) {
      if (child.type === "decorated_definition") {
        const definition = child.childForFieldName("definition");
        if (definition) {
          matches.push(
            ...query.match(queryKey, definition, { maxStartDepth: 0 }),
          );
        }
        continue;
      }

      if (!COMPOUND.has(child.type)) continue;

      for (const block of blocks(child)) {
        matches.push(...query.match(queryKey, block, { maxStartDepth: 1 }));
        matches.push(...run(block));
      }
    }

    return matches;
  };

  return run;
}

export default bypassCompound;
