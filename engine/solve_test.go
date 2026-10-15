// Checks for the equation solver.
//
//	go test ./engine/
//
// The same 31 cases as the TypeScript test-solve.ts. Each case is an
// equation and the value of x it should come to. The last group is things it
// should refuse — refusing well is half the job.
package engine

import (
	"math"
	"strings"
	"testing"
)

// runEquation splits "3*x + 7 = 22" into its two halves and solves it.
func runEquation(equation, name string) (Solution, error) {
	at := strings.Index(equation, "=")
	if at == -1 {
		return Solution{}, errNoEquals
	}
	left, err := Parse(equation[:at])
	if err != nil {
		return Solution{}, err
	}
	right, err := Parse(equation[at+1:])
	if err != nil {
		return Solution{}, err
	}
	return Solve(left, right, name, NewEnv(true))
}

var errNoEquals = errString("there's no = in that")

// errString is the shortest way to make an error out of a constant. Go's
// errors.New would do the same; this keeps the test file to one import less.
type errString string

func (e errString) Error() string { return string(e) }

func expectSolves(t *testing.T, equation string, want float64, name string) {
	t.Helper()
	got, err := runEquation(equation, name)
	if err != nil {
		t.Errorf("FAIL  %s\n      refused with: %v", equation, err)
		return
	}
	if math.Abs(got.Value-want) > closeEnough {
		t.Errorf("FAIL  %s\n      got %s = %v, want %v", equation, name, got.Value, want)
	}
}

func expectSolveRefused(t *testing.T, equation string) {
	t.Helper()
	if got, err := runEquation(equation, "x"); err == nil {
		t.Errorf("FAIL  %s\n      should have been refused, gave %v", equation, got.Value)
	}
}

func TestMentions(t *testing.T) {
	cases := []struct {
		input string
		name  string
		want  bool
	}{
		{"x", "x", true},
		{"3*x + 1", "x", true},
		{"sin(x)", "x", true},
		{"-x", "x", true},
		{"2 + 3", "x", false},
		{"sin(30) + pi", "x", false},
		{"y + 1", "x", false},
	}
	for _, c := range cases {
		node, err := Parse(c.input)
		if err != nil {
			t.Errorf("FAIL  %q wouldn't parse: %v", c.input, err)
			continue
		}
		if got := Mentions(node, c.name); got != c.want {
			t.Errorf("FAIL  Mentions(%q, %q)\n      got  %v\n      want %v",
				c.input, c.name, got, c.want)
		}
	}
}

func TestLinearize(t *testing.T) {
	env := NewEnv(true)
	cases := []struct {
		input string
		want  Linear
	}{
		{"3*x + 7", Linear{A: 3, B: 7}},
		{"x", Linear{A: 1, B: 0}},
		{"22", Linear{A: 0, B: 22}},
		{"-x + 2", Linear{A: -1, B: 2}},
		{"x/2", Linear{A: 0.5, B: 0}},
		{"2*(x + 3)", Linear{A: 2, B: 6}},
	}
	for _, c := range cases {
		node, err := Parse(c.input)
		if err != nil {
			t.Errorf("FAIL  %q wouldn't parse: %v", c.input, err)
			continue
		}
		got, err := Linearize(node, "x", env)
		if err != nil {
			t.Errorf("FAIL  Linearize(%q)\n      refused with: %v", c.input, err)
			continue
		}
		// Two structs of comparable fields can be compared with == in Go.
		if got != c.want {
			t.Errorf("FAIL  Linearize(%q)\n      got  %+v\n      want %+v", c.input, got, c.want)
		}
	}
}

func TestSolve(t *testing.T) {
	// ---- solving ------------------------------------------------------------
	expectSolves(t, "3*x + 7 = 22", 5, "x")
	expectSolves(t, "2*x = 10", 5, "x")
	expectSolves(t, "x + 1 = 4", 3, "x")
	expectSolves(t, "x - 5 = 0", 5, "x")
	expectSolves(t, "5 = 2*x - 1", 3, "x")
	expectSolves(t, "2*x + 1 = x + 4", 3, "x")
	expectSolves(t, "4*(x - 1) = 8", 3, "x")
	expectSolves(t, "x/2 = 6", 12, "x")
	expectSolves(t, "-x = -7", 7, "x")
	expectSolves(t, "3*x + 2 = 2*x + 2", 0, "x")
	expectSolves(t, "2*t + 4 = 10", 3, "t")
	expectSolves(t, "x + sin(30) = 1.5", 1, "x") // the bit that isn't x is just a number

	// ---- refusing -----------------------------------------------------------
	expectSolveRefused(t, "x^2 = 4")       // not a straight line
	expectSolveRefused(t, "x * x = 9")     // same thing, written differently
	expectSolveRefused(t, "sin(x) = 1")    // x inside a function
	expectSolveRefused(t, "1/x = 2")       // x on the bottom
	expectSolveRefused(t, "x + 1 = x + 2") // never true
	expectSolveRefused(t, "x + 1 = x + 1") // always true
}

// TestSteps checks the narration, which is what the person actually reads.
func TestSteps(t *testing.T) {
	got, err := runEquation("3*x + 7 = 22", "x")
	if err != nil {
		t.Fatalf("FAIL  3*x + 7 = 22 was refused: %v", err)
	}
	want := []string{
		"3x + 7 = 22",
		"Subtract 7 from both sides:  3x = 15",
		"Divide both sides by 3:  x = 5",
	}
	if len(got.Steps) != len(want) {
		t.Fatalf("FAIL  wanted %d steps, got %d: %q", len(want), len(got.Steps), got.Steps)
	}
	for i := range want {
		if got.Steps[i] != want[i] {
			t.Errorf("FAIL  step %d\n      got  %q\n      want %q", i+1, got.Steps[i], want[i])
		}
	}
}
