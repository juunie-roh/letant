"""The reference side of scripts/compare-symtable.mjs.

For every name in a file, prints the scope that CPython's own symbol table
says binds it. Reads file paths from stdin, one per line, and writes one JSON
line per file:

    {"file": path, "names": [[offset, name, scope, context], ...]}
    {"file": path, "skip": reason}

offset   position of the name, in UTF-16 code units (as tree-sitter counts)
scope    "module", the offset of the function, lambda, class or comprehension
         that binds the name, "g<offset>" for the type parameter scope of the
         definition at that offset, null when no scope of the file binds it,
         or "!" when the position is not a name at all (an attribute, a
         keyword argument)
context  "parameter", "first-iterable", "private" (a name the compiler mangles,
         when neither of the other two applies) or ""

Requires Python 3.14 or later.
"""

import ast
import json
import symtable
import sys

COMPREHENSIONS = {
    ast.ListComp: "listcomp",
    ast.SetComp: "setcomp",
    ast.DictComp: "dictcomp",
    ast.GeneratorExp: "genexpr",
}
# annotation scopes that bind no name: their names are resolved as if used in
# the enclosing scope (reference, 4.2.4), so their tables are not paired
UNPAIRED_TABLES = {"annotation", "type alias", "type variable"}


class Unpaired(Exception):
    """A scope in the syntax tree has no table in the symbol table."""


class Scope:
    """A scope of the syntax tree, paired with the compiler's table for it."""

    def __init__(self, table, kind, ident, parent):
        self.table, self.kind, self.id, self.parent = table, kind, ident, parent
        self.children = {}
        for child in table.get_children():
            if child.get_type().value in UNPAIRED_TABLES:
                continue
            key = (child.get_type().value, child.get_name(), child.get_lineno())
            self.children.setdefault(key, []).append(child)

    def child(self, kind, name, lineno):
        tables = self.children.get((kind, name, lineno))
        if not tables:
            raise Unpaired(f"{kind} {name} at line {lineno}")
        return tables.pop(0)

    def symbol(self, name):
        try:
            symbol = self.table.lookup(name)
        except KeyError:
            return None
        # copied in from an inlined comprehension (PEP 709): not bound here
        if self.kind != "comprehension" and symbol.is_comp_iter():
            return None
        return symbol


class Inlined:
    """A list, set or dictionary comprehension. The compiler inlines these, so
    they have no table: the targets come from the syntax, and every other name
    is asked of the enclosing table."""

    kind = "inlined"

    def __init__(self, ident, parent, targets):
        self.id, self.parent, self.targets = ident, parent, targets

    def child(self, kind, name, lineno):
        return self.parent.child(kind, name, lineno)


