import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, exportTimers, parseImport, sanitizeState, MAX_IMPORT_BYTES } from '../js/storage.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

test('ohne gespeicherte Daten gibt es Beispiel-Timer', () => {
  const s = loadState(memoryStorage());
  assert.ok(s.timers.length >= 1);
  assert.deepEqual(s.settings, { sound: true, speech: true });
});

test('speichern und laden ergibt denselben Zustand', () => {
  const store = memoryStorage();
  const s = loadState(store);
  s.settings.speech = false;
  s.timers[0].name = 'Mein Timer';
  assert.equal(saveState(s, store), true);
  const again = loadState(store);
  assert.equal(again.timers[0].name, 'Mein Timer');
  assert.equal(again.settings.speech, false);
  assert.equal(again.timers[0].id, s.timers[0].id);
});

test('kaputte Daten im Speicher führen nicht zum Absturz', () => {
  const store = memoryStorage();
  store.setItem('intervall-timer.v1', '{kaputt');
  assert.ok(loadState(store).timers.length >= 1);
  assert.ok(loadState({ getItem() { throw new Error('blockiert'); } }).timers.length >= 1);
  assert.equal(saveState({}, { setItem() { throw new Error('voll'); } }), false);
});

test('Export lässt sich wieder importieren, mit neuen IDs', () => {
  const s = sanitizeState(null);
  const imported = parseImport(exportTimers(s.timers));
  assert.equal(imported.length, s.timers.length);
  assert.equal(imported[0].name, s.timers[0].name);
  assert.notEqual(imported[0].id, s.timers[0].id);
});

test('Import lehnt ungültige Dateien verständlich ab', () => {
  assert.throws(() => parseImport('nicht json'), /kein gültiges JSON/);
  assert.throws(() => parseImport('{"timers":[]}'), /keine Timer/);
  assert.throws(() => parseImport('x'.repeat(MAX_IMPORT_BYTES + 1)), /zu groß/);
});

test('Import bereinigt Werte', () => {
  const [t] = parseImport(JSON.stringify([{ name: 'X', rounds: 1e9, __proto__: { hack: 1 } }]));
  assert.equal(t.rounds, 100);
  assert.equal(t.hack, undefined);
});

test('defaultState liefert den Auslieferungszustand mit neuen IDs', async () => {
  const { defaultState, PRESETS } = await import('../js/storage.js');
  const a = defaultState();
  const b = defaultState();
  assert.deepEqual(a.timers.map((t) => t.name), PRESETS.map((p) => p.name));
  assert.deepEqual(a.settings, { sound: true, speech: true });
  assert.notEqual(a.timers[0].id, b.timers[0].id);
  a.timers[0].name = 'geändert';
  assert.equal(defaultState().timers[0].name, PRESETS[0].name); // Vorlagen bleiben unverändert
});
