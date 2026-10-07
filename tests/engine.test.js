import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine } from '../js/engine.js';

function fakeEnv() {
  const env = { t: 0, fn: null };
  env.now = () => env.t;
  env.setInterval = (fn) => { env.fn = fn; return 1; };
  env.clearInterval = () => { env.fn = null; };
  env.advance = (ms) => { for (let i = 0; i < ms; i += 100) { env.t += 100; env.fn?.(); } };
  return env;
}

const phases = [
  { type: 'prepare', duration: 3 },
  { type: 'work', duration: 5 },
  { type: 'intervalPause', duration: 2 },
  { type: 'work', duration: 5 },
];

function make() {
  const env = fakeEnv();
  const log = { phases: [], seconds: [], finished: 0 };
  const engine = new TimerEngine(phases, {
    onPhase: (_p, i) => log.phases.push(i),
    onSecond: (s) => log.seconds.push(s),
    onFinish: () => { log.finished += 1; },
  }, env);
  return { env, engine, log };
}

test('läuft alle Phasen durch und meldet das Ende genau einmal', () => {
  const { env, engine, log } = make();
  engine.start();
  env.advance(15_000);
  assert.deepEqual(log.phases, [0, 1, 2, 3]);
  assert.equal(log.finished, 1);
  assert.equal(engine.finished, true);
  env.advance(2_000);
  assert.equal(log.finished, 1);
});

test('meldet jede Sekunde einmal (Countdown 3-2-1)', () => {
  const { env, engine, log } = make();
  engine.start();
  env.advance(3_000);
  assert.deepEqual(log.seconds.slice(0, 4), [3, 2, 1, 5]);
});

test('Pause hält die Zeit an, Fortsetzen läuft weiter', () => {
  const { env, engine } = make();
  engine.start();
  env.advance(1_000);
  engine.pause();
  env.t += 60_000; // Zeit vergeht während der Pause
  assert.equal(engine.phaseRemainingMs, 2_000);
  engine.start();
  env.advance(2_000);
  assert.equal(engine.index, 1);
});

test('verpasste Ticks werden nachgeholt (Hintergrund-Tab)', () => {
  const { env, engine, log } = make();
  engine.start();
  env.t += 9_000; // 9 s ohne Tick
  engine.tick();
  assert.equal(engine.index, 2);
  assert.equal(engine.phaseRemainingMs, 1_000);
  assert.deepEqual(log.phases, [0, 1, 2]);
});

test('Weiter/Zurück springen zwischen Phasen', () => {
  const { env, engine } = make();
  engine.start();
  engine.next();
  assert.equal(engine.index, 1);
  env.advance(3_000);
  engine.previous(); // > 2 s vergangen: Phase neu starten
  assert.equal(engine.index, 1);
  assert.equal(engine.phaseRemainingMs, 5_000);
  engine.previous(); // direkt danach: vorherige Phase
  assert.equal(engine.index, 0);
  engine.next(); engine.next(); engine.next(); engine.next();
  assert.equal(engine.finished, true);
});

test('Gesamtrestzeit', () => {
  const { env, engine } = make();
  assert.equal(engine.totalRemainingMs, 15_000);
  engine.start();
  env.advance(4_000);
  assert.equal(engine.totalRemainingMs, 11_000);
});

test('leere Phasenliste wird abgelehnt', () => {
  assert.throws(() => new TimerEngine([]));
});
