import type { SyntaxNode } from "tree-sitter";

import { analysisOf } from "./analyze";
import { isGuard, keyKind } from "./rules";

const GUARD = "a type switch guard declares one variable in each clause";
const KEY =
  "a key in a composite literal of a named type is a field or an expression, depending on the type";
const ORDER =
  "a name declared in a function is visible only after its declaration";
const PACKAGE_NAME =
  "the name an import without one binds is declared in the imported package";

/**
 * The rule that keeps the tree from resolving a reference correctly, if any
 * (SCOPING.md §7). The tree answers with the nearest scope that binds the
 * name; this follows the same walk over the same bindings and declines
 * where Go would not stop there.
 */
function unsupported(node: SyntaxNode): string | undefined {
  if (isGuard(node)) return GUARD;
  if (keyKind(node) === "unknown") return KEY;

  const { enclosing, assumed } = analysisOf(node.tree);
  const name = node.text;

  for (
    let scope: ReturnType<typeof enclosing> | undefined = enclosing(node);
    scope;
    scope = scope.parent
  ) {
    const binding = scope.bindings.get(name);
    if (!binding) continue;
    // the name is not visible yet, so Go looks further out; the declaring
    // identifier itself is written before that point and answers itself
    return node.startIndex < binding.from && node.id !== binding.id
      ? ORDER
      : undefined;
  }

  return assumed.has(name) ? PACKAGE_NAME : undefined;
}

export default unsupported;
