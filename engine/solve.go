package engine

import (
	"fmt"
	"math"
	"strconv"
)

/*
 * Solving an equation, with the working shown.
 *
 * Only straight-line (linear) equations: one unknown, never multiplied by
 * itself, never inside a function. That covers nearly everything a chemistry
 * or algebra homework asks, and it refuses clearly rather than guessing at
 * the rest.
 *
 * THE IDEA. However it's written, each side of a linear equation is really
 * just `a * x + b`:
 *
 *     3x + 7 = 22        left  a=3, b=7     right a=0, b=22
 *     5 = 2x - 1         left  a=0, b=5     right a=2, b=-1
 *
 * Collect those four numbers and the answer falls out:
 *
 *     a1*x + b1 = a2*x + b2
 *     (a1 - a2) * x = b2 - b1
 *     x = (b2 - b1) / (a1 - a2)
 *
 * The steps printed for the person are that same arithmetic, narrated.
 */

// Linear is one side of an equation, boiled down to `A * x + B`.
type Linear struct {
	A float64
	B float64
}

// Solution is what solving gives back.
type Solution struct {
	Variable string
	Value    float64
	// Steps is one line per move, in the order they were made.
	Steps []string
}

// ---------------------------------------------------------------------------
// Yours
// ---------------------------------------------------------------------------

// Mentions says whether this tree has that name anywhere inside it.
//
// A type switch again, and the simplest one in the engine — no errors, no
// environment, just a question asked of every branch:
//
//	NumberNode  false. A number is never an x.
//	NameNode    n.Text == name
//	UnaryNode   ask the thing inside
//	BinaryNode  ask BOTH sides, || between them
//	CallNode    ask every argument — any one of them counts
//
// The BinaryNode case is the one people forget, and forgetting it makes the
// solver quietly treat 3*x as a plain number.
func Mentions(node Node, name string) bool {
	switch n := node.(type) {
	case NumberNode:
		return false
	case NameNode:
		return n.Text == name
	case UnaryNode:
		return Mentions(n.Value, name)
	case BinaryNode:
		return Mentions(n.Left, name) || Mentions(n.Right, name)
	case CallNode:
		for _, arg := range n.Args {
			if Mentions(arg, name) {
				return true
			}
		}
		return false
	}
	return false
}

// Linearize boils one side down to `a * x + b`, or explains why it can't.
//
// Start with the escape hatch, which is what makes the whole thing work:
//
//	if !Mentions(node, name) { ... }
//
// A branch with no x in it is just a number, however complicated it is — so
// hand it to Evaluate and return Linear{A: 0, B: thatNumber}. That one line
// is why `x + sin(30) = 1.5` solves without this file knowing what sin is.
//
// Then a type switch for the branches that DO mention it:
//
//	NameNode    the name on its own: Linear{A: 1, B: 0}
//	UnaryNode   Linearize what's inside, then negate both halves
//	BinaryNode  Linearize both sides, then:
//	            "+"  add the two A's and the two B's
//	            "-"  subtract them
//	            "*"  one side must be a plain number (its A is 0), so
//	                 multiply the other side's A and B by that number. If
//	                 BOTH sides have an A, x is multiplied by itself —
//	                 refuse with "%s is multiplied by itself".
//	            "/"  the BOTTOM must be a plain number, or x is on the
//	                 bottom of a fraction — refuse. Otherwise divide the
//	                 top's A and B by it.
//	            anything else (that's "^") -> "%s is inside a power"
//
// Anything that falls out of the switch while still mentioning the name is a
// CallNode, so the last line refuses with "%s is inside a function".
//
// Every refusal is an error, so this returns (Linear, error) and every
// recursive call needs the usual `if err != nil` check.
func Linearize(node Node, name string, env *MathEnv) (Linear, error) {
	if !Mentions(node, name) {
		value, err := Evaluate(node, env)
		if err != nil {
			return Linear{}, err
		}
		return Linear{A: 0, B: value}, nil
	}

	switch n := node.(type) {
	case NameNode:
		return Linear{A: 1, B: 0}, nil

	case UnaryNode:
		inside, err := Linearize(n.Value, name, env)
		if err != nil {
			return Linear{}, err
		}
		return Linear{A: -inside.A, B: -inside.B}, nil

	case BinaryNode:
		left, err := Linearize(n.Left, name, env)
		if err != nil {
			return Linear{}, err
		}
		right, err := Linearize(n.Right, name, env)
		if err != nil {
			return Linear{}, err
		}
		switch n.Op {
		case "+":
			return Linear{A: left.A + right.A, B: left.B + right.B}, nil
		case "-":
			return Linear{A: left.A - right.A, B: left.B - right.B}, nil
		case "*":
			if left.A == 0 {
				return Linear{A: right.A * left.B, B: right.B * left.B}, nil
			}
			if right.A == 0 {
				return Linear{A: left.A * right.B, B: left.B * right.B}, nil
			}
			return Linear{}, fmt.Errorf("I can't solve this — %s is multiplied by itself", name)
		case "/":
			if right.A != 0 {
				return Linear{}, fmt.Errorf("I can't solve this — %s is on the bottom of a fraction", name)
			}
			return Linear{A: left.A / right.B, B: left.B / right.B}, nil
		}
		return Linear{}, fmt.Errorf("I can't solve this — %s is inside a power", name)
	}

	return Linear{}, fmt.Errorf("I can't solve this — %s is inside a function", name)
}

