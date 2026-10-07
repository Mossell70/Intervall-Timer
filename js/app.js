// Benutzeroberfläche: Übersicht, Editor und laufender Timer.
// Alle Benutzertexte werden über textContent gesetzt (kein innerHTML) – Schutz vor XSS.
import {
  PHASE, DEFAULT_TIMER, normalizeTimer, validateTimer, buildSchedule, splitInterval,
  totalDuration, formatTime, announcement, exerciseLabel,
} from './schedule.js';
import { loadState, saveState, exportTimers, parseImport, newId } from './storage.js';
import { TimerEngine } from './engine.js';
import { Signals } from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('data-') || k.startsWith('aria-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  node.append(...children);
  return node;
};

const state = loadState();
const signals = new Signals();
signals.sound = state.settings.sound;
signals.speech = state.settings.speech;

let editingId = null;
let run = null; // { engine, phases, timer, wakeLock }

const views = { list: $('#view-list'), edit: $('#view-edit'), run: $('#view-run') };

function show(name) {
  for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
  window.scrollTo(0, 0);
}

function persist() {
  if (!saveState(state)) toast('Speichern nicht möglich – der Browser blockiert den lokalen Speicher.');
}

let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

function phaseStrip(phases, className) {
  const strip = el('div', { class: className });
  for (const p of phases) {
    const seg = el('i', { class: `seg seg-${p.type}` });
    seg.style.flexGrow = String(p.duration);
    strip.append(seg);
  }
  return strip;
}

function describe(t) {
  const parts = [
    `${t.rounds} ${t.rounds === 1 ? 'Runde' : 'Runden'}`,
    `${t.intervalsPerRound} ${t.intervalsPerRound === 1 ? 'Intervall' : 'Intervalle'} à ${formatTime(t.intervalTime)}`,
    `${t.exerciseCount} ${t.exerciseCount === 1 ? 'Übung' : 'Übungen'}`,
  ];
  return parts.join(', ');
}

/* ---------------- Übersicht ---------------- */

function renderList() {
  const list = $('#timer-list');
  list.replaceChildren();
  $('#empty-list').hidden = state.timers.length > 0;
  for (const t of state.timers) {
    const phases = buildSchedule(t);
    const item = el('li', { class: 'timer-item' },
      el('div', { class: 'timer-info' },
        el('h2', { class: 'timer-name', text: t.name }),
        el('p', { class: 'timer-meta', text: describe(t) }),
        phaseStrip(phases, 'timer-strip'),
      ),
      el('button', { type: 'button', class: 'timer-start', 'data-action': 'start', 'data-id': t.id, 'aria-label': `${t.name} starten, Dauer ${formatTime(totalDuration(phases))}` },
        'Start', el('small', { text: formatTime(totalDuration(phases)) })),
      el('div', { class: 'timer-actions' },
        el('button', { type: 'button', class: 'btn btn-small', 'data-action': 'edit', 'data-id': t.id, text: 'Bearbeiten' }),
        el('button', { type: 'button', class: 'btn btn-small', 'data-action': 'duplicate', 'data-id': t.id, text: 'Duplizieren' }),
        el('button', { type: 'button', class: 'btn btn-small btn-danger', 'data-action': 'delete', 'data-id': t.id, text: 'Löschen' }),
      ),
    );
    list.append(item);
  }
}

/* ---------------- Editor ---------------- */

const form = $('#edit-form');
const DURATION_FIELDS = ['intervalTime', 'exercisePause', 'intervalPause', 'roundPause', 'prepare'];
const COUNT_FIELDS = ['exerciseCount', 'intervalsPerRound', 'rounds'];

function setDuration(name, seconds) {
  form.elements[`${name}-min`].value = Math.floor(seconds / 60);
  form.elements[`${name}-sec`].value = seconds % 60;
}

function readDuration(name) {
  const min = form.elements[`${name}-min`].value.trim();
  const sec = form.elements[`${name}-sec`].value.trim();
  if (min === '' && sec === '') return NaN;
  return Number(min || 0) * 60 + Number(sec || 0);
}

