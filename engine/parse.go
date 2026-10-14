package engine

import (
	"fmt"
)

/*
 * Step two of the maths engine: turn the flat list of tokens into a tree.
 *
 * The tokenizer gives you pieces in the order they were typed:
 *
 *     2 + 3 * 4   ->   2  +  3  *  4
 *
 * which says nothing about what happens first. The tree does:
 *
 *            +
 *           / \        the * is INSIDE the +, so it has to be worked out
 *          2   *       first — the answer is 14, not 20
 *             / \
 *            3   4
 *
 * That's the whole job. No arithmetic happens here; this file only decides
 * the shape. The evaluator walks the finished tree and does the maths.
 */

// Node is one spot in the tree.
//
// Go has no union types. Where TypeScript wrote one Node type with five
// shapes, Go writes five types and one interface they all satisfy. isNode()
// does nothing at all — it exists so that ONLY the five types below can be
// used as a Node. That is Go's way of saying "and nothing else", and it is
// why a type switch over a Node can be trusted.
//
// They carry a Node suffix because the token kinds in tokenize.go already
// own Number, Name and Op in this package. In a bigger Go program tokens and
// nodes would live in two packages and both could use the plain names.
type Node interface{ isNode() }

// NumberNode is a plain number: 2, 3.5
type NumberNode struct{ Value float64 }

// NameNode is a name standing on its own: x, pi, ans
type NameNode struct{ Text string }

// UnaryNode is one thing with an operator in front: -4
type UnaryNode struct {
	Op    string
	Value Node
}

// BinaryNode is two things with an operator between: 2 + 3
type BinaryNode struct {
	Op          string
	Left, Right Node
}

// CallNode is a name with arguments in brackets: sin(30), max(2, 9)
type CallNode struct {
	Name string
	Args []Node
}

func (NumberNode) isNode() {}
func (NameNode) isNode()   {}
func (UnaryNode) isNode()  {}
func (BinaryNode) isNode() {}
func (CallNode) isNode()   {}

// ---------------------------------------------------------------------------
// The reader — written for you. It is bookkeeping, not an idea.
// ---------------------------------------------------------------------------

/*
 * A place in the token list, with a few manners.
 *
 * It also carries the error, which is the one real difference from the
 * TypeScript version. TypeScript threw, and a throw escapes every function
 * between here and the top by itself. Go has no throw, and returning
 * (Node, error) from all four levels would bury the shape of the parser in
 * error checks.
 *
 * So the error sticks to the reader. This is a real Go pattern — it is how
 * bufio.Scanner works: you loop until it stops, then ask Err() what went
 * wrong. Once an error is set, peek() returns nil, so every atOp() goes
 * false, every loop below ends, and parsing unwinds on its own. Parse() asks
 * for the error at the end.
 */
type reader struct {
	tokens []Token
	at     int
	err    error
}

// fail records the FIRST thing that went wrong and ignores the rest: by the
// time a parse unwinds, the later complaints are consequences, not causes.
func (r *reader) fail(format string, args ...any) {
	if r.err == nil {
		r.err = fmt.Errorf(format, args...)
	}
}

// peek is what's next, without taking it. nil means nothing is left — or
// that something has already gone wrong.
func (r *reader) peek() *Token {
	if r.err != nil || r.at >= len(r.tokens) {
		return nil
	}
	return &r.tokens[r.at]
}

// next takes the next token, or returns nil if there isn't one.
func (r *reader) next() *Token {
	token := r.peek()
	if token != nil {
		r.at++
	}
	return token
}

// atOp asks whether the next token is this exact operator.
func (r *reader) atOp(text string) bool {
	token := r.peek()
	return token != nil && token.Kind == Op && token.Text == text
}

// take swallows that operator if it is next, and says whether it did.
func (r *reader) take(text string) bool {
	if !r.atOp(text) {
		return false
	}
	r.at++
	return true
}

// expect swallows it, or complains that it is missing.
func (r *reader) expect(text string) {
	if !r.take(text) {
		r.fail("I expected %q here", text)
	}
}

// done says whether there is nothing left to read.
func (r *reader) done() bool { return r.at >= len(r.tokens) }

// describe is a token as a person would read it, for error messages.
func describe(token Token) string {
	if token.Kind == Number {
		return fmt.Sprintf("%g", token.Value)
	}
	return token.Text
}

// ---------------------------------------------------------------------------
// The four levels — yours
// ---------------------------------------------------------------------------

/*
 * Loosest first:
 *
 *   expression   + and -        2 + 3
 *   term         * and /        2 * 3
 *   power        ^              2 ^ 3
 *   atom         a number, a name, a call, or ( something )
 *
 * Each level asks the level below it for its pieces. That stack IS the
 * precedence: by the time parseExpression gets its left-hand side, parseTerm
 * has already swallowed any multiplying, so the multiply ends up deeper in
 * the tree and therefore happens first. No table of priorities anywhere.
 *
 * None of these return an error — the reader is holding it. Just build nodes
 * and let the loops end.
 */

