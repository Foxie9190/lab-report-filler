package engine

import (
	"fmt"
	"math"
	"regexp"
)

/*
 * Step three: walk the tree and come back with a number.
 *
 * The thinking is already done. The parser decided what happens first by
 * where it put things in the tree, so this file never worries about
 * precedence, brackets or what order anything goes in. It asks each node
 * what it is, works out its children, and does the one small thing that
 * node means.
 *
 *            +            Evaluate(+)  needs both sides
 *           / \           ->  Evaluate(2)  = 2
 *          2   *          ->  Evaluate(*)  needs both sides
 *             / \                ->  3 and 4, so 12
 *            3   4         ->  2 + 12 = 14
 *
 * That's it. A function that calls itself, three or four cases deep.
 */

// MathEnv is what the calculator remembers between lines: whether angles are
// in degrees, and any variables that have been set.
//
// Go has no Map type with methods like JavaScript's — a plain map is the
// whole thing, and the zero value of a map is nil, which you can read from
// but not write to. That's why NewEnv exists rather than MathEnv{}.
type MathEnv struct {
	Degrees   bool
	Variables map[string]float64
}

// NewEnv makes an environment. Go has no default arguments, so degrees is
// always spelled out at the call site — newEnv() in TypeScript is
// NewEnv(true) here.
func NewEnv(degrees bool) *MathEnv {
	return &MathEnv{Degrees: degrees, Variables: map[string]float64{}}
}

// constants are the names that are always worth the same.
var constants = map[string]float64{
	"pi": math.Pi,
	"e":  math.E,
}

// MathFunction is one built-in function.
//
// Takes is how many arguments it needs; -1 means any number. The degree
// conversions live in here so that Evaluate doesn't have to know sin is
// special.
type MathFunction struct {
	Takes int
	Run   func(args []float64, env *MathEnv) float64
}

func toRadians(x float64, env *MathEnv) float64 {
	if env.Degrees {
		return x * math.Pi / 180
	}
	return x
}

func fromRadians(x float64, env *MathEnv) float64 {
	if env.Degrees {
		return x * 180 / math.Pi
	}
	return x
}

// FUNCTIONS is the built-ins as data rather than a pile of if-statements, so
// adding one is a line here and the calculator screen can list them without
// being told.
var FUNCTIONS = map[string]MathFunction{
	"sqrt":  {Takes: 1, Run: func(a []float64, _ *MathEnv) float64 { return math.Sqrt(a[0]) }},
	"abs":   {Takes: 1, Run: func(a []float64, _ *MathEnv) float64 { return math.Abs(a[0]) }},
	"round": {Takes: 1, Run: func(a []float64, _ *MathEnv) float64 { return math.Round(a[0]) }},
	"floor": {Takes: 1, Run: func(a []float64, _ *MathEnv) float64 { return math.Floor(a[0]) }},
	"ceil":  {Takes: 1, Run: func(a []float64, _ *MathEnv) float64 { return math.Ceil(a[0]) }},
	"ln":    {Takes: 1, Run: func(a []float64, _ *MathEnv) float64 { return math.Log(a[0]) }},
	"log":   {Takes: 1, Run: func(a []float64, _ *MathEnv) float64 { return math.Log10(a[0]) }},

	"sin": {Takes: 1, Run: func(a []float64, e *MathEnv) float64 { return math.Sin(toRadians(a[0], e)) }},
	"cos": {Takes: 1, Run: func(a []float64, e *MathEnv) float64 { return math.Cos(toRadians(a[0], e)) }},
	"tan": {Takes: 1, Run: func(a []float64, e *MathEnv) float64 { return math.Tan(toRadians(a[0], e)) }},

	"asin": {Takes: 1, Run: func(a []float64, e *MathEnv) float64 { return fromRadians(math.Asin(a[0]), e) }},
	"acos": {Takes: 1, Run: func(a []float64, e *MathEnv) float64 { return fromRadians(math.Acos(a[0]), e) }},
	"atan": {Takes: 1, Run: func(a []float64, e *MathEnv) float64 { return fromRadians(math.Atan(a[0]), e) }},

	"min": {Takes: -1, Run: func(a []float64, _ *MathEnv) float64 {
		out := a[0]
		for _, value := range a[1:] {
			out = math.Min(out, value)
		}
		return out
	}},
	"max": {Takes: -1, Run: func(a []float64, _ *MathEnv) float64 {
		out := a[0]
		for _, value := range a[1:] {
			out = math.Max(out, value)
		}
		return out
	}},
}

// realNumber stops a non-number from escaping.
//
// sqrt(-1) is NaN and 10^400 is +Inf, and either one, left alone, spreads
// through every calculation that touches it and eventually draws a graph
// with an invisible hole in it. Better to say so where it happened.
//
// (It isn't called real() because Go already has a builtin by that name, for
// the real half of a complex number.)
func realNumber(value float64, what string) (float64, error) {
	if math.IsNaN(value) {
		return 0, fmt.Errorf("%s doesn't give a real number", what)
	}
	if math.IsInf(value, 0) {
		return 0, fmt.Errorf("%s is too big to work out", what)
	}
	return value, nil
}

// ---------------------------------------------------------------------------
// Evaluate — yours
// ---------------------------------------------------------------------------

