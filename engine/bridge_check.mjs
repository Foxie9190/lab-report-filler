import fs from 'node:fs';
import './wasm_exec.js';
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(fs.readFileSync('./math.wasm'), go.importObject);
go.run(instance);

let pass = 0, fail = 0;
const ok = (n, c, extra='') => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (extra ? ' — ' + extra : '')); } };
const call = (fn, ...a) => JSON.parse(globalThis.mathEngine[fn](...a));

let r = call('calculate', '2+3*4', true, '{}');
ok('calculate 2+3*4 = 14', r.ok && r.value === 14, JSON.stringify(r));

r = call('calculate', 'x = 5', true, '{}');
ok('x = 5 comes back in variables', r.ok && r.variables.x === 5, JSON.stringify(r));

r = call('calculate', 'x * 3', true, '{"x":5}');
ok('variables sent in are used', r.ok && r.value === 15, JSON.stringify(r));

r = call('calculate', 'sin(30)', true, '{}');
ok('degrees mode', r.ok && Math.abs(r.value - 0.5) < 1e-9, JSON.stringify(r));

r = call('calculate', '1/0', true, '{}');
ok('divide by zero is refused', !r.ok && /divide by zero/.test(r.error), JSON.stringify(r));

r = call('sample', 'y = x^2 - 3', -2, 2, 5, true, '{}');
ok('sample returns every point', r.ok && r.ys.length === 5 && r.ys[0] === 1 && r.ys[2] === -3, JSON.stringify(r));

r = call('sample', 'sqrt(x)', -2, 2, 5, true, '{}');
ok('a point that cannot be drawn is null', r.ok && r.ys[0] === null && r.ys[4] === Math.sqrt(2), JSON.stringify(r));

r = call('solve', '3*x + 7', '22', 'x', true, '{}');
ok('solve gives the answer', r.ok && r.value === 5, JSON.stringify(r));
ok('solve gives the working', r.ok && r.steps.length === 3 && r.steps[1].includes('Subtract 7'), JSON.stringify(r.steps));

r = call('solve', 'x^2', '4', 'x', true, '{}');
ok('x squared is refused', !r.ok && /power/.test(r.error), JSON.stringify(r));

// how fast is a whole curve?
const started = Date.now();
for (let i = 0; i < 100; i++) call('sample', 'sin(x) + x^2/10', -10, 10, 600, false, '{}');
const each = (Date.now() - started) / 100;
ok('600 points takes under 5ms', each < 5, `${each.toFixed(2)}ms per curve`);
console.log(`\n  (${each.toFixed(2)}ms for a 600-point curve)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
