// Package engine is the maths engine: text in, answers out.
//
// It is the same three steps as the TypeScript version it replaces —
// tokenize -> parse -> evaluate — because the design was never the problem.
// Only the language is new. The app loads this compiled to WebAssembly, so
// one copy of the engine runs in the desktop app and in the browser.
//
// Nothing in this package knows what a button is. It takes strings and
// returns numbers and errors, which is what makes it testable with `go test`
// and swappable behind the UI.
package engine

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// Kind says which of the three sorts of piece a Token is.
//
// Go has no union types, so where TypeScript wrote
//
//	{ kind: "number"; value: number } | { kind: "name"; text: string } | ...
//
// Go writes one struct with a Kind field, and you read the field that goes
// with that kind. iota just numbers the constants 0, 1, 2 for you.
type Kind int

const (
	Number Kind = iota // 12, 3.5, .5       -> Value
	Name               // x, pi, sin         -> Text
	Op                 // + - * / ^ ( ) , =  -> Text
)

// Token is one piece of the input.
//
// Value is only meaningful when Kind is Number; Text only when Kind is Name
// or Op. The other field is left at its zero value, which in Go is 0 and ""
// rather than undefined.
type Token struct {
	Kind  Kind
	Value float64
	Text  string
}

// ops are the characters that count as operators.
const ops = "+-*/^(),="

func Tokenize(input string) ([]Token, error) {
	tokens := []Token{}
	runes := []rune(input)
	i := 0

	for i < len(runes) {
		ch := runes[i]

		if ch == ' ' {
			i++
			continue
		}
		if strings.ContainsRune(ops, ch) {
			tokens = append(tokens, Token{Kind: Op, Text: string(ch)})
			i++
			continue
		}
		if (ch >= '0' && ch <= '9') || ch == '.' {
			start := i
			for i < len(runes) && ((runes[i] >= '0' && runes[i] <= '9') || runes[i] == '.') {
				i++
			}
			text := string(runes[start:i])
			value, err := strconv.ParseFloat(text, 64)

			if err != nil {
				return nil, fmt.Errorf("I dont understand %q", text)
			}
			tokens = append(tokens, Token{Kind: Number, Value: value})
			continue
		}

		if unicode.IsLetter(ch) {
			start := i
			for i < len(runes) && (unicode.IsLetter(runes[i]) || (runes[i] >= '0' && runes[i] <= '9')) {
				i++
			}
			tokens = append(tokens, Token{Kind: Name, Text: string(runes[start:i])})
			continue
		}
		return nil, fmt.Errorf("I dont Understand %q", string(ch))
	}

	return tokens, nil
}
