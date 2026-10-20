/**
 * The Go engine, loaded into the browser.
 *
 * engine/ is the same maths engine written in Go — tokenize, parse, evaluate,
 * solve — compiled to WebAssembly. This file is the only place that knows
 * WebAssembly exists. Everything above it calls plain functions.
 *
 *   engine/*.go ──go build──▶ math.wasm ──this file──▶ calculator, graph, solver
 *
 * NOTHING IS REMEMBERED ON THE GO SIDE. Every call takes the variables and
 * hands the new set back, so there is one copy of the state and it lives in
 * TypeScript. Two languages holding the same state is how this kind of
 * project breaks first.
 *
 * LOADING CAN FAIL, AND THAT IS FINE. The file is 3.5MB and isn't in git —
 * it's built by `npm run wasm`. A fresh clone won't have it, an old browser
 * may refuse it, and a slow connection may not finish it. In every one of
 * those cases ready() stays null and the screens fall back to the TypeScript
 * engine, which still does everything. Nobody sees an error.
 */

/** What one line of working comes back as. */
export interface CalcAnswer {
  ok: boolean;
  value?: number;
  variables?: Record<string, number>;
  error?: string;
}

/** What a solved equation comes back as. */
export interface SolveAnswer {
  ok: boolean;
  variable?: string;
  value?: number;
  steps?: string[];
  error?: string;
}

/** What a sampled curve comes back as. null means that x can't be drawn. */
export interface SampleAnswer {
  ok: boolean;
  ys?: (number | null)[];
  error?: string;
}

export interface GoEngine {
  calculate(input: string, degrees: boolean, variables: Map<string, number>): CalcAnswer;
  solve(left: string, right: string, name: string, degrees: boolean, variables: Map<string, number>): SolveAnswer;
  sample(expression: string, from: number, to: number, steps: number, degrees: boolean, variables: Map<string, number>): SampleAnswer;
}

// What Go hangs off the global object once it starts. Three functions that
// take strings and numbers and hand back JSON.
interface RawEngine {
  calculate(input: string, degrees: boolean, variables: string): string;
  solve(left: string, right: string, name: string, degrees: boolean, variables: string): string;
  sample(expression: string, from: number, to: number, steps: number, degrees: boolean, variables: string): string;
}

let engine: GoEngine | null = null;
let starting: Promise<GoEngine | null> | null = null;

/** The engine, or null if it isn't loaded (or couldn't be). Never waits. */
export function ready(): GoEngine | null {
  return engine;
}

/** A Map as the plain object the Go side reads. */
function asObject(variables: Map<string, number>): string {
  return JSON.stringify(Object.fromEntries(variables));
}

/** wasm_exec.js is Go's own loader shim. It defines globalThis.Go. */
function loadShim(base: string): Promise<void> {
  return new Promise((done, failed) => {
    if ("Go" in globalThis) {
      done();
      return;
    }
    const tag = document.createElement("script");
    tag.src = `${base}wasm_exec.js`;
    tag.onload = () => done();
    tag.onerror = () => failed(new Error("couldn't load wasm_exec.js"));
    document.head.append(tag);
  });
}

/**
 * Start the engine. Safe to call as often as you like — the first call does
 * the work and every later one gets the same answer.
 */
export function start(): Promise<GoEngine | null> {
  if (starting !== null) return starting;

  starting = (async () => {
    try {
      // BASE_URL is "/" in the app and "/lab-report-filler/" on the website,
      // so this finds the files in both.
      const base = import.meta.env.BASE_URL;
      await loadShim(base);

      const go = new (globalThis as unknown as { Go: new () => { importObject: WebAssembly.Imports; run(i: WebAssembly.Instance): void } }).Go();
      const built = await WebAssembly.instantiateStreaming(fetch(`${base}math.wasm`), go.importObject);

      // run() starts Go's scheduler and returns straight away, because main()
      // parks on select{}. The functions exist from this point on.
      go.run(built.instance);

      const raw = (globalThis as unknown as { mathEngine?: RawEngine }).mathEngine;
      if (raw === undefined) throw new Error("math.wasm didn't register itself");

      engine = {
        calculate: (input, degrees, variables) =>
          JSON.parse(raw.calculate(input, degrees, asObject(variables))) as CalcAnswer,
        solve: (left, right, name, degrees, variables) =>
          JSON.parse(raw.solve(left, right, name, degrees, asObject(variables))) as SolveAnswer,
        sample: (expression, from, to, steps, degrees, variables) =>
          JSON.parse(raw.sample(expression, from, to, steps, degrees, asObject(variables))) as SampleAnswer,
      };
      return engine;
    } catch (err) {
      // Not worth bothering the person about: the TypeScript engine does
      // everything this one does.
      console.info("the Go engine isn't available, using the TypeScript one", err);
      return null;
    }
  })();

  return starting;
}
