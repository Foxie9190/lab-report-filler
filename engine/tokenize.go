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

// Tokenize turns a line of text into tokens.
//
// This function does NO maths. It doesn't know that * beats +, it doesn't
// know what sin is, it doesn't care whether the brackets match. It turns a
// line of text into a list of pieces the parser can reason about, and keeping
// it this dumb is the point.
//
// Walk the input one character at a time. At each one, decide which of these
// four it is:
//
//  1. a space        -> skip it
//  2. a digit or '.' -> take every digit and dot that follows, and append
//     Token{Kind: Number, Value: thatNumber}
//  3. a letter       -> take every letter and digit that follows, and append
//     Token{Kind: Name, Text: thatText}
//  4. in ops         -> append Token{Kind: Op, Text: thatCharacter}
//
// Anything else is a typo, and a typo should say so out loud. Go has no
// `throw`: a function that can fail returns an error as its last result, and
// the caller checks it. So instead of throwing, return what you have so far
// (or nil) and an error:
//
//	return nil, fmt.Errorf("I don't understand %q", string(ch))
//
// %q puts the quotes on for you, so a stray $ reads as: I don't understand "$".
//
// Five things you will need, none of which TypeScript made you think about:
//
//   - []rune(input) turns the string into a slice of characters. Indexing a Go
//     string gives you BYTES, and a character like − is three bytes, so a
//     plain input[i] would split it into nonsense in the error message.
//   - len(runes) is the length. No .length.
//   - append(tokens, Token{...}) grows a slice. It returns the new slice, so
//     it is always tokens = append(tokens, ...).
//   - strconv.ParseFloat(text, 64) is Number(text). It returns (float64, error).
//   - strings.ContainsRune(ops, ch) is ops.includes(ch), and there is no regex
//     needed for the rest: ch >= '0' && ch <= '9' is the digit test, and
//     unicode.IsLetter(ch) the letter one.
//
// Start by making the empty input and "3" pass, then work down the test file.
func Tokenize(input string) ([]Token, error) {
	tokens := []Token{}

	// Your code goes here.

	return tokens, nil
}
