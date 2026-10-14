// Checks for the tokenizer.
//
//	go test ./engine/
//
// The same cases as the TypeScript test-math.ts, so the Go engine has to
// agree with the engine it is replacing, case for case. Red is normal right
// now — Tokenize is still empty. Go until it's all green, then the parser.
//
// Go finds these automatically: a file ending in _test.go, in the same
// package, with functions called TestSomething(t *testing.T).
package engine

import (
	"fmt"
	"strings"
	"testing"
)

// short writes tokens the compact way, so a failure is readable:
//
//	3 +(op) x(name)
func short(tokens []Token) string {
	parts := make([]string, 0, len(tokens))
	for _, t := range tokens {
		switch t.Kind {
		case Number:
			// %g prints 3 as "3" and 3.5 as "3.5", like JavaScript does.
			parts = append(parts, fmt.Sprintf("%g", t.Value))
		case Name:
			parts = append(parts, t.Text+"(name)")
		case Op:
			parts = append(parts, t.Text+"(op)")
		}
	}
	return strings.Join(parts, " ")
}

// expect checks one input against the pieces it should come out as.
//
// t.Errorf marks the test failed and carries on, which is what you want here:
// one run tells you about every broken case, not just the first.
func expect(t *testing.T, input, want string) {
	t.Helper() // failures point at the line below, not at this function
	tokens, err := Tokenize(input)
	if err != nil {
		t.Errorf("FAIL  %q\n      refused with: %v", input, err)
		return
	}
	if got := short(tokens); got != want {
		t.Errorf("FAIL  %q\n      got  %s\n      want %s", input, got, want)
	}
}

// expectRefused checks that an input IS turned down.
func expectRefused(t *testing.T, input string) {
	t.Helper()
	if _, err := Tokenize(input); err == nil {
		t.Errorf("FAIL  %q\n      should have been refused, wasn't", input)
	}
}

func TestTokenize(t *testing.T) {
	// ---- the plain cases ----------------------------------------------------
	expect(t, "3", "3")
	expect(t, "3+4", "3 +(op) 4")
	expect(t, "3 + 4", "3 +(op) 4")
	expect(t, "3+4*2", "3 +(op) 4 *(op) 2")

	// ---- numbers ------------------------------------------------------------
	expect(t, "12", "12")
	expect(t, "3.5", "3.5")
	expect(t, ".5", "0.5")
	expect(t, "2^10", "2 ^(op) 10")

	// ---- names --------------------------------------------------------------
	expect(t, "x", "x(name)")
	expect(t, "pi", "pi(name)")
	expect(t, "x2", "x2(name)")
	expect(t, "sin(30)", "sin(name) ((op) 30 )(op)")
	expect(t, "x = 5", "x(name) =(op) 5")

	// ---- spaces are noise ---------------------------------------------------
	expect(t, "   7   ", "7")
	expect(t, "", "")

	// ---- the messy ones -----------------------------------------------------
	// A minus on its own is just an op here. Working out that this one means
	// "negative" and the one in 5-4 means "subtract" is the parser's job.
	expect(t, "-4", "-(op) 4")
	expect(t, "2*(3+4)", "2 *(op) ((op) 3 +(op) 4 )(op)")
	expect(t, "max(2, 9)", "max(name) ((op) 2 ,(op) 9 )(op)")

	// ---- typos should speak up ----------------------------------------------
	expectRefused(t, "3 + $")
	expectRefused(t, "5 # 2")
}