// ---------------------------------------------------------------------------
// The narration — written for you
// ---------------------------------------------------------------------------

// round trims floating-point dust: 0.30000000000000004 -> 0.3
//
// JavaScript says Number(value.toPrecision(12)). Go has no toPrecision, so
// it's the same idea spelled out: print to 12 significant digits, read it
// back.
func round(value float64) float64 {
	back, err := strconv.ParseFloat(strconv.FormatFloat(value, 'g', 12, 64), 64)
	if err != nil {
		return value
	}
	return back
}

// times writes "x" rather than "1x", which is how nobody writes it.
func times(count float64, name string) string {
	n := round(math.Abs(count))
	if n == 1 {
		return name
	}
	return fmt.Sprintf("%s%s", trimNumber(n), name)
}

// trimNumber prints a number the way a person writes it: 3, not 3.000000.
func trimNumber(value float64) string {
	return strconv.FormatFloat(value, 'g', -1, 64)
}

// Side writes `a * x + b` the way a person would: 3x + 7, x - 2, 5.
func Side(form Linear, name string) string {
	a := round(form.A)
	b := round(form.B)
	if a == 0 {
		return trimNumber(b)
	}
	term := fmt.Sprintf("%s%s", trimNumber(a), name)
	if a == 1 {
		term = name
	} else if a == -1 {
		term = "-" + name
	}
	if b == 0 {
		return term
	}
	if b > 0 {
		return fmt.Sprintf("%s + %s", term, trimNumber(b))
	}
	return fmt.Sprintf("%s - %s", term, trimNumber(math.Abs(b)))
}

// Solve works the equation out, and writes down how.
//
// It leans entirely on your Linearize for the actual thinking; everything
// here is narration.
func Solve(left, right Node, name string, env *MathEnv) (Solution, error) {
	l, err := Linearize(left, name, env)
	if err != nil {
		return Solution{}, err
	}
	r, err := Linearize(right, name, env)
	if err != nil {
		return Solution{}, err
	}

	steps := []string{fmt.Sprintf("%s = %s", Side(l, name), Side(r, name))}

	// Everything with an x on the left, everything without on the right.
	if r.A != 0 {
		move := r.A
		l.A -= move
		r.A -= move
		word, way := "Subtract", "from"
		if move < 0 {
			word, way = "Add", "to"
		}
		steps = append(steps, fmt.Sprintf("%s %s %s both sides:  %s = %s",
			word, times(move, name), way, Side(l, name), Side(r, name)))
	}
	if l.B != 0 {
		move := l.B
		l.B -= move
		r.B -= move
		word, way := "Subtract", "from"
		if move < 0 {
			word, way = "Add", "to"
		}
		steps = append(steps, fmt.Sprintf("%s %s %s both sides:  %s = %s",
			word, trimNumber(round(math.Abs(move))), way, Side(l, name), Side(r, name)))
	}

	if l.A == 0 {
		// No x left. Either every number works, or none does.
		if r.B == 0 {
			return Solution{}, fmt.Errorf("any value of %s works — that's always true", name)
		}
		return Solution{}, fmt.Errorf("no value of %s works — the two sides can never match", name)
	}

	if l.A != 1 {
		steps = append(steps, fmt.Sprintf("Divide both sides by %s:  %s = %s",
			trimNumber(round(l.A)), name, trimNumber(round(r.B/l.A))))
	}

	value := r.B / l.A
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return Solution{}, fmt.Errorf("that doesn't work out to a number")
	}
	return Solution{Variable: name, Value: value, Steps: steps}, nil
}