// parseExpression handles + and -, left to right: 10 - 4 - 3 is (10 - 4) - 3.
//
// Ask parseTerm for the left-hand side. Then, while the next token is + or -,
// take it, ask parseTerm for the right-hand side, and wrap what you have:
//
//	left = BinaryNode{Op: op, Left: left, Right: right}
//
// Rewrapping `left` each time around the loop is what makes it lean left.
func parseExpression(r *reader) Node {
	left := parseTerm(r)
	for r.atOp("+") || r.atOp("-") {
		op := "+"
		if r.atOp("-") {
			op = "-"
		}
		r.take(op)
		right := parseTerm(r)
		left = BinaryNode{Op: op, Left: left, Right: right}
	}
	return left
}

// startsFactor says whether the next token begins something new to multiply
// by, with no operator written between.
//
// This is what makes 3x mean 3 * x, the way it's written on paper. It must
// be ONLY a name or an opening bracket: allowing a number here would make
// "2 3" quietly mean 6, and two numbers in a row is a typo, not a sum. The
// test expects "2 3" to be refused.
func startsFactor(r *reader) bool {
	token := r.peek()
	if token == nil {
		return false
	}
	if token.Kind == Name {
		return true
	}
	return token.Kind == Op && token.Text == "("
}

// parseTerm handles * and /, left to right — the same shape as
// parseExpression, built on parsePower instead.
//
// One extra: the loop also continues when startsFactor(r) is true, with no
// operator taken. In that case the operator is "*" anyway.
func parseTerm(r *reader) Node {
	left := parsePower(r)
	for r.atOp("*") || r.atOp("/") || startsFactor(r) {
		op := "*"
		if !r.take("*") {
			if r.take("/") {
				op = "/"
			}
		}
		right := parsePower(r)
		left = BinaryNode{Op: op, Left: left, Right: right}
	}
	return left
}

// parsePower handles ^, which leans RIGHT: 2^3^2 is 2^(3^2), which is 512.
//
// Ask parseAtom for the left-hand side. If the next token is ^, take it and
// make the right-hand side parsePower(r) — calling itself rather than
// looping is the whole trick. If there's no ^, hand back what you got.
func parsePower(r *reader) Node {
	left := parseAtom(r)
	if r.take("^") {
		return BinaryNode{Op: "^", Left: left, Right: parsePower(r)}
	}
	return left
}

// parseAtom handles the smallest pieces: a number, a name, sin(30), or
// ( anything ).
//
// In order:
//
//  1. r.take("-") -> UnaryNode{Op: "-", Value: parseAtom(r)}
//  2. token := r.next(); if it's nil, r.fail("the expression stops too
//     early") and return nil
//  3. a Number token    -> NumberNode{Value: token.Value}
//  4. a Name token      -> if r.take("(") it's a call: read arguments with
//     parseExpression while r.take(",") keeps finding commas, then
//     r.expect(")"), and return CallNode. Watch for sin() with nothing in
//     it: check !r.atOp(")") before reading the first argument. No bracket
//     after the name means it's just a name -> NameNode.
//  5. op "("           -> parse what's inside with parseExpression, then
//     r.expect(")"), and hand back the inside as one piece. That jump from
//     the bottom of the chain back to the top is why brackets beat
//     everything.
//  6. anything else     -> r.fail("I didn't expect %q here", describe(*token))
//     and return nil
func parseAtom(r *reader) Node {
	if r.take("-") {
		return UnaryNode{Op: "-", Value: parseAtom(r)}
	}
	token := r.next()
	if token == nil {
		r.fail("the expression stops too early")
		return nil
	}
	if token.Kind == Number {
		return NumberNode{Value: token.Value}
	}
	if token.Kind == Name {
		if r.take("(") {
			args := []Node{}
			if !r.atOp(")") {
				for {
					args = append(args, parseExpression(r))
					if !r.take(",") {
						break
					}
				}
			}
			r.expect(")")
			return CallNode{Name: token.Text, Args: args}
		}
		return NameNode{Text: token.Text}

	}
	if token.Kind == Op && token.Text == "(" {
		inside := parseExpression(r)
		r.expect(")")
		return inside
	}
	r.fail("I didn't expect %q here", describe(*token))
	return nil
}

// Parse turns text into a tree. This is what the rest of the app calls.
func Parse(input string) (Node, error) {
	tokens, err := Tokenize(input)
	if err != nil {
		return nil, err
	}

	r := &reader{tokens: tokens}
	if r.done() {
		return nil, fmt.Errorf("nothing to work out")
	}

	node := parseExpression(r)
	if r.err != nil {
		return nil, r.err
	}
	// Anything left over means the input didn't make sense: "2 3" parses a 2
	// and then finds a 3 nobody asked for.
	if !r.done() {
		return nil, fmt.Errorf("there's something extra on the end")
	}
	return node, nil
}
