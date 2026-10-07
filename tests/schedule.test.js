import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE, buildSchedule, splitInterval, totalDuration, formatTime,
  normalizeTimer, validateTimer, announcement,
} from '../js/schedule.js';

const base = {
  name: 'Test', prepare: 10, intervalTime: 60, exerciseCount: 3, exercises: ['A', 'B', 'C'],
  intervalPause: 15, intervalsPerRound: 4, rounds: 3, roundPause: 120,
};

test('splitInterval verteilt Restsekunden auf die ersten Übungen', () => {
  assert.deepEqual(splitInterval(60, 3), [20, 20, 20]);
  assert.deepEqual(splitInterval(10, 3), [4, 3, 3]);
  assert.deepEqual(splitInterval(45, 1), [45]);
});

test('buildSchedule erzeugt die richtige Phasenfolge (Variante A)', () => {
  const phases = buildSchedule(base);
  const count = (type) => phases.filter((p) => p.type === type).length;
  assert.equal(count(PHASE.PREPARE), 1);
  assert.equal(count(PHASE.WORK), 3 * 4 * 3);              // Runden × Intervalle × Übungen
  assert.equal(count(PHASE.INTERVAL_PAUSE), 3 * (4 - 1));  // keine Pause nach letztem Intervall
  assert.equal(count(PHASE.ROUND_PAUSE), 3 - 1);           // keine Rundenpause am Ende
  assert.equal(phases.at(-1).type, PHASE.WORK);
  assert.deepEqual(phases.slice(1, 5).map((p) => p.label), ['A', 'B', 'C', 'Pause']);
});

test('Gesamtdauer stimmt', () => {
  const expected = 10 + 3 * 4 * 60 + 3 * 3 * 15 + 2 * 120;
  assert.equal(totalDuration(buildSchedule(base)), expected);
});

test('Pausen mit 0 Sekunden werden weggelassen', () => {
  const phases = buildSchedule({ ...base, prepare: 0, intervalPause: 0, roundPause: 0 });
  assert.ok(phases.every((p) => p.type === PHASE.WORK));
  assert.equal(phases.length, 36);
});

test('Positionsangaben zählen korrekt', () => {
  const phases = buildSchedule(base).filter((p) => p.type === PHASE.WORK);
  const last = phases.at(-1);
  assert.deepEqual([last.round, last.interval, last.exercise], [3, 4, 3]);
  assert.deepEqual([phases[3].round, phases[3].interval, phases[3].exercise], [1, 2, 1]);
});

test('Unbenannte Übungen werden nummeriert', () => {
  const phases = buildSchedule({ ...base, exercises: ['Squats'] });
  assert.deepEqual(phases.slice(1, 4).map((p) => p.label), ['Squats', 'Übung 2', 'Übung 3']);
});

test('normalizeTimer begrenzt Werte und bereinigt Texte', () => {
  const t = normalizeTimer({ name: '  <b>x</b>\n ', intervalTime: 99999, rounds: -5, exerciseCount: '2', exercises: ['a'.repeat(100)], evil: 1 });
  assert.equal(t.name, '<b>x</b>');           // wird nur als Text ausgegeben, nie als HTML
  assert.equal(t.intervalTime, 3600);
  assert.equal(t.rounds, 1);
  assert.equal(t.exerciseCount, 2);
  assert.equal(t.exercises.length, 2);
  assert.equal(t.exercises[0].length, 40);
  assert.equal('evil' in t, false);
});

test('validateTimer meldet ungültige Eingaben', () => {
  assert.deepEqual(validateTimer(base), {});
  const e = validateTimer({ ...base, name: '', rounds: 0, intervalPause: 1.5, intervalTime: 2, exerciseCount: 3 });
  assert.ok(e.name && e.rounds && e.intervalPause && e.intervalTime);
  assert.ok(validateTimer({ ...base, intervalTime: NaN }).intervalTime);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3725), '1:02:05');
});

test('Sprachansagen', () => {
  const phases = buildSchedule(base);
  assert.equal(announcement(phases, 0), 'Mach dich bereit. Erste Übung: A');
  assert.equal(announcement(phases, 1), 'A');
  assert.equal(announcement(phases, 4), 'Pause. Als Nächstes: A');
  const rp = phases.findIndex((p) => p.type === PHASE.ROUND_PAUSE);
  assert.equal(announcement(phases, rp), 'Rundenpause. Danach Runde 2 von 3.');
  assert.equal(announcement(phases, rp + 1), 'Runde 2. A');
});
