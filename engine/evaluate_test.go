// Checks for the evaluator.
//
//	go test ./engine/
//
// The same 37 cases as the TypeScript test-eval.ts. Numbers are compared
// loosely — 0.1 + 0.2 is famously not exactly 0.3 in any language, so "close
// enough" is the only sane test for floating point.
package engine

import (
	"math"
	"testing"
)

// closeEnough, not "close": close is a Go builtin (it closes a channel).
const closeEnough = 1e-9

// expectValue works a line out in DEGREES mode, the app's default.
func expectValue(t *testing.T, input string, want float64) {
	t.Helper()
	checkValue(t, input, want, true)
}

// expectRadians is the same in radians. Two helpers rather than one with a
// flag, because Go has no default arguments and 30 calls saying `true` would
// read worse than this.
func expectRadians(t *testing.T, input string, want float64) {
	t.Helper()
	checkValue(t, input, want, false)
}

func checkValue(t *testing.T, input string, want float64, degrees bool) {
	t.Helper()
	node, err := Parse(input)
	if err != nil {
		t.Errorf("FAIL  %q\n      wouldn't parse: %v", input, err)
		return
	}
	got, err := Evaluate(node, NewEnv(degrees))
	if err != nil {
		t.Errorf("FAIL  %q\n      refused with: %v", input, err)
		return
	}
	if math.Abs(got-want) > closeEnough {
		t.Errorf("FAIL  %q\n      got  %v\n      want %v", input, got, want)
	}
}

// expectValueRefused checks that a line IS turned down.
func expectValueRefused(t *testing.T, input string) {
	t.Helper()
	node, err := Parse(input)
	if err != nil {
		return // refused by the parser, which counts
	}
	if got, err := Evaluate(node, NewEnv(true)); err == nil {
		t.Errorf("FAIL  %q\n      should have been refused, gave %v", input, got)
	}
}

func TestEvaluate(t *testing.T) {
	// ---- arithmetic ---------------------------------------------------------
	expectValue(t, "7", 7)
	expectValue(t, "2+3", 5)
	expectValue(t, "2+3*4", 14)
	expectValue(t, "(2+3)*4", 20)
	expectValue(t, "10-4-3", 3)
	expectValue(t, "8/4/2", 1)
	expectValue(t, "2^3", 8)
	expectValue(t, "2^3^2", 512)
	expectValue(t, "3.5*2", 7)

	// ---- minus in front -----------------------------------------------------
	expectValue(t, "-4", -4)
	expectValue(t, "-2^2", 4) // the parser made this (-2)^2
	expectValue(t, "3*-2", -6)
	expectValue(t, "-(3+4)", -7)

	// ---- constants ----------------------------------------------------------
	expectValue(t, "pi", math.Pi)
	expectValue(t, "e", math.E)
	expectValue(t, "2*pi", math.Pi*2)

	// ---- functions ----------------------------------------------------------
	expectValue(t, "sqrt(16)", 4)
	expectValue(t, "abs(-3)", 3)
	expectValue(t, "round(2.6)", 3)
	expectValue(t, "max(2, 9)", 9)
	expectValue(t, "min(2, 9, 5)", 2)
	expectValue(t, "log(1000)", 3)
	expectValue(t, "sqrt(3^2 + 4^2)", 5)

	// ---- degrees, which is the point for a chemistry student -----------------
	expectValue(t, "sin(30)", 0.5)
	expectValue(t, "cos(60)", 0.5)
	expectValue(t, "sin(0)", 0)
	expectValue(t, "asin(0.5)", 30)
	expectRadians(t, "sin(0)", 0)
	expectRadians(t, "sin(pi/2)", 1)

	// ---- things that should complain ----------------------------------------
	expectValueRefused(t, "1/0")
	expectValueRefused(t, "sqrt(-1)")
	expectValueRefused(t, "nope(2)")
	expectValueRefused(t, "y")
	expectValueRefused(t, "sqrt(1, 2)")
}

// TestCalculate covers the whole line: assignments, and `ans`.
func TestCalculate(t *testing.T) {
	env := NewEnv(true)

	if _, err := Calculate("x = 5", env); err != nil {
		t.Fatalf("FAIL  x = 5 was refused: %v", err)
	}
	if env.Variables["x"] != 5 {
		t.Errorf("FAIL  x = 5 didn't remember x (got %v)", env.Variables["x"])
	}

	got, err := Calculate("x * 3", env)
	if err != nil || got != 15 {
		t.Errorf("FAIL  x * 3 after x = 5: got %v, %v", got, err)
	}

	got, err = Calculate("ans + 1", env)
	if err != nil || got != 16 {
		t.Errorf("FAIL  ans didn't hold the last answer: got %v, %v", got, err)
	}
}
