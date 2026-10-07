// Ablaufsteuerung eines Timers. Zeitbasiert (nicht zählerbasiert), damit
// verspätete Ticks – z. B. bei Hintergrund-Tabs – keine Zeit "verschlucken".
// Uhr und Taktgeber sind injizierbar, damit sich die Logik ohne Browser testen lässt.

export class TimerEngine {
  /**
   * @param {Array<{duration:number}>} phases
   * @param {object} hooks onPhase(phase, index), onSecond(secondsLeft, phase), onFinish()
   * @param {object} [env] now(): ms, setInterval/clearInterval
   */
  constructor(phases, hooks = {}, env = {}) {
    if (!Array.isArray(phases) || phases.length === 0) throw new Error('Keine Phasen vorhanden.');
    this.phases = phases;
    this.hooks = hooks;
    this.now = env.now ?? (() => performance.now());
    this.setInterval = env.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearInterval = env.clearInterval ?? ((id) => clearInterval(id));
    this.index = 0;
    this.remainingMs = phases[0].duration * 1000;
    this.phaseEndsAt = null;
    this.running = false;
    this.finished = false;
    this.lastSecond = null;
    this.handle = null;
  }

  get phase() { return this.phases[this.index]; }

  /** Verbleibende Zeit der aktuellen Phase in ms. */
  get phaseRemainingMs() {
    if (this.running) return Math.max(0, this.phaseEndsAt - this.now());
    return this.remainingMs;
  }

  /** Verbleibende Gesamtzeit in ms. */
  get totalRemainingMs() {
    let rest = this.phaseRemainingMs;
    for (let i = this.index + 1; i < this.phases.length; i++) rest += this.phases[i].duration * 1000;
    return rest;
  }

  start() {
    if (this.running || this.finished) return;
    const first = this.lastSecond === null;
    this.running = true;
    this.phaseEndsAt = this.now() + this.remainingMs;
    if (first) this.#enterPhase();
    this.handle = this.setInterval(() => this.tick(), 100);
  }

  pause() {
    if (!this.running) return;
    this.remainingMs = this.phaseRemainingMs;
    this.running = false;
    this.#stopClock();
  }

  toggle() { this.running ? this.pause() : this.start(); }

  stop() {
    this.running = false;
    this.#stopClock();
  }

  /** Zur nächsten Phase springen. */
  next() { this.#goto(this.index + 1); }

  /** Phase neu starten bzw. – innerhalb der ersten 2 Sekunden – zur vorherigen springen. */
  previous() {
    const elapsed = this.phase.duration * 1000 - this.phaseRemainingMs;
    this.#goto(elapsed < 2000 && this.index > 0 ? this.index - 1 : this.index);
  }

  tick() {
    if (!this.running) return;
    // Mehrere Phasen nachholen, falls der Tab lange schlief.
    while (this.running && this.now() >= this.phaseEndsAt) {
      const overshoot = this.now() - this.phaseEndsAt;
      if (this.index >= this.phases.length - 1) {
        this.#finish();
        return;
      }
      this.index += 1;
      this.phaseEndsAt = this.now() - overshoot + this.phase.duration * 1000;
      this.#enterPhase();
    }
    this.#emitSecond();
  }

  #goto(target) {
    if (this.finished) return;
    if (target >= this.phases.length) { this.#finish(); return; }
    this.index = Math.max(0, target);
    this.remainingMs = this.phase.duration * 1000;
    if (this.running) this.phaseEndsAt = this.now() + this.remainingMs;
    this.#enterPhase();
  }

  #enterPhase() {
    this.lastSecond = null;
    this.hooks.onPhase?.(this.phase, this.index);
    this.#emitSecond();
  }

  #emitSecond() {
    const secondsLeft = Math.ceil(this.phaseRemainingMs / 1000);
    if (secondsLeft !== this.lastSecond) {
      this.lastSecond = secondsLeft;
      this.hooks.onSecond?.(secondsLeft, this.phase);
    }
  }

  #finish() {
    this.running = false;
    this.finished = true;
    this.remainingMs = 0;
    this.#stopClock();
    this.hooks.onFinish?.();
  }

  #stopClock() {
    if (this.handle !== null) this.clearInterval(this.handle);
    this.handle = null;
  }
}