class Reference:
    def __init__(self, source, filename):
        lines = source.encode("utf-8").split(b"\n")
        self.lines, self.starts, offset = lines, [], 0
        for line in lines:
            self.starts.append(offset)
            offset += len(line.decode("utf-8").encode("utf-16-le")) // 2 + 1

        self.tree = ast.parse(source, filename)
        top = symtable.symtable(source, filename, "exec")
        self.module = Scope(top, "module", "module", None)
        # names a `global` statement binds from inside a function or class
        self.global_bound = set()
        self.collect_globals(top)
        self.classes = []
        self.names = []

    def collect_globals(self, table):
        for symbol in table.get_symbols():
            if symbol.is_declared_global() and (
                symbol.is_assigned() or symbol.is_imported()
            ):
                self.global_bound.add(symbol.get_name())
        for child in table.get_children():
            self.collect_globals(child)

    def offset(self, lineno, column):
        prefix = self.lines[lineno - 1][:column]
        return self.starts[lineno - 1] + len(prefix.decode("utf-8").encode("utf-16-le")) // 2

    def start(self, node):
        return self.offset(node.lineno, node.col_offset)

    # resolution ----------------------------------------------------------

    def mangle(self, name):
        if not self.classes or not name.startswith("__") or name.endswith("__"):
            return name, False
        owner = self.classes[-1].lstrip("_")
        return (f"_{owner}{name}", True) if owner else (name, False)

    def in_module(self, name):
        symbol = self.module.symbol(name)
        bound = bool(symbol and symbol.is_local()) or name in self.global_bound
        return "module" if bound else None

    def free(self, scope, name):
        """The nearest function-like scope that binds the name, from `scope`
        outward. Class scopes are skipped."""
        while scope:
            if scope.kind == "module":
                return self.in_module(name)
            if scope.kind == "inlined":
                if name in scope.targets:
                    return scope.id
            elif scope.kind != "class":
                symbol = scope.symbol(name)
                if symbol and symbol.is_declared_global():
                    return self.in_module(name)
                if symbol and symbol.is_local():
                    return scope.id
            scope = scope.parent
        return None

    def resolve(self, scope, name):
        if scope.kind == "inlined":
            return scope.id if name in scope.targets else self.resolve(scope.parent, name)
        if scope.kind == "module":
            return self.in_module(name)

        symbol = scope.symbol(name)
        if symbol is None:
            return self.free(scope, name)
        # asked before is_global(): symtable reports every symbol of a table
        # that happens to be named "top" as global
        if symbol.is_local() and not symbol.is_declared_global():
            return scope.id
        if symbol.is_global():
            # a type parameter scope directly inside a class sees its names
            if scope.kind == "generic" and not symbol.is_declared_global():
                owner = scope.parent
                while owner.kind == "generic":
                    owner = owner.parent
                bound = owner.symbol(name) if owner.kind == "class" else None
                if bound and bound.is_local():
                    return owner.id
            return self.in_module(name)
        if symbol.is_free():
            return self.free(scope.parent, name)
        return None

    def resolve_annotation(self, scope, name):
        """A name in an annotation scope: resolved as if it were used directly
        in the enclosing scope."""
        while scope.kind == "generic":
            symbol = scope.symbol(name)
            if symbol and symbol.is_local():
                return scope.id
            scope = scope.parent
        if scope.kind == "inlined" or scope.symbol(name) is not None:
            return self.resolve(scope, name)
        return self.free(scope.parent if scope.kind == "class" else scope, name)

    # recording -----------------------------------------------------------

    def name(self, node, name, scope, context, annotation=False):
        mangled, private = self.mangle(name)
        resolve = self.resolve_annotation if annotation else self.resolve
        self.names.append(
            [self.start(node), name, resolve(scope, mangled), context or ("private" if private else "")]
        )

    def not_a_name(self, lineno, column, name):
        self.names.append([self.offset(lineno, column), name, "!", ""])

    # walk ----------------------------------------------------------------

    def visit(self, node, scope, context="", annotation=False):
        if node is None:
            return
        if isinstance(node, list):
            for item in node:
                self.visit(item, scope, context, annotation)
            return
        if type(node) in COMPREHENSIONS:
            return self.comprehension(node, scope, annotation)
        method = getattr(self, "visit_" + type(node).__name__, None)
        if method:
            return method(node, scope, context, annotation)
        for child in ast.iter_child_nodes(node):
            self.visit(child, scope, context, annotation)

    def visit_Name(self, node, scope, context, annotation):
        self.name(node, node.id, scope, context, annotation)

    def visit_Attribute(self, node, scope, context, annotation):
        self.visit(node.value, scope, context, annotation)
        column = node.end_col_offset - len(node.attr.encode("utf-8"))
        self.not_a_name(node.end_lineno, column, node.attr)

    def visit_keyword(self, node, scope, context, annotation):
        if node.arg is not None:
            self.not_a_name(node.lineno, node.col_offset, node.arg)
        self.visit(node.value, scope, context, annotation)

    def annotation(self, node, scope, unevaluated=False):
        # the annotation of a function's local is never evaluated, and a scope
        # nested in an annotation scope has no paired table
        if node is None or unevaluated:
            return
        if any(isinstance(n, (ast.Lambda, *COMPREHENSIONS)) for n in ast.walk(node)):
            return
        self.visit(node, scope, "", True)

    def generic(self, node, name, scope):
        """The type parameter scope of a generic definition, or `scope`."""
        if not getattr(node, "type_params", None):
            return scope
        table = scope.child("type parameters", name, node.lineno)
        generic = Scope(table, "generic", f"g{self.start(node)}", scope)
        for parameter in node.type_params:
            # the position of `*Ts` and `**P` is that of the stars
            stars = {ast.TypeVarTuple: 1, ast.ParamSpec: 2}.get(type(parameter), 0)
            self.names.append([self.start(parameter) + stars, parameter.name, generic.id, ""])
            self.annotation(getattr(parameter, "bound", None), generic)
            self.annotation(getattr(parameter, "default_value", None), generic)
        return generic

    def parameters(self, arguments, scope):
        every = [
            *arguments.posonlyargs,
            *arguments.args,
            arguments.vararg,
            *arguments.kwonlyargs,
            arguments.kwarg,
        ]
        for parameter in filter(None, every):
            self.name(parameter, parameter.arg, scope, "parameter")
        return list(filter(None, every))

    def function(self, node, scope, context, annotation):
        self.visit(node.decorator_list, scope)
        generic = self.generic(node, node.name, scope)
        self.visit(node.args.defaults, scope)
        self.visit(node.args.kw_defaults, scope)
        table = generic.child("function", node.name, node.lineno)
        function = Scope(table, "function", str(self.start(node)), generic)
        for parameter in self.parameters(node.args, function):
            self.annotation(parameter.annotation, generic)
        self.annotation(node.returns, generic)
        self.visit(node.body, function)

    visit_FunctionDef = visit_AsyncFunctionDef = function

    def visit_Lambda(self, node, scope, context, annotation):
        self.visit(node.args.defaults, scope, "", annotation)
        self.visit(node.args.kw_defaults, scope, "", annotation)
        table = scope.child("function", "lambda", node.lineno)
        function = Scope(table, "function", str(self.start(node)), scope)
        self.parameters(node.args, function)
        self.visit(node.body, function)

    def visit_ClassDef(self, node, scope, context, annotation):
        self.visit(node.decorator_list, scope)
        generic = self.generic(node, node.name, scope)
        self.visit(node.bases, generic, "", generic is not scope)
        self.visit(node.keywords, generic, "", generic is not scope)
        table = generic.child("class", node.name, node.lineno)
        self.classes.append(node.name)
        self.visit(node.body, Scope(table, "class", str(self.start(node)), generic))
        self.classes.pop()

    def comprehension(self, node, scope, annotation):
        first = node.generators[0]
        self.visit(first.iter, scope, "first-iterable", annotation)
        if isinstance(node, ast.GeneratorExp):
            table = scope.child("function", "genexpr", node.lineno)
            inner = Scope(table, "comprehension", str(self.start(node)), scope)
        else:
            targets = {
                n.id
                for generator in node.generators
                for n in ast.walk(generator.target)
                if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)
            }
            inner = Inlined(str(self.start(node)), scope, targets)
        self.visit(first.target, inner)
        self.visit(first.ifs, inner)
        self.visit(node.generators[1:], inner)
        if isinstance(node, ast.DictComp):
            self.visit(node.key, inner)
            self.visit(node.value, inner)
        else:
            self.visit(node.elt, inner)

    def visit_TypeAlias(self, node, scope, context, annotation):
        self.visit(node.name, scope)
        self.annotation(node.value, self.generic(node, node.name.id, scope))

    def visit_AnnAssign(self, node, scope, context, annotation):
        self.visit(node.target, scope)
        self.annotation(node.annotation, scope, unevaluated=scope.kind == "function")
        self.visit(node.value, scope)


def main():
    if sys.version_info < (3, 14):
        sys.exit(f"Python 3.14 or later is required, not {sys.version.split()[0]}")

    for line in sys.stdin:
        path = line.strip()
        if not path:
            continue
        try:
            with open(path, encoding="utf-8") as file:
                source = file.read()
            reference = Reference(source, path)
            reference.visit(reference.tree, reference.module)
            result = {"file": path, "names": reference.names}
        except Unpaired as error:
            result = {"file": path, "skip": f"unpaired scope: {error}"}
        except (SyntaxError, UnicodeDecodeError, ValueError, RecursionError) as error:
            result = {"file": path, "skip": type(error).__name__}
        print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
