package main

import (
	"fmt"
	str "strings"
)

const greeting = "hello"

type Greeter struct {
	prefix string
}

func (g *Greeter) Greet(name string) string {
	return g.prefix + str.ToUpper(name)
}

func Map[T, U any](xs []T, fn func(T) U) []U {
	out := make([]U, 0, len(xs))
	for _, x := range xs {
		out = append(out, fn(x))
	}
	return out
}

func main() {
	g := &Greeter{prefix: greeting}
	if msg := g.Greet("world"); msg != "" {
		fmt.Println(msg, version)
	}
}
