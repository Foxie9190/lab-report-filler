//go:build js && wasm

// The bridge: the maths engine, exposed to JavaScript.
//
// The app loads math.wasm, and this file hangs three functions off the
// browser's global object. The TypeScript side calls them and gets JSON back.
//
// WHY JSON, AND WHY NOTHING IS REMEMBERED HERE.
//
// Every call takes the variables as JSON and hands the new set back. Nothing
// about the person's work lives on this side of the boundary. That costs a
// little speed and buys a lot: there is exactly one copy of the state, in
// TypeScript, so the two sides can never disagree about what x is — which is
// the bug that two-language projects always get wrong first.
package main

import (
	"encoding/json"
	"regexp"
	"syscall/js"

	"labfiller/engine"
)

// The graph screen sends lines as the person typed them: "y = x^2 - 3". The
// "y =" is a label, not arithmetic, so it comes off before parsing — spaces
// and capitals and all.
var curveLabel = regexp.MustCompile(`^\s*[yY]\s*=\s*`)

// envFrom rebuilds an environment from what the app sent.
func envFrom(degrees bool, variables string) *engine.MathEnv {
	env := engine.NewEnv(degrees)
	if variables == "" {
		return env
	}
	var set map[string]float64
	if err := json.Unmarshal([]byte(variables), &set); err == nil {
		for name, value := range set {
			env.Variables[name] = value
		}
	}
	return env
}

// reply turns anything into the JSON string the app reads.
func reply(value any) string {
	out, err := json.Marshal(value)
	if err != nil {
		return `{"ok":false,"error":"couldn't write the answer"}`
	}
	return string(out)
}

func fail(err error) string {
	return reply(map[string]any{"ok": false, "error": err.Error()})
}

// calculate(input, degrees, variablesJSON) -> {ok, value, variables} | {ok, error}
func calculate(_ js.Value, args []js.Value) any {
	env := envFrom(args[1].Bool(), args[2].String())
	value, err := engine.Calculate(args[0].String(), env)
	if err != nil {
		return fail(err)
	}
	return reply(map[string]any{"ok": true, "value": value, "variables": env.Variables})
}

// sample(expression, from, to, steps, degrees, variablesJSON) -> {ok, ys}
//
// One call for a whole curve rather than one per point. Crossing between
// JavaScript and Go costs far more than the arithmetic does, so the graph
// asks for six hundred values at once instead of six hundred times.
//
// A point that can't be worked out — sqrt of a negative, a divide by zero —
// comes back as null, which is how the graph already draws a gap rather than
// a fake line through it.
func sample(_ js.Value, args []js.Value) any {
	env := envFrom(args[4].Bool(), args[5].String())
	node, err := engine.Parse(curveLabel.ReplaceAllString(args[0].String(), ""))
	if err != nil {
		return fail(err)
	}

	from, to := args[1].Float(), args[2].Float()
	steps := args[3].Int()
	if steps < 2 {
		steps = 2
	}

	ys := make([]any, 0, steps)
	for i := 0; i < steps; i++ {
		x := from + (to-from)*float64(i)/float64(steps-1)
		env.Variables["x"] = x
		value, err := engine.Evaluate(node, env)
		if err != nil {
			ys = append(ys, nil)
			continue
		}
		ys = append(ys, value)
	}
	return reply(map[string]any{"ok": true, "ys": ys})
}

// solve(left, right, name, degrees, variablesJSON) -> {ok, variable, value, steps}
func solve(_ js.Value, args []js.Value) any {
	env := envFrom(args[3].Bool(), args[4].String())
	left, err := engine.Parse(args[0].String())
	if err != nil {
		return fail(err)
	}
	right, err := engine.Parse(args[1].String())
	if err != nil {
		return fail(err)
	}
	answer, err := engine.Solve(left, right, args[2].String(), env)
	if err != nil {
		return fail(err)
	}
	return reply(map[string]any{
		"ok":       true,
		"variable": answer.Variable,
		"value":    answer.Value,
		"steps":    answer.Steps,
	})
}

func main() {
	js.Global().Set("mathEngine", js.ValueOf(map[string]any{
		"calculate": js.FuncOf(calculate),
		"sample":    js.FuncOf(sample),
		"solve":     js.FuncOf(solve),
	}))
	// Park forever. When main returns, Go tears the whole thing down and the
	// functions above stop existing.
	select {}
}
