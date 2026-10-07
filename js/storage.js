// Speicherung im Browser (localStorage) sowie Export/Import als JSON-Datei.
import { normalizeTimer } from './schedule.js';

const KEY = 'intervall-timer.v1';
const MAX_TIMERS = 200;
export const MAX_IMPORT_BYTES = 512 * 1024;

export const PRESETS = [
  { name: 'Zirkeltraining', prepare: 10, intervalTime: 60, exerciseCount: 3, exercises: ['Kniebeugen', 'Liegestütze', 'Hampelmann'], intervalPause: 20, intervalsPerRound: 4, rounds: 3, roundPause: 120 },
  { name: 'Tabata', prepare: 10, intervalTime: 20, exerciseCount: 1, exercises: [], intervalPause: 10, intervalsPerRound: 8, rounds: 1, roundPause: 0 },
];

export function newId() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Zustand wie beim ersten Aufruf: Beispiel-Timer und alle Signale an. */
export function defaultState() {
  return {
    timers: PRESETS.map((p) => ({ ...normalizeTimer(p), id: newId() })),
    settings: { sound: true, speech: true },
  };
}

/** Prüft und bereinigt einen gespeicherten oder importierten Zustand. */
export function sanitizeState(data) {
  const base = defaultState();
  if (!data || typeof data !== 'object') return base;
  const timers = Array.isArray(data.timers)
    ? data.timers.slice(0, MAX_TIMERS).map((t) => ({ ...normalizeTimer(t), id: normalizeTimer(t).id ?? newId() }))
    : base.timers;
  const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
  return {
    timers,
    settings: {
      sound: typeof s.sound === 'boolean' ? s.sound : true,
      speech: typeof s.speech === 'boolean' ? s.speech : true,
    },
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

/** @returns {boolean} ob das Speichern geklappt hat */
export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportTimers(timers) {
  return JSON.stringify({ app: 'intervall-timer', version: 1, timers }, null, 2);
}

/**
 * Liest eine Exportdatei. Importierte Timer bekommen neue IDs,
 * damit vorhandene Timer nie überschrieben werden.
 */
export function parseImport(text) {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) {
    throw new Error('Die Datei ist zu groß oder leer.');
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Die Datei enthält kein gültiges JSON.'); }
  const list = Array.isArray(data) ? data : data?.timers;
  if (!Array.isArray(list) || list.length === 0) throw new Error('In der Datei wurden keine Timer gefunden.');
  return list.slice(0, MAX_TIMERS).map((t) => ({ ...normalizeTimer(t), id: newId() }));
}
