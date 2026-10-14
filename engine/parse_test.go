// Checks for the parser.
//
//	go test ./engine/
//
// The same 36 cases as the TypeScript test-parse.ts, so the Go parser has to
// agree with the parser it replaces, tree for tree.
//
// Trees are printed inside-out so they fit on one line:
//
//	2 + 3 * 4   ->   (+ 2 (* 3 4))
//
// Read it as "a plus, holding 2 and a times". The deeper something is, the
// sooner it happens.
package engine

import (
	"fmt"
	"strings"
	"testing"
)

// show prints a tree, and is also your worked example of a TYPE SWITCH.
//
// `switch n := node.(type)` asks which of the five shapes this Node really
// is, and inside each case, n is already that type — so n.Value, n.Op and
// n.Args are there without any casting. This is the Go translation of
// TypeScript's switch (node.kind), and the reason the interface was worth
// the five empty methods.
func show(node Node) string {
	switch n := node.(type) {
	case NumberNode:
		// %g prints 3 as "3" and 3.5 as "3.5", like JavaScript does.
		return fmt.Sprintf("%g", n.Value)
	case NameNode:
		return n.Text
	case UnaryNode:
		return "(" + n.Op + " " + show(n.Value) + ")"
	case BinaryNode:
		return "(" + n.Op + " " + show(n.Left) + " " + show(n.Right) + ")"
	case CallNode:
		parts := make([]string, 0, len(n.Args))
		for _, arg := range n.Args {
			parts = append(parts, show(arg))
		}
		return "(" + n.Name + " " + strings.Join(parts, " ") + ")"
	case nil:
		return "nothing"
	default:
		return "something unknown"
	}
}

func expectTree(t *testing.T, input, want string) {
	t.Helper()
	node, err := Parse(input)
	if err != nil {
		t.Errorf("FAIL  %q\n      refused with: %v", input, err)
		return
	}
	if got := show(node); got != want {
		t.Errorf("FAIL  %q\n      got  %s\n      want %s", input, got, want)
	}
}

func expectTreeRefused(t *testing.T, input string) {
	t.Helper()
	if _, err := Parse(input); err == nil {
		t.Errorf("FAIL  %q\n      should have been refused, wasn't", input)
	}
}

func TestParse(t *testing.T) {
	// ---- atoms --------------------------------------------------------------
	expectTree(t, "7", "7")
	expectTree(t, "3.5", "3.5")
	expectTree(t, "x", "x")
	expectTree(t, "pi", "pi")

	// ---- adding and subtracting ----------------------------------------------
	expectTree(t, "2+3", "(+ 2 3)")
	expectTree(t, "2 + 3", "(+ 2 3)")
	expectTree(t, "10-4-3", "(- (- 10 4) 3)")

	// ---- precedence: the whole point -----------------------------------------
	expectTree(t, "2+3*4", "(+ 2 (* 3 4))")
	expectTree(t, "2*3+4", "(+ (* 2 3) 4)")
	expectTree(t, "8/4/2", "(/ (/ 8 4) 2)")
	expectTree(t, "1+2*3-4", "(- (+ 1 (* 2 3)) 4)")

	// ---- brackets beat everything --------------------------------------------
	expectTree(t, "(2+3)*4", "(* (+ 2 3) 4)")
	expectTree(t, "2*(3+4)", "(* 2 (+ 3 4))")
	expectTree(t, "((5))", "5")

	// ---- powers lean the other way -------------------------------------------
	expectTree(t, "2^3", "(^ 2 3)")
	expectTree(t, "2^3^2", "(^ 2 (^ 3 2))")
	expectTree(t, "2*3^2", "(* 2 (^ 3 2))")

	// ---- minus in front ------------------------------------------------------
	expectTree(t, "-4", "(- 4)")
	expectTree(t, "-x+2", "(+ (- x) 2)")
	expectTree(t, "3*-2", "(* 3 (- 2))")

	// ---- calls ---------------------------------------------------------------
	expectTree(t, "sin(30)", "(sin 30)")
	expectTree(t, "sqrt(x+1)", "(sqrt (+ x 1))")
	expectTree(t, "max(2, 9)", "(max 2 9)")
	expectTree(t, "sin(30)+1", "(+ (sin 30) 1)")

	// ---- written the way it is on paper --------------------------------------
	expectTree(t, "3x", "(* 3 x)")
	expectTree(t, "3x + 7", "(+ (* 3 x) 7)")
	expectTree(t, "2(x+1)", "(* 2 (+ x 1))")
	expectTree(t, "2pi", "(* 2 pi)")
	expectTree(t, "3x^2", "(* 3 (^ x 2))")
	expectTree(t, "2x + 3y", "(+ (* 2 x) (* 3 y))")
	expectTree(t, "x(x+1)", "(x (+ x 1))") // a name before a bracket is still a call

	// ---- nonsense should be refused ------------------------------------------
	expectTreeRefused(t, "2+")
	expectTreeRefused(t, "(2")
	expectTreeRefused(t, "2)")
	expectTreeRefused(t, "2 3")
	expectTreeRefused(t, "")
}