/*
 * This one DOES return an error, unlike the four parse functions.
 *
 * That was deliberate: the parser hides its error on the reader because four
 * levels of (Node, error) would have buried the shape of it. Here the normal
 * Go way is the right way, and it's the pattern you'll use everywhere else:
 * work out a child, check the error, pass it up.
 *
 *	left, err := Evaluate(n.Left, env)
 *	if err != nil {
 *		return 0, err
 *	}
 *
 * The 0 is not an answer — when err is not nil, the caller must ignore the
 * number. That's the contract everywhere in Go.
 *
 * Write it as a type switch, the same shape as show() in parse_test.go:
 *
 *	switch n := node.(type) {
 *	case NumberNode:
 *		...
 *	}
 *
 * Five cases:
 *
 *   NumberNode  give back n.Value. Nothing to do.
 *   BinaryNode  work out BOTH sides, then apply n.Op. + - * are plain. For
 *               "/" refuse a zero right-hand side with "can't divide by
 *               zero" rather than handing back +Inf. For "^" use
 *               math.Pow(left, right) and pass it through realNumber(...,
 *               "that power").
 *   UnaryNode   work out n.Value, then negate it. Only "-" exists for now.
 *   NameNode    a variable the person set wins over a constant, so e = 2
 *               works for someone using e in a chemistry problem:
 *               value, ok := env.Variables[n.Text] first, then constants,
 *               then complain that nobody knows what it is.
 *   CallNode    look n.Name up in FUNCTIONS, work out every argument, check
 *               it got the right number of them (Takes == -1 means any, but
 *               still at least one), then realNumber(fn.Run(args, env),
 *               n.Name).
 *
 * `value, ok := someMap[key]` is how Go asks "is it in there?" — ok is a
 * bool, and reading a missing key would otherwise quietly give you 0.
 */
func Evaluate(node Node, env *MathEnv) (float64, error) {
	switch n := node.(type) {
	case NumberNode:
		return n.Value, nil

	case BinaryNode:
		left, err := Evaluate(n.Left, env)
		if err != nil {
			return 0, err
		}
		right, err := Evaluate(n.Right, env)
		if err != nil {
			return 0, err
		}
		switch n.Op {
		case "+":
			return left + right, nil
		case "-":
			return left - right, nil
		case "*":
			return left * right, nil
		case "/":
			if right == 0 {
				return 0, fmt.Errorf("can't divide by zero")
			}
			return left / right, nil
		case "^":
			return realNumber(math.Pow(left, right), "that power")
		}
		return 0, fmt.Errorf("I don't know what %q means here", n.Op)

	case UnaryNode:
		value, err := Evaluate(n.Value, env)
		if err != nil {
			return 0, err
		}
		if n.Op == "-" {
			return -value, nil
		}
		return 0, fmt.Errorf("I don't know what %q means here", n.Op)

	case NameNode:
		if value, ok := env.Variables[n.Text]; ok {
			return value, nil
		}
		if value, ok := constants[n.Text]; ok {
			return value, nil
		}
		return 0, fmt.Errorf("I don't know what %q is", n.Text)

	case CallNode:
		fn, ok := FUNCTIONS[n.Name]
		if !ok {
			return 0, fmt.Errorf("I don't know a function called %q", n.Name)
		}
		args := make([]float64, 0, len(n.Args))
		for _, arg := range n.Args {
			value, err := Evaluate(arg, env)
			if err != nil {
				return 0, err
			}
			args = append(args, value)
		}
		if fn.Takes != -1 && len(args) != fn.Takes {
			word := "numbers"
			if fn.Takes == 1 {
				word = "number"
			}
			return 0, fmt.Errorf("%s takes %d %s, not %d", n.Name, fn.Takes, word, len(args))
		}
		if fn.Takes == -1 && len(args) == 0 {
			return 0, fmt.Errorf("%s needs at least one number", n.Name)
		}
		return realNumber(fn.Run(args, env), n.Name)
	}
	return 0, fmt.Errorf("I don't know how to work that out")
}

// ---------------------------------------------------------------------------
// The whole line — written for you
// ---------------------------------------------------------------------------

/*
 * Go's regexp package is RE2, which has no lookahead — there is no (?!=) to
 * borrow from the TypeScript version. RE2 gives up that feature on purpose:
 * no backtracking means every match is guaranteed linear in the length of
 * the input, so no regex can ever hang the app.
 *
 * So "not followed by another =" is written as "followed by a character that
 * isn't =, or by nothing at all": ([^=].*|)$. x = 5 matches; x == 5 doesn't,
 * and falls through to the parser, which refuses it.
 */
var assignment = regexp.MustCompile(`^\s*([a-zA-Z][a-zA-Z0-9]*)\s*=([^=].*|)$`)

// Calculate works out a whole typed line: "3 + 4", or "x = 5" to remember a
// value.
//
// The assignment is pulled apart here rather than taught to the parser,
// because = isn't arithmetic: the graph screen hands expressions straight to
// Evaluate, and it should never be possible for drawing a curve to set a
// variable as a side effect.
func Calculate(input string, env *MathEnv) (float64, error) {
	if found := assignment.FindStringSubmatch(input); found != nil {
		node, err := Parse(found[2])
		if err != nil {
			return 0, err
		}
		value, err := Evaluate(node, env)
		if err != nil {
			return 0, err
		}
		env.Variables[found[1]] = value
		return value, nil
	}

	node, err := Parse(input)
	if err != nil {
		return 0, err
	}
	answer, err := Evaluate(node, env)
	if err != nil {
		return 0, err
	}
	env.Variables["ans"] = answer // so the next line can say `ans * 2`
	return answer, nil
}
