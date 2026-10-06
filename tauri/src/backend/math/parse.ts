/**
 * Step two of the math engine: turn the flat list of tokens into a tree.
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
 * the shape. The evaluator walks the finished tree and does the math.
 */

import { tokenize } from "./tokenize";
import type { Token } from "./tokenize";

/**
 * One spot in the tree.
 *
 *   number   2
 *   name     x, pi
 *   unary    -4            (one thing, with an operator in front)
 *   binary   2 + 3         (two things with an operator between)
 *   call     sin(30)       (a name with arguments in brackets)
 */
export type Node =
  | { kind: "number"; value: number }
  | { kind: "name"; text: string }
  | { kind: "unary"; op: string; value: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] };

/**
 * A place in the token list, with a few manners.
 *
 * Written for you — it is bookkeeping, not an idea. Four things it does:
 *
 *   peek()         what's next, without taking it
 *   next()         take the next token
 *   atOp("+")      is the next token this exact operator?
 *   take("+")      if it is, swallow it and return true; otherwise false
 *   expect(")")    swallow it, or complain that it's missing
 *   done()         nothing left
 */
function reader(tokens: Token[]) {
  let at = 0;
  return {
    peek: (): Token | null => tokens[at] ?? null,
    next: (): Token | null => tokens[at++] ?? null,
    atOp(text: string): boolean {
      const token = tokens[at];
      return token !== undefined && token.kind === "op" && token.text === text;
    },
    take(text: string): boolean {
      if (!this.atOp(text)) return false;
      at++;
      return true;
    },
    expect(text: string): void {
      if (!this.take(text)) throw new Error(`I expected "${text}" here`);
    },
    done: (): boolean => at >= tokens.length,
  };
}

export type Reader = ReturnType<typeof reader>;

/**
 * The four levels, loosest first.
 *
 *   expression   + and -        2 + 3
 *   term         * and /        2 * 3
 *   power        ^              2 ^ 3
 *   atom         a number, a name, a call, or ( something )
 *
 * Each level asks the level below it for its pieces. That stack IS the
 * precedence: by the time `expression` gets its left-hand side, `term` has
 * already swallowed any multiplying, so the multiply ends up deeper in the
 * tree and therefore happens first. No table of priorities needed.
 */

/** + and - , left to right: 10 - 4 - 3 is (10 - 4) - 3, which is 3. */
export function parseExpression(r: Reader): Node {
  let left = parseTerm(r);

  while (r.atOp("+") || r.atOp("-")) {
    const op = r.atOp("+") ? "+" : "-";
    r.take(op);
    const right = parseTerm(r);
    left = { kind: "binary", op, left, right };
  }
  return left;
}

/** * and / , left to right. Same shape as parseExpression. */
export function parseTerm(r: Reader): Node {
  let left = parsePower(r);

  while (r.atOp("*") || r.atOp("/")) {
    const op = r.atOp("*") ? "*" : "/";
    r.take(op);
    const right = parsePower(r);
    left = { kind: "binary", op, left, right };
  }
  return left;
}

/** ^ , RIGHT to left: 2^3^2 is 2^(3^2) = 512, not (2^3)^2 = 64. */
export function parsePower(r: Reader): Node {
  const left = parseAtom(r);

  if (r.take("^")) {
    return { kind: "binary", op: "^", left, right: parsePower(r) };
  }
  return left;
}

/** A token as a person would read it, for error messages. */
function describe(token: Token): string {
  return token.kind === "number" ? String(token.value) : token.text;
}

/** The smallest pieces: a number, a name, sin(30), or ( anything ). */
export function parseAtom(r: Reader): Node {
  if (r.take("-")) {
    return { kind: "unary", op: "-", value: parseAtom(r) };
  }
  const token = r.next();
  if (token === null) {
    throw new Error("The expression stops too early");
  }

  if (token.kind === "number") {
    return { kind: "number", value: token.value };
  }

  if (token.kind === "name") {
    if (r.take("(")) {
      const args: Node[] = [];
      if (!r.atOp(")")) {
        do {
          args.push(parseExpression(r));
        } while (r.take(","));
      }
      r.expect(")");
      return { kind: "call", name: token.text, args };
    }
    // No bracket after it, so it's just a name: x, pi, ans.
    return { kind: "name", text: token.text };
  }

  // ( something ) — jump back to the top level and parse what's inside as a
  // whole expression, then hand it back as one piece. That jump from the
  // bottom of the chain to the top is why brackets beat everything.
  if (token.kind === "op" && token.text === "(") {
    const inside = parseExpression(r);
    r.expect(")");
    return inside;
  }

  throw new Error(`I didn't expect "${describe(token)}" here`);
}

/** Text in, tree out. This is what the rest of the app calls. */
export function parse(input: string): Node {
  const r = reader(tokenize(input));
  if (r.done()) throw new Error("Nothing to work out");
  const node = parseExpression(r);
  // Anything left over means the input didn't make sense: "2 3" parses a 2
  // and then finds a 3 nobody asked for.
  if (!r.done()) throw new Error("There's something extra on the end");
  return node;
}
