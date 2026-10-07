// Töne (Web Audio API) und Sprachansagen (Web Speech API, offline im Browser).

export class Signals {
  constructor() {
    this.ctx = null;
    this.sound = true;
    this.speech = true;
    this.voice = null;
    if ('speechSynthesis' in globalThis) {
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.voice = voices.find((v) => v.lang?.toLowerCase().startsWith('de')) ?? null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  /** Muss aus einer Benutzeraktion heraus aufgerufen werden (Autoplay-Regeln der Browser). */
  unlock() {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!this.ctx && AC) this.ctx = new AC();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    // iOS gibt die Sprachausgabe erst nach einer Äußerung im Klick-Handler frei.
    if (this.speech && 'speechSynthesis' in globalThis) {
      const u = new SpeechSynthesisUtterance('');
      speechSynthesis.speak(u);
    }
  }

  #tone(freq, durationMs, delayMs = 0, volume = 0.35) {
    if (!this.sound || !this.ctx) return;
    const t0 = this.ctx.currentTime + delayMs / 1000;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.02);
  }

  /** Kurzer Piepser für die letzten Sekunden. */
  tick() { this.#tone(880, 120); }

  /** Signal für den Beginn einer Übung. */
  go() { this.#tone(1320, 450, 0, 0.45); }

  /** Signal für den Beginn einer Pause. */
  rest() { this.#tone(660, 200); this.#tone(520, 300, 220); }

  /** Abschlussmelodie. */
  done() { [784, 988, 1175, 1568].forEach((f, i) => this.#tone(f, 260, i * 200, 0.4)); }

  say(text) {
    if (!this.speech || !('speechSynthesis' in globalThis) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (this.voice) u.voice = this.voice;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  silence() {
    if ('speechSynthesis' in globalThis) speechSynthesis.cancel();
  }
}
