import type Parser from "tree-sitter";

import { utility } from "@/query";

/**
 * Capture all identifiers within the given node's {@link Parser.Range | range}.
 *
 * @returns Array of identifier strings.
 */
function referenceHandler(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const captured = utility
    .get("reference")
    .captures(node, { startIndex: node.startIndex, endIndex: node.endIndex })
    .flatMap((c) => c.node);

  return captured;
}

export default referenceHandler;
