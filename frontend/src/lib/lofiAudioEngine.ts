/**
 * CircleUp Lo-Fi Vintage Audio Engine
 *
 * Bespoke procedural Web Audio synthesizer providing a warm, nostalgic thrift-store soundtrack.
 * Zero bundle-weight audio assets, zero external network requests, 100% royalty-free.
 * Features mellow electric piano chords, tape wow/flutter, vinyl needle groove crackle, and dynamic progressions.
 */

export interface TrackMeta {
  title: string;
  subtitle: string;
  rpm: string;
  bpm: number;
}

export const TRACKS: TrackMeta[] = [
  {
    title: 'Sunny Morning Thrift',
    subtitle: 'Side A • Vintage Lo-Fi Sessions',
    rpm: '33⅓ RPM',
    bpm: 68,
  },
  {
    title: 'Rainy Day Treasure Hunt',
    subtitle: 'Side B • Pre-Loved Melodies',
    rpm: '33⅓ RPM',
    bpm: 64,
  },
  {
    title: 'Late Night Coffee & Corduroy',
    subtitle: 'Bonus Track • Acoustic Chill',
    rpm: '33⅓ RPM',
    bpm: 72,
  },
];

// Note frequencies in Hz
const NOTES = {
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  Bb2: 116.54,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  Bb3: 233.08,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  Bb4: 466.16,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
} as const;

interface ChordStep {
  root: number;
  chord: number[];
}

// Chord progressions per track
const PROGRESSIONS: ChordStep[][] = [
  // Sunny Morning Thrift: Fmaj7 -> Em7 -> Dm9 -> Cmaj7
  [
    { root: NOTES.F2, chord: [NOTES.F3, NOTES.A3, NOTES.C4, NOTES.E4] },
    { root: NOTES.E3, chord: [NOTES.E3, NOTES.G3, NOTES.B3, NOTES.D4] },
    { root: NOTES.D3, chord: [NOTES.D3, NOTES.F3, NOTES.A3, NOTES.C4, NOTES.E4] },
    { root: NOTES.C3, chord: [NOTES.C3, NOTES.E3, NOTES.G3, NOTES.B3] },
  ],
  // Rainy Day: Dm9 -> G13 -> Cmaj9 -> Am7
  [
    { root: NOTES.D3, chord: [NOTES.D3, NOTES.F3, NOTES.A3, NOTES.C4, NOTES.E4] },
    { root: NOTES.G2, chord: [NOTES.G3, NOTES.B3, NOTES.E4, NOTES.F4] },
    { root: NOTES.C3, chord: [NOTES.C3, NOTES.E3, NOTES.G3, NOTES.B3, NOTES.D4] },
    { root: NOTES.A2, chord: [NOTES.A3, NOTES.C4, NOTES.E4, NOTES.G4] },
  ],
  // Late Night: Bbmaj7 -> Am7 -> Gm7 -> Fmaj7
  [
    { root: NOTES.Bb2, chord: [NOTES.Bb3, NOTES.D4, NOTES.F4, NOTES.A4] },
    { root: NOTES.A2, chord: [NOTES.A3, NOTES.C4, NOTES.E4, NOTES.G4] },
    { root: NOTES.G2, chord: [NOTES.G3, NOTES.Bb3, NOTES.D4, NOTES.F4] },
    { root: NOTES.F2, chord: [NOTES.F3, NOTES.A3, NOTES.C4, NOTES.E4] },
  ],
];

type StateListener = (state: AudioEngineState) => void;

export interface AudioEngineState {
  isPlaying: boolean;
  volume: number;
  crackleEnabled: boolean;
  trackIndex: number;
  currentTrack: TrackMeta;
}

class LofiAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private crackleGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private crackleSource: AudioBufferSourceNode | null = null;
  private isRunning = false;
  private userExplicitlyPaused = false;
  private volume = 0.45;
  private crackleEnabled = true;
  private trackIndex = 0;
  private chordIndex = 0;
  private loopTimer: number | null = null;
  private arpTimer: number | null = null;
  private activeNodes = new Set<AudioScheduledSourceNode>();
  private listeners = new Set<StateListener>();
  private removeGestureListeners?: () => void;
  private startAttempt = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.userExplicitlyPaused = sessionStorage.getItem('circleup_music_paused') === 'true';
      } catch {
        // Fallback for restricted storage environments
      }
    }
  }

  public isUserExplicitlyPaused(): boolean {
    return this.userExplicitlyPaused;
  }

  /**
   * Browser Autoplay Policy Handler:
   * Browsers restrict unmuted audio before user interaction.
   * We attach passive listeners to instantly unlock AudioContext on the first tap, click, or scroll.
   */
  public attachGestureUnlock(): void {
    if (typeof window === 'undefined' || this.removeGestureListeners || this.userExplicitlyPaused) return;

    const unlock = () => {
      if (!this.userExplicitlyPaused) void this.start(false);
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('scroll', unlock);
      this.removeGestureListeners = undefined;
    };
    this.removeGestureListeners = cleanup;

    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    window.addEventListener('click', unlock, { passive: true, once: true });
    window.addEventListener('touchstart', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { passive: true, once: true });
    window.addEventListener('scroll', unlock, { passive: true, once: true });
  }

  private emitState() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  public getState(): AudioEngineState {
    return {
      isPlaying: this.isRunning,
      volume: this.volume,
      crackleEnabled: this.crackleEnabled,
      trackIndex: this.trackIndex,
      currentTrack: TRACKS[this.trackIndex] || TRACKS[0]!,
    };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private initContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      try {
        this.ctx = new AudioContextClass();

        // Master dynamics compressor (prevents harsh clipping, adds analog glue)
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 14;
        this.compressor.ratio.value = 3.5;
        this.compressor.attack.value = 0.02;
        this.compressor.release.value = 0.25;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  private createCrackleBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 4; // 4 second loop
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // Gentle surface pink noise
      const noise = (Math.random() * 2 - 1) * 0.015;
      // Sporadic vinyl dust pops & clicks
      const pop = Math.random() < 0.00035 ? (Math.random() * 2 - 1) * 0.18 : 0;
      data[i] = noise + pop;
    }
    return buffer;
  }

  private startCrackle(ctx: AudioContext) {
    if (!this.crackleEnabled || !this.compressor) return;
    try {
      this.stopCrackle();
      const buffer = this.createCrackleBuffer(ctx);
      this.crackleSource = ctx.createBufferSource();
      this.crackleSource.buffer = buffer;
      this.crackleSource.loop = true;

      // Bandpass filter for authentic needle groove warmth
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 2400;
      bpf.Q.value = 1.2;

      this.crackleGain = ctx.createGain();
      this.crackleGain.gain.value = 0.35;

      this.crackleSource.connect(bpf);
      bpf.connect(this.crackleGain);
      this.crackleGain.connect(this.compressor);

      this.crackleSource.start();
    } catch {
      // AudioContext policy fallback
    }
  }

  private stopCrackle() {
    if (this.crackleSource) {
      try {
        this.crackleSource.stop();
        this.crackleSource.disconnect();
      } catch {
        // Ignored
      }
      this.crackleSource = null;
    }
  }

  /**
   * Synthesize a warm, vintage Rhodes / electric piano chord with tape flutter
   */
  private playChord(ctx: AudioContext, frequencies: number[], bassFreq: number, duration: number) {
    if (!this.compressor || !this.isRunning) return;
    const now = ctx.currentTime;

    // Sub-bass root note for warmth
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(bassFreq, now);

    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.28, now + 0.12);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.95);

    bassOsc.connect(bassGain);
    bassGain.connect(this.compressor);
    this.activeNodes.add(bassOsc);
    bassOsc.onended = () => {
      this.activeNodes.delete(bassOsc);
    };
    bassOsc.start(now);
    bassOsc.stop(now + duration);

    // Warm Rhodes chords
    frequencies.forEach((freq, index) => {
      // Small strum offset between notes (15-30ms human feel)
      const noteTime = now + index * 0.022;

      // Primary sine oscillator + soft harmonic triangle
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      this.activeNodes.add(osc1);
      this.activeNodes.add(osc2);
      osc1.onended = () => {
        this.activeNodes.delete(osc1);
      };
      osc2.onended = () => {
        this.activeNodes.delete(osc2);
      };
      osc1.type = 'sine';
      osc2.type = 'triangle';

      // Subtle detuning for analog thickness
      const detune = (index % 2 === 0 ? 1 : -1) * 3.5;
      osc1.frequency.setValueAtTime(freq, noteTime);
      osc2.frequency.setValueAtTime(freq, noteTime);
      osc2.detune.setValueAtTime(detune, noteTime);

      // Low-pass filter to give that muffled, velvety lo-fi tape tone
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, noteTime);
      filter.frequency.exponentialRampToValueAtTime(650, noteTime + duration * 0.8);
      filter.Q.value = 1.0;

      // ADSR Envelope
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, noteTime);
      noteGain.gain.linearRampToValueAtTime(0.16, noteTime + 0.08); // Soft attack
      noteGain.gain.exponentialRampToValueAtTime(0.09, noteTime + 0.6); // Gentle decay
      noteGain.gain.exponentialRampToValueAtTime(0.001, noteTime + duration * 0.92); // Release

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.compressor!);

      osc1.start(noteTime);
      osc2.start(noteTime);
      osc1.stop(noteTime + duration);
      osc2.stop(noteTime + duration);
    });
  }

  /**
   * Delicate acoustic / Rhodes chime arpeggios that twinkle softly over the chords
   */
  private scheduleArpeggios(ctx: AudioContext, chordNotes: number[], barDuration: number) {
    if (!this.isRunning || !this.compressor) return;
    const now = ctx.currentTime;
    const arpBeats = [0.8, 1.6, 2.4, 2.9];

    arpBeats.forEach((beatOffset) => {
      const noteTime = now + beatOffset;
      if (noteTime >= now + barDuration) return;

      // Pick a random higher inversion note
      const baseNote = chordNotes[Math.floor(Math.random() * chordNotes.length)] || chordNotes[0]!;
      const freq = baseNote > 300 ? baseNote : baseNote * 2;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      this.activeNodes.add(osc);
      osc.onended = () => {
        this.activeNodes.delete(osc);
      };

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, noteTime);
      filter.Q.value = 2.0;

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.09, noteTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor!);

      osc.start(noteTime);
      osc.stop(noteTime + 0.65);
    });
  }

  private scheduleNextBar = () => {
    if (!this.isRunning || !this.ctx) return;

    const progression = PROGRESSIONS[this.trackIndex] || PROGRESSIONS[0]!;
    const barDuration = 3.6; // ~67 BPM per bar
    const step = progression[this.chordIndex] || progression[0]!;

    this.playChord(this.ctx, step.chord, step.root, barDuration);
    this.scheduleArpeggios(this.ctx, step.chord, barDuration);

    this.chordIndex = (this.chordIndex + 1) % progression.length;
    this.loopTimer = window.setTimeout(this.scheduleNextBar, (barDuration - 0.1) * 1000);
  };

  public async start(explicit = true): Promise<boolean> {
    if (explicit) {
      this.userExplicitlyPaused = false;
      try {
        sessionStorage.removeItem('circleup_music_paused');
      } catch {
        // Ignored
      }
    }
    if (this.isRunning && this.ctx && this.ctx.state === 'running') return true;
    const attempt = ++this.startAttempt;

    try {
      const ctx = this.initContext();
      if (ctx) {
        if (this.masterGain) {
          this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
          this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
        }
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        if (attempt !== this.startAttempt) return false;
        this.isRunning = true;
        if (!this.loopTimer) {
          this.chordIndex = 0;
          this.startCrackle(ctx);
          this.scheduleNextBar();
        }
      }

      this.isRunning = true;
      this.emitState();
      return true;
    } catch {
      if (attempt !== this.startAttempt) return false;
      this.isRunning = false;
      this.emitState();
      return false;
    }
  }

  public stop(explicit = true): void {
    this.startAttempt++;
    this.removeGestureListeners?.();
    if (explicit) {
      this.userExplicitlyPaused = true;
      try {
        sessionStorage.setItem('circleup_music_paused', 'true');
      } catch {
        // Ignored
      }
    }
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.arpTimer) {
      clearTimeout(this.arpTimer);
      this.arpTimer = null;
    }
    this.stopCrackle();

    // Immediately stop and disconnect all scheduled/playing oscillators
    this.activeNodes.forEach((node) => {
      try {
        node.stop();
        node.disconnect();
      } catch {
        // Ignored
      }
    });
    this.activeNodes.clear();

    // Silence master output and suspend the audio context
    if (this.masterGain && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(0, now);
        void this.ctx.suspend();
      } catch {
        // Ignored
      }
    }
    this.emitState();
  }

  public async toggle(): Promise<boolean> {
    if (this.isRunning) {
      this.stop();
      return false;
    }
    return this.start();
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    this.emitState();
  }

  public toggleCrackle(enabled?: boolean): void {
    this.crackleEnabled = enabled !== undefined ? enabled : !this.crackleEnabled;
    if (this.ctx && this.isRunning) {
      if (this.crackleEnabled) this.startCrackle(this.ctx);
      else this.stopCrackle();
    }
    this.emitState();
  }

  public nextTrack(): void {
    this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
    this.chordIndex = 0;
    if (this.isRunning && this.ctx) {
      if (this.loopTimer) clearTimeout(this.loopTimer);
      this.scheduleNextBar();
    }
    this.emitState();
  }
}

// Singleton global engine
export const lofiAudio = new LofiAudioEngine();
