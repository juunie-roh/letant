import type { CaptureConfigOptions } from "letant";
import type Parser from "tree-sitter";

import { bypass, query } from "@/query";
import { QueryConfig } from "@/types";

function bypassExport(
  queryKey: keyof QueryConfig,
): CaptureConfigOptions["bypass"] {
  return (node) => {
    const matches: Parser.QueryMatch[] = [];

    if (node.type === "program") {
      const captured = bypass
        .get("export")
        .captures(node, { maxStartDepth: 1 })
        .filter((c) => c.name === "node")
        .map((c) => c.node);
      if (captured.length > 0) {
        for (const c of captured) {
          matches.push(...query.match(queryKey, c, { maxStartDepth: 0 }));
        }
      }
    }

    return matches;
  };
}

export default bypassExport;
