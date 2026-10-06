/**
 * Step one of the math engine: chop text into pieces.
 *
 * "3 + 4*2"  ->  number 3, op +, number 4, op *, number 2
 *
 * This file does NO math. It doesn't know that * beats +, it doesn't know
 * what sin is, it doesn't care whether the brackets match. All it does is
 * turn a line of text into a list of pieces that the next stage can reason
 * about. Keeping it this dumb is the point: every later stage gets to work
 * with tidy pieces instead of poking at strings.
 */

/**
 * One piece of the input.
 *
 * Three kinds, and that's enough for everything:
 *   number  12, 3.5, .5
 *   name    x, pi, sin        (a letter, then more letters or digits)
 *   op      + - * / ^ ( ) , =  (one character, always)
 */
export type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; text: string }
  | { kind: "op"; text: string };

/** The characters that count as operators. */
const OPS = "+-*/^(),=";

/**
 * Turn a line of text into tokens.
 *
 * Walk the string one character at a time. At each character, decide which
 * of these four it is, and handle it:
 *
 *   1. a space        -> skip it, move on
 *   2. a digit or '.' -> read every digit and dot that follows, and push
 *                        { kind: "number", value: Number(thatText) }
 *   3. a letter       -> read every letter and digit that follows, and push
 *                        { kind: "name", text: thatText }
 *   4. in OPS         -> push { kind: "op", text: thatCharacter }
 *
 * Anything else is a typo, and a typo should say so out loud:
 *
 *     throw new Error(`I don't understand "${character}"`);
 *
 * Throwing beats returning something half-right. The screen catches it and
 * shows the message, so "3 + $" tells the person what's wrong instead of
 * quietly giving a wrong answer.
 *
 * Two hints:
 *   - A while loop with your own index is easier here than a for-of,
 *     because numbers and names eat several characters at once.
 *   - /[0-9]/.test(ch) and /[a-z]/i.test(ch) are the quick tests.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (OPS.includes(ch)) {
      tokens.push({ kind: "op", text: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let text = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        text += input[i];
        i++;
      }
      tokens.push({ kind: "number", value: Number(text) });
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let text = "";
      while (i < input.length && /[a-z0-9]/i.test(input[i])) {
        text += input[i];
        i++;
      }
      tokens.push({ kind: "name", text });
      continue;
    }
    throw new Error(`I don't understand "${ch}"`);
  }
  return tokens;
}
