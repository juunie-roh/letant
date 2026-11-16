// The reference side of scripts/compare-gotypes.mjs.
//
// For every identifier in a file, prints what Go's own type checker
// (go/types) resolves it to. Reads file paths from standard input, one per
// line, and writes one JSON line per file:
//
//	{"file": path, "names": [[offset, name, kind, value], ...]}
//	{"file": path, "skip": reason}
//
// offset  position of the identifier, in UTF-16 code units (as tree-sitter
//         counts)
// kind    "decl"        declared in this file; value is the offset of the
//                       declaring identifier (the identifier itself, for a
//                       declaration)
//         "import"      a package imported with a name; value is its path
//                       as the file spells it (the type checker's own path
//                       has the directory of a vendored package before it)
//         "unnamed"     a package imported without a name; value is its path
//                       ("?" + path when the package could not be loaded, so
//                       that its name is not known here either)
//         "none"        no declaration of this file: a predeclared name, a
//                       name of another file of the package, a name of a dot
//                       import, the package clause, `_`, `init`
//         "member"      not a name of any scope: a field, a method, a label
//         "guard"       the symbolic variable of a type switch guard
//         "unrecorded"  the type checker recorded nothing, which it does
//                       for an identifier it could not resolve
//
// A file is checked together with the other files of its package in its
// directory, and imports are loaded from source. Requires Go 1.24 or later.
//
//go:build ignore

package main

import (
	"bufio"
	"encoding/json"
	"go/ast"
	"go/build"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"
)

// loader imports packages from source. A package that cannot be loaded is
// replaced by an empty one, so that the file is still checked; its name is
// then a guess, and the import is reported as such.
type loader struct {
	source  types.ImporterFrom
	guessed map[string]*types.Package
}

func (l *loader) Import(p string) (*types.Package, error) {
	return l.ImportFrom(p, "", 0)
}

func (l *loader) ImportFrom(p, dir string, mode types.ImportMode) (pkg *types.Package, err error) {
	if pkg, ok := l.guessed[p]; ok {
		return pkg, nil
	}
	defer func() {
		if recover() != nil || err != nil {
			pkg = types.NewPackage(p, path.Base(p))
			pkg.MarkComplete()
			l.guessed[p] = pkg
			err = nil
		}
	}()
	return l.source.ImportFrom(p, dir, mode)
}

// checked is a type-checked package: the files of one directory that share
// a package clause.
type checked struct {
	pkg     *types.Package
	info    *types.Info
	files   map[string]*ast.File
	unnamed map[types.Object]bool
	// the path each package name was imported with, as written
	spelled map[types.Object]string
}

var (
	fset    = token.NewFileSet()
	imports = &loader{
		source:  importer.ForCompiler(fset, "source", nil).(types.ImporterFrom),
		guessed: map[string]*types.Package{},
	}
	packages = map[string]*checked{}
)

func check(target string) (*checked, error) {
	dir := filepath.Dir(target)
	file, err := parser.ParseFile(fset, target, nil, parser.SkipObjectResolution)
	if err != nil {
		return nil, err
	}

	key := dir + "\x00" + file.Name.Name
	if c, ok := packages[key]; ok {
		if _, ok := c.files[target]; ok {
			return c, nil
		}
	}

	c := &checked{
		info: &types.Info{
			Defs:      map[*ast.Ident]types.Object{},
			Uses:      map[*ast.Ident]types.Object{},
			Implicits: map[ast.Node]types.Object{},
		},
		files:   map[string]*ast.File{target: file},
		unnamed: map[types.Object]bool{},
		spelled: map[types.Object]string{},
	}
	list := []*ast.File{file}

	// the other files of the package that this platform builds
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		name := filepath.Join(dir, entry.Name())
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || name == target {
			continue
		}
		if match, err := build.Default.MatchFile(dir, entry.Name()); err != nil || !match {
			continue
		}
		other, err := parser.ParseFile(fset, name, nil, parser.SkipObjectResolution)
		if err != nil || other.Name.Name != file.Name.Name {
			continue
		}
		c.files[name] = other
		list = append(list, other)
	}

	config := types.Config{
		Importer:    imports,
		FakeImportC: true,
		// keep checking: an identifier the checker cannot resolve is
		// reported as "unrecorded"
		Error: func(error) {},
	}
	c.pkg, _ = config.Check(dir, fset, list, c.info)

	for _, f := range list {
		for _, spec := range f.Imports {
			// `_` and `.` declare no package name
			object := c.info.Implicits[spec]
			if spec.Name != nil {
				object = c.info.Defs[spec.Name]
			}
			if object == nil {
				continue
			}
			c.spelled[object], _ = strconv.Unquote(spec.Path.Value)
			c.unnamed[object] = spec.Name == nil
		}
	}
	packages[key] = c
	return c, nil
}