function readForm() {
  const raw = { name: form.elements.name.value };
  for (const f of DURATION_FIELDS) raw[f] = readDuration(f);
  for (const f of COUNT_FIELDS) raw[f] = form.elements[f].value.trim() === '' ? NaN : Number(form.elements[f].value);
  raw.exercises = [...form.querySelectorAll('[data-exercise]')].map((i) => i.value);
  return raw;
}

function openEditor(timer) {
  editingId = timer.id ?? null;
  $('#edit-title').textContent = editingId ? 'Timer bearbeiten' : 'Neuer Timer';
  form.elements.name.value = timer.name;
  for (const f of DURATION_FIELDS) setDuration(f, timer[f]);
  for (const f of COUNT_FIELDS) form.elements[f].value = timer[f];
  renderExerciseInputs(timer.exercises);
  showErrors({});
  updatePreview();
  show('edit');
  form.elements.name.focus();
}

function renderExerciseInputs(existing) {
  const ol = $('#exercise-names');
  const current = existing ?? [...ol.querySelectorAll('[data-exercise]')].map((i) => i.value);
  const count = Math.min(20, Math.max(1, Math.round(Number(form.elements.exerciseCount.value)) || 1));
  ol.replaceChildren();
  for (let i = 0; i < count; i++) {
    const input = el('input', {
      type: 'text', maxLength: 40, value: current[i] ?? '', placeholder: `Übung ${i + 1}`,
      autocomplete: 'off', 'data-exercise': String(i), 'aria-label': `Name von Übung ${i + 1}`,
    });
    ol.append(el('li', {}, el('div', { class: 'exercise-row' }, input, el('span', { class: 'secs', 'data-secs': String(i) }))));
  }
}

function showErrors(errors) {
  for (const p of form.querySelectorAll('[data-error]')) {
    const key = p.dataset.error;
    p.textContent = errors[key] ?? '';
    const inputs = key === 'name'
      ? [form.elements.name]
      : DURATION_FIELDS.includes(key)
        ? [form.elements[`${key}-min`], form.elements[`${key}-sec`]]
        : [form.elements[key]];
    for (const i of inputs) i.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
  }
}

function updatePreview() {
  const raw = readForm();
  const errors = validateTimer(raw);
  const numericOk = Object.keys(errors).every((k) => k === 'name');
  const secs = form.querySelectorAll('[data-secs]');
  if (!numericOk) {
    $('#preview-total').textContent = 'Bitte die markierten Werte prüfen.';
    $('#preview-bar').replaceChildren();
    $('#split-hint').textContent = '';
    secs.forEach((s) => { s.textContent = ''; });
    return;
  }
  const timer = normalizeTimer(raw);
  const phases = buildSchedule(timer);
  const split = splitInterval(timer.intervalTime, timer.exerciseCount);
  secs.forEach((s, i) => { s.textContent = split[i] !== undefined ? `${split[i]} s` : ''; });
  $('#split-hint').textContent = timer.exerciseCount > 1
    ? `Die Intervallzeit wird gleichmäßig auf die ${timer.exerciseCount} Übungen verteilt. ${timer.exercisePause > 0
      ? `Dazu kommt zwischen den Übungen jeweils ${formatTime(timer.exercisePause)} Pause.`
      : 'Zwischen den Übungen gibt es keine Pause.'}`
    : 'Bei nur einer Übung pro Intervall gibt es keine Übungspause.';
  const work = phases.filter((p) => p.type === PHASE.WORK).reduce((s, p) => s + p.duration, 0);
  $('#preview-total').textContent = `Gesamt ${formatTime(totalDuration(phases))} (davon ${formatTime(work)} Training)`;
  const bar = phaseStrip(phases, 'preview-bar');
  bar.id = 'preview-bar';
  $('#preview-bar').replaceWith(bar);
}

