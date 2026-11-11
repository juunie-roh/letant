import type Parser from "tree-sitter";

import { utility } from "@/query";
import { isReference } from "@/scoping/rules";

/**
 * Capture every node that names a binding within the given node's
 * {@link Parser.Range | range}, the node itself included.
 *
 * @returns Array of reference nodes.
 */
function referenceHandler(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const captured = utility
    .get("reference")
    .captures(node, { startIndex: node.startIndex, endIndex: node.endIndex })
    .map((c) => c.node)
    .filter(isReference);

  return captured;
}

export default referenceHandler;