// member reports whether an object is not a name of any scope.
func member(object types.Object) bool {
	switch o := object.(type) {
	case *types.Var:
		return o.IsField()
	case *types.Func:
		signature, ok := o.Type().(*types.Signature)
		return ok && signature.Recv() != nil
	case *types.Label:
		return true
	}
	return false
}

func main() {
	out := json.NewEncoder(os.Stdout)
	in := bufio.NewScanner(os.Stdin)

	for in.Scan() {
		target := in.Text()
		if target == "" {
			continue
		}
		c, err := check(target)
		if err != nil {
			out.Encode(map[string]any{"file": target, "skip": err.Error()})
			continue
		}

		source, err := os.ReadFile(target)
		if err != nil {
			out.Encode(map[string]any{"file": target, "skip": err.Error()})
			continue
		}
		// byte offset → UTF-16 code units
		units := func(offset int) int { return offset }
		if utf8.RuneCount(source) != len(source) {
			table := make([]int, len(source)+1)
			count := 0
			for i, r := range string(source) {
				table[i] = count
				if r >= 0x10000 {
					count += 2
				} else {
					count++
				}
			}
			table[len(source)] = count
			units = func(offset int) int { return table[offset] }
		}
		// positions as written: a //line directive must not move them
		offset := func(pos token.Pos) int { return units(fset.PositionFor(pos, false).Offset) }

		file := c.files[target]
		names := [][]any{}
		ast.Inspect(file, func(node ast.Node) bool {
			id, ok := node.(*ast.Ident)
			if !ok {
				return true
			}
			kind, value := "unrecorded", any(nil)

			// an embedded field is in both maps: it defines a field and
			// uses a type, and the position names the type
			use, used := c.info.Uses[id]
			def, defined := c.info.Defs[id]
			object := use
			if !used {
				object = def
			}

			switch {
			case !used && !defined:
			case id.Name == "_" || id.Name == ".":
				kind = "none"
			case !used && def == nil:
				// "the package name in package clauses, or symbolic
				// variables t in t := x.(type) type switches"
				if id == file.Name {
					kind = "none"
				} else {
					kind = "guard"
				}
			case member(object):
				kind = "member"
			default:
				if name, ok := object.(*types.PkgName); ok {
					imported := name.Imported()
					kind, value = "import", c.spelled[object]
					if c.unnamed[object] {
						kind = "unnamed"
						if imports.guessed[imported.Path()] == imported {
							value = "?" + c.spelled[object]
						}
					}
					break
				}
				// predeclared, dot-imported, `init`, or in another file
				_, function := object.(*types.Func)
				if object.Pkg() != c.pkg ||
					(function && object.Name() == "init") ||
					fset.PositionFor(object.Pos(), false).Filename != target {
					kind = "none"
					break
				}
				kind, value = "decl", offset(object.Pos())
			}

			names = append(names, []any{offset(id.Pos()), id.Name, kind, value})
			return true
		})

		out.Encode(map[string]any{"file": target, "names": names})
	}
}