function saveFromForm() {
  const raw = readForm();
  const errors = validateTimer(raw);
  showErrors(errors);
  if (Object.keys(errors).length) {
    const first = form.querySelector('[aria-invalid="true"]');
    first?.focus();
    return null;
  }
  const timer = { ...normalizeTimer(raw), id: editingId ?? newId() };
  const idx = state.timers.findIndex((t) => t.id === timer.id);
  if (idx >= 0) state.timers[idx] = timer; else state.timers.push(timer);
  persist();
  renderList();
  return timer;
}

form.addEventListener('input', (e) => {
  if (e.target.name === 'exerciseCount') renderExerciseInputs();
  updatePreview();
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const saved = saveFromForm();
  if (saved) { show('list'); toast(`„${saved.name}“ gespeichert.`); }
});

/* ---------------- Laufender Timer ---------------- */

const runView = views.run;

async function requestWakeLock() {
  try {
    if (run && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      run.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* nicht unterstützt oder abgelehnt – Timer läuft trotzdem */ }
}

function releaseWakeLock() {
  run?.wakeLock?.release?.().catch(() => {});
  if (run) run.wakeLock = null;
}

function phaseTitle(p) {
  switch (p.type) {
    case PHASE.PREPARE: return 'Gleich geht’s los';
    case PHASE.WORK: return p.exercises > 1 ? `Übung ${p.exercise} von ${p.exercises}` : 'Übung';
    case PHASE.EXERCISE_PAUSE: return 'Übungspause';
    case PHASE.INTERVAL_PAUSE: return 'Pause';
    case PHASE.ROUND_PAUSE: return 'Rundenpause';
    default: return '';
  }
}

function renderPosition(p) {
  const items = [];
  if (p.rounds > 1) items.push(`Runde ${p.round}/${p.rounds}`);
  items.push(`Intervall ${p.interval}/${p.intervals}`);
  $('#run-position').replaceChildren(...items.map((text) => el('li', { text })));
}

function renderNext(index) {
  const next = run.phases[index + 1];
  const nextWork = run.phases.slice(index + 1).find((x) => x.type === PHASE.WORK);
  let text = '';
  if (!next) text = 'Letzte Phase';
  else if (next.type === PHASE.WORK) text = `Danach: ${next.label}`;
  else if (next.type === PHASE.EXERCISE_PAUSE) text = `Danach: ${formatTime(next.duration)} Übungspause`;
  else if (next.type === PHASE.INTERVAL_PAUSE) text = `Danach: ${formatTime(next.duration)} Pause`;
  else if (next.type === PHASE.ROUND_PAUSE) text = `Danach: ${formatTime(next.duration)} Rundenpause`;
  if (next && next.type !== PHASE.WORK && nextWork) text += `, dann ${nextWork.label}`;
  $('#run-next').textContent = text;
}

function updateClock() {
  if (!run) return;
  const { engine } = run;
  $('#run-clock').textContent = formatTime(Math.ceil(engine.phaseRemainingMs / 1000));
  const totalMs = totalDuration(run.phases) * 1000;
  const left = engine.totalRemainingMs;
  $('#run-total').textContent = formatTime(Math.ceil(left / 1000));
  $('#run-progress-fill').style.width = `${((totalMs - left) / totalMs) * 100}%`;
}

function startTimer(timer) {
  stopTimer(false);
  const phases = buildSchedule(timer);
  signals.unlock();
  run = { timer, phases, wakeLock: null, engine: null };
  run.engine = new TimerEngine(phases, {
    onPhase(p, index) {
      runView.dataset.phase = p.type;
      $('#run-phase').textContent = phaseTitle(p);
      $('#run-label').textContent = p.type === PHASE.WORK ? p.label : (p.type === PHASE.PREPARE ? exerciseLabel(timer, 0) : 'Durchatmen');
      renderPosition(p);
      renderNext(index);
      if (p.type === PHASE.WORK) signals.go(); else if (index > 0) signals.rest();
      signals.say(announcement(phases, index));
    },
    onSecond(secondsLeft) {
      updateClock();
      if (secondsLeft > 0 && secondsLeft <= 3) signals.tick();
    },
    onFinish() {
      runView.dataset.phase = 'done';
      runView.dataset.paused = 'false';
      $('#run-phase').textContent = timer.name;
      $('#run-label').textContent = 'Geschafft!';
      $('#run-position').replaceChildren();
      $('#run-next').textContent = `${formatTime(totalDuration(phases))} absolviert`;
      updateClock();
      $('[data-action="stop"]', runView).textContent = 'Fertig';
      signals.done();
      signals.say('Geschafft. Gut gemacht!');
      releaseWakeLock();
    },
  });
  $('#run-name').textContent = timer.name;
  $('[data-action="stop"]', runView).textContent = 'Beenden';
  runView.dataset.paused = 'false';
  $('[data-action="toggle"]', runView).setAttribute('aria-label', 'Pause');
  show('run');
  run.engine.start();
  requestWakeLock();
  $('[data-action="toggle"]', runView).focus();
}

function togglePause() {
  if (!run || run.engine.finished) return;
  run.engine.toggle();
  const paused = !run.engine.running;
  runView.dataset.paused = String(paused);
  $('[data-action="toggle"]', runView).setAttribute('aria-label', paused ? 'Fortsetzen' : 'Pause');
  if (paused) { signals.silence(); releaseWakeLock(); } else { signals.unlock(); requestWakeLock(); }
  updateClock();
}

function stopTimer(ask = true) {
  if (!run) return;
  if (ask && !run.engine.finished && !confirm('Timer wirklich beenden?')) return;
  run.engine.stop();
  signals.silence();
  releaseWakeLock();
  run = null;
  show('list');
}

document.addEventListener('visibilitychange', () => {
  if (run && run.engine.running && document.visibilityState === 'visible') {
    run.engine.tick();
    requestWakeLock();
  }
});

document.addEventListener('keydown', (e) => {
  if (views.run.hidden || !run) return;
  if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); togglePause(); }
  else if (e.key === 'ArrowRight') { run.engine.next(); updateClock(); }
  else if (e.key === 'ArrowLeft') { run.engine.previous(); updateClock(); }
  else if (e.key === 'Escape') stopTimer();
});

