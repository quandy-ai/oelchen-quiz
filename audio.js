// Advanced Web Audio API Synthesizer - Zero external audio files required!
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playPop() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, this.ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.07);
  }

  playTick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  playUrgentTick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1100, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  playWhoosh() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(750, this.ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.22);
  }

  playCorrect() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.28);
    });
  }

  playWrong() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [380, 290, 210];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.18, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.16);
    });
  }

  playDrumroll(duration = 2.0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(150, this.ctx.currentTime);
    filter.Q.setValueAtTime(3, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + duration - 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    whiteNoise.start();
    whiteNoise.stop(this.ctx.currentTime + duration);
  }

  playFanfare() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const chords = [
      { time: 0.0, notes: [523.25, 659.25, 783.99], dur: 0.18 }, // C
      { time: 0.2, notes: [523.25, 659.25, 783.99], dur: 0.18 }, // C
      { time: 0.4, notes: [523.25, 659.25, 783.99], dur: 0.18 }, // C
      { time: 0.65, notes: [587.33, 698.46, 880.00], dur: 0.45 }, // F/D
      { time: 1.15, notes: [659.25, 783.99, 1046.50], dur: 1.0 }  // C High Triumph
    ];

    chords.forEach(chord => {
      chord.notes.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + chord.time);
        gain.gain.setValueAtTime(0, now + chord.time);
        gain.gain.linearRampToValueAtTime(0.22, now + chord.time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + chord.time + chord.dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + chord.time);
        osc.stop(now + chord.time + chord.dur);
      });
    });
  }

  // ==========================================================
  // LOBBY GAMING MUSIC – Chiptune-Loop (A-Moll, 112 BPM)
  // ==========================================================
  startLobbyMusic() {
    this.init();
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.muted ? 0 : 0.14;
    this.musicGain.connect(this.ctx.destination);

    const bpm = 112;
    this._stepDur = 60 / bpm / 2; // Achtelnoten
    this._musicStep = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 60);
  }

  stopLobbyMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    clearInterval(this._musicTimer);
    if (this.musicGain) {
      try {
        this.musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
        const g = this.musicGain;
        setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 600);
      } catch (e) {}
      this.musicGain = null;
    }
  }

  setMusicVolume() {
    if (this.musicGain) {
      this.musicGain.gain.value = this.muted ? 0 : 0.14;
    }
  }

  _scheduleMusic() {
    if (!this.musicPlaying || !this.ctx) return;
    while (this._nextNoteTime < this.ctx.currentTime + 0.25) {
      this._playMusicStep(this._musicStep, this._nextNoteTime);
      this._nextNoteTime += this._stepDur;
      this._musicStep = (this._musicStep + 1) % 32;
    }
  }

  _playMusicStep(step, t) {
    const bar = Math.floor(step / 8); // 4 Takte: Am, F, C, G
    const roots = [110.0, 87.31, 130.81, 98.0];            // A2, F2, C3, G2
    const arps = [
      [220.0, 261.63, 329.63, 440.0],   // Am: A3 C4 E4 A4
      [174.61, 220.0, 261.63, 349.23],  // F:  F3 A3 C4 F4
      [261.63, 329.63, 392.0, 523.25],  // C:  C4 E4 G4 C5
      [196.0, 246.94, 293.66, 392.0]    // G:  G3 B3 D4 G4
    ];

    // 🎸 Pumpender Bass auf jeder Achtel
    this._mTone(roots[bar], t, this._stepDur * 0.85, 'triangle', 0.5);

    // 🎹 Arpeggio-Melodie (jede Achtel ein Ton, auf & ab)
    const arp = arps[bar];
    const seq = [0, 1, 2, 3, 2, 3, 2, 1];
    this._mTone(arp[seq[step % 8]], t, this._stepDur * 0.7, 'square', 0.14);

    // 🥁 Kick auf Schlag 1 & 3, Hi-Hat auf Off-Beats
    if (step % 4 === 0) this._mKick(t);
    if (step % 2 === 1) this._mHat(t);
  }

  _mTone(freq, t, dur, type, vol) {
    if (!this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _mKick(t) {
    if (!this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  _mHat(t) {
    if (!this.musicGain) return;
    const len = 0.04;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(t);
  }
}

window.soundFx = new SoundEffects();
