// Reine Logik: Konfiguration prüfen und in eine Abfolge von Phasen übersetzen.
// Keine DOM-Abhängigkeiten – dadurch mit Node testbar.

export const PHASE = Object.freeze({
  PREPARE: 'prepare',
  WORK: 'work',
  INTERVAL_PAUSE: 'intervalPause',
  ROUND_PAUSE: 'roundPause',
});

export const LIMITS = Object.freeze({
  name: { max: 60 },
  exerciseName: { max: 40 },
  prepare: { min: 0, max: 600 },
  intervalTime: { min: 1, max: 3600 },
  exerciseCount: { min: 1, max: 20 },
  intervalPause: { min: 0, max: 3600 },
  intervalsPerRound: { min: 1, max: 100 },
  rounds: { min: 1, max: 100 },
  roundPause: { min: 0, max: 3600 },
});

export const DEFAULT_TIMER = Object.freeze({
  name: 'Neuer Timer',
  prepare: 10,
  intervalTime: 60,
  exerciseCount: 3,
  exercises: [],
  intervalPause: 15,
  intervalsPerRound: 4,
  rounds: 3,
  roundPause: 120,
});

const NUMERIC_FIELDS = [
  'prepare', 'intervalTime', 'exerciseCount', 'intervalPause',
  'intervalsPerRound', 'rounds', 'roundPause',
];

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clamp(n, { min, max }) {
  return Math.min(max, Math.max(min, n));
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/**
 * Bringt beliebige (z. B. importierte) Daten in eine gültige Timer-Konfiguration.
 * Unbekannte Felder werden verworfen, Zahlen begrenzt, Texte gekürzt.
 */
export function normalizeTimer(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const timer = {};
  for (const key of NUMERIC_FIELDS) {
    timer[key] = clamp(toInt(src[key], DEFAULT_TIMER[key]), LIMITS[key]);
  }
  timer.name = cleanText(src.name, LIMITS.name.max) || DEFAULT_TIMER.name;
  const names = Array.isArray(src.exercises) ? src.exercises : [];
  timer.exercises = Array.from({ length: timer.exerciseCount }, (_, i) =>
    cleanText(names[i], LIMITS.exerciseName.max));
  if (typeof src.id === 'string' && /^[\w-]{1,64}$/.test(src.id)) timer.id = src.id;
  return timer;
}

/** Liefert eine Liste deutscher Fehlermeldungen für Rohwerte aus dem Formular. */
export function validateTimer(raw) {
  const errors = {};
  const labels = {
    prepare: 'Vorbereitung',
    intervalTime: 'Intervallzeit',
    exerciseCount: 'Übungen pro Intervall',
    intervalPause: 'Intervallpause',
    intervalsPerRound: 'Intervalle pro Runde',
    rounds: 'Runden',
    roundPause: 'Rundenpause',
  };
  for (const key of NUMERIC_FIELDS) {
    const n = Number(raw[key]);
    const { min, max } = LIMITS[key];
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      errors[key] = `${labels[key]}: bitte eine ganze Zahl eingeben.`;
    } else if (n < min || n > max) {
      errors[key] = `${labels[key]}: erlaubt sind ${min} bis ${max}.`;
    }
  }
  if (!errors.intervalTime && !errors.exerciseCount && Number(raw.intervalTime) < Number(raw.exerciseCount)) {
    errors.intervalTime = 'Die Intervallzeit muss mindestens 1 Sekunde pro Übung lang sein.';
  }
  if (!cleanText(raw.name, LIMITS.name.max)) errors.name = 'Bitte einen Namen eingeben.';
  return errors;
}

/** Teilt die Intervallzeit gleichmäßig auf die Übungen auf (Restsekunden gehen an die ersten Übungen). */
export function splitInterval(intervalTime, exerciseCount) {
  const base = Math.floor(intervalTime / exerciseCount);
  const rest = intervalTime % exerciseCount;
  return Array.from({ length: exerciseCount }, (_, i) => base + (i < rest ? 1 : 0));
}

export function exerciseLabel(timer, index) {
  return timer.exercises?.[index] || `Übung ${index + 1}`;
}

/**
 * Erzeugt die Phasenfolge:
 * Vorbereitung → für jede Runde: für jedes Intervall: Übungen nacheinander,
 * zwischen Intervallen Intervallpause, zwischen Runden Rundenpause.
 * Pausen mit 0 Sekunden werden weggelassen; nach dem letzten Intervall/der letzten Runde folgt keine Pause.
 */
export function buildSchedule(input) {
  const t = normalizeTimer(input);
  const durations = splitInterval(t.intervalTime, t.exerciseCount);
  const phases = [];
  const pos = (round, interval, exercise) => ({
    round, rounds: t.rounds,
    interval, intervals: t.intervalsPerRound,
    exercise, exercises: t.exerciseCount,
  });

  if (t.prepare > 0) {
    phases.push({ type: PHASE.PREPARE, duration: t.prepare, label: 'Vorbereitung', ...pos(1, 1, 1) });
  }
  for (let r = 1; r <= t.rounds; r++) {
    for (let i = 1; i <= t.intervalsPerRound; i++) {
      for (let e = 1; e <= t.exerciseCount; e++) {
        phases.push({ type: PHASE.WORK, duration: durations[e - 1], label: exerciseLabel(t, e - 1), ...pos(r, i, e) });
      }
      if (i < t.intervalsPerRound && t.intervalPause > 0) {
        phases.push({ type: PHASE.INTERVAL_PAUSE, duration: t.intervalPause, label: 'Pause', ...pos(r, i, t.exerciseCount) });
      }
    }
    if (r < t.rounds && t.roundPause > 0) {
      phases.push({ type: PHASE.ROUND_PAUSE, duration: t.roundPause, label: 'Rundenpause', ...pos(r, t.intervalsPerRound, t.exerciseCount) });
    }
  }
  return phases;
}

/** Text der Sprachansage beim Beginn einer Phase. */
export function announcement(phases, index) {
  const p = phases[index];
  if (!p) return '';
  const next = phases.slice(index + 1).find((x) => x.type === PHASE.WORK);
  switch (p.type) {
    case PHASE.PREPARE:
      return next ? `Mach dich bereit. Erste Übung: ${next.label}` : 'Mach dich bereit.';
    case PHASE.WORK:
      if (p.round > 1 && p.interval === 1 && p.exercise === 1) return `Runde ${p.round}. ${p.label}`;
      return p.label;
    case PHASE.INTERVAL_PAUSE:
      return next ? `Pause. Als Nächstes: ${next.label}` : 'Pause.';
    case PHASE.ROUND_PAUSE:
      return `Rundenpause. Danach Runde ${p.round + 1} von ${p.rounds}.`;
    default:
      return '';
  }
}

export function totalDuration(phases) {
  return phases.reduce((sum, p) => sum + p.duration, 0);
}

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