/* ---------------- Aktionen ---------------- */

const findTimer = (id) => state.timers.find((t) => t.id === id);

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  switch (action) {
    case 'new': openEditor({ ...DEFAULT_TIMER, exercises: [] }); break;
    case 'edit': { const t = findTimer(id); if (t) openEditor(t); break; }
    case 'duplicate': {
      const t = findTimer(id);
      if (!t) break;
      const copy = { ...normalizeTimer({ ...t, name: `${t.name} (Kopie)` }), id: newId() };
      state.timers.splice(state.timers.indexOf(t) + 1, 0, copy);
      persist(); renderList(); toast('Timer dupliziert.');
      break;
    }
    case 'delete': {
      const t = findTimer(id);
      if (t && confirm(`„${t.name}“ wirklich löschen?`)) {
        state.timers = state.timers.filter((x) => x.id !== id);
        persist(); renderList(); toast('Timer gelöscht.');
      }
      break;
    }
    case 'start': { const t = findTimer(id); if (t) startTimer(t); break; }
    case 'cancel-edit': show('list'); break;
    case 'save-start': { const t = saveFromForm(); if (t) startTimer(t); break; }
    case 'toggle': togglePause(); break;
    case 'next': run?.engine.next(); updateClock(); break;
    case 'prev': run?.engine.previous(); updateClock(); break;
    case 'stop': stopTimer(); break;
    case 'export': {
      const blob = new Blob([exportTimers(state.timers)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'intervall-timer.json' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    default: break;
  }
});

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = parseImport(await file.text());
    state.timers.push(...imported);
    persist(); renderList();
    toast(`${imported.length} Timer importiert.`);
  } catch (err) {
    toast(`Import fehlgeschlagen: ${err.message}`);
  }
});

for (const key of ['sound', 'speech']) {
  const box = $(`#opt-${key}`);
  box.checked = state.settings[key];
  box.addEventListener('change', () => {
    state.settings[key] = box.checked;
    signals[key] = box.checked;
    persist();
  });
}

renderList();
show('list');
