export type PotionVessel = 'prism' | 'teardrop' | 'crescent' | 'carafe';
export type MarketRegime =
  | 'calm'
  | 'dragon_siege'
  | 'bumper_harvest'
  | 'glacial_snap'
  | 'starfall_conclave';
export type BrassWeightDenom = 50 | 25 | 10 | 5 | 1 | 0.5;
export type PolyrhythmRatio = '3:4' | '4:5' | '5:6';

export type AudioPhysicsBusEvent =
  | { type: 'mortar_grind'; hardness: number; speed: number }
  | { type: 'herb_slice'; wetness: number }
  | { type: 'pipette_drop'; viscosity: number; pitchOffset?: number }
  | { type: 'ladle_swirl'; angularSpeed: number; viscosity: number }
  | { type: 'bellows_pump'; intensity: number }
  | { type: 'cauldron_simmer'; temperatureC: number; viscosity: number }
  | { type: 'glass_clink'; vessel: PotionVessel; momentum: number }
  | { type: 'cork_pop' }
  | { type: 'wax_sizzle'; phase: 'pour' | 'stamp' }
  | { type: 'scale_weight_clink'; denom: BrassWeightDenom; momentum: number }
  | { type: 'quill_scratch'; intensity: number }
  | { type: 'cellar_drip'; midiNote: number; ratio: PolyrhythmRatio }
  | { type: 'weather_ambience'; regime: MarketRegime };

export class AudioPhysicsBus {
  private readonly listeners = new Set<(event: AudioPhysicsBusEvent) => void>();

  /** Subscribe a listener to audio physics events; returns an unsubscribe callback. */
  on(listener: (event: AudioPhysicsBusEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Broadcast an event to all currently registered listeners. */
  emit(event: AudioPhysicsBusEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  /** Remove all registered listeners from the bus. */
  clear(): void {
    this.listeners.clear();
  }
}

export const globalAudioBus = new AudioPhysicsBus();

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function midiToHz(midiNote: number): number {
  const safeMidi = clampFinite(midiNote, 12, 120, 69);
  return 440 * Math.pow(2, (safeMidi - 69) / 12);
}

/** Deterministic PRNG (Mulberry32) so Karplus-Strong synthesis is repeatable and zero-dependency. */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthesize a pure Karplus-Strong plucked string buffer:
 * deterministic white/warmed noise burst excitation -> one-pole lowpass delay loop.
 * Guaranteed zero NaNs and amplitude strictly bounded within [-1, 1].
 */
export function synthesizeKarplusStrongBuffer(
  sampleRate: number,
  freqHz: number,
  durationSec: number,
  damping = 0.996,
): Float32Array {
  const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? Math.max(1000, Math.round(sampleRate)) : 44100;
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? Math.min(durationSec, 30) : 0;
  const totalSamples = Math.round(safeSampleRate * safeDuration);
  if (totalSamples <= 0) {
    return new Float32Array(0);
  }

  const maxNyquistSafeFreq = safeSampleRate * 0.42;
  const safeFreq = clampFinite(freqHz, 24, Math.max(25, maxNyquistSafeFreq), 220);
  const safeDamping = clampFinite(damping, 0, 0.9995, 0.996);

  // Account for ~0.5 sample phase delay of the 2-point lowpass averaging filter.
  const exactDelay = Math.max(2, safeSampleRate / safeFreq - 0.5);
  const delayLen = Math.max(2, Math.floor(exactDelay));
  const frac = clampFinite(exactDelay - delayLen, 0, 1, 0);

  const seed = Math.round(safeFreq * 100) ^ (safeSampleRate << 3) ^ Math.round(safeDamping * 10000);
  const rng = createSeededRng(seed || 0x9e3779b9);

  const delayLine = new Float32Array(delayLen);
  let mean = 0;
  for (let i = 0; i < delayLen; i++) {
    const sample = rng() * 2 - 1;
    delayLine[i] = sample;
    mean += sample;
  }
  mean /= delayLen;

  // Remove DC offset and softly warm the pluck excitation for nylon/gut lute character.
  let prevExcite = 0;
  let peak = 0;
  for (let i = 0; i < delayLen; i++) {
    const zeroMean = delayLine[i] - mean;
    const warmed = 0.65 * zeroMean + 0.35 * prevExcite;
    prevExcite = zeroMean;
    delayLine[i] = warmed;
    const absVal = Math.abs(warmed);
    if (absVal > peak) peak = absVal;
  }

  if (peak > 1e-6) {
    const norm = 0.9 / peak;
    for (let i = 0; i < delayLen; i++) {
      delayLine[i] *= norm;
    }
  } else {
    // Safety excitation fallback if degenerate
    for (let i = 0; i < delayLen; i++) {
      delayLine[i] = Math.sin((2 * Math.PI * i) / delayLen) * 0.8;
    }
  }

  const output = new Float32Array(totalSamples);
  let writeIdx = 0;
  let prevSample = delayLine[delayLen - 1];
  const fadeOutSamples = Math.min(128, Math.floor(totalSamples * 0.1));

  for (let i = 0; i < totalSamples; i++) {
    const nextIdx = (writeIdx + 1) % delayLen;
    // Fractional delay interpolation (convex combination keeps magnitude <= 1)
    const delayed = (1 - frac) * delayLine[writeIdx] + frac * delayLine[nextIdx];
    output[i] = clampFinite(delayed, -1, 1, 0);

    // One-pole lowpass + loss factor inside delay feedback loop
    const lowpassed = 0.5 * (delayed + prevSample) * safeDamping;
    prevSample = delayed;
    delayLine[writeIdx] = clampFinite(lowpassed, -1, 1, 0);

    writeIdx = nextIdx;
  }

  if (fadeOutSamples > 1) {
    const fadeStart = totalSamples - fadeOutSamples;
    for (let i = 0; i < fadeOutSamples; i++) {
      const env = 1 - i / fadeOutSamples;
      output[fadeStart + i] = clampFinite(output[fadeStart + i] * env, -1, 1, 0);
    }
  }

  return output;
}

interface VesselModalProfile {
  fundamentalHz: number;
  ratios: readonly [number, number, number, number];
  qs: readonly [number, number, number, number];
  amps: readonly [number, number, number, number];
  decaySec: number;
}

const VESSEL_MODAL_PROFILES: Record<PotionVessel, VesselModalProfile> = {
  prism: {
    fundamentalHz: 1320,
    ratios: [1.0, 1.52, 2.38, 3.17],
    qs: [48, 42, 36, 30],
    amps: [0.36, 0.25, 0.16, 0.1],
    decaySec: 0.52,
  },
  teardrop: {
    fundamentalHz: 1080,
    ratios: [1.0, 1.64, 2.51, 3.42],
    qs: [44, 38, 32, 26],
    amps: [0.38, 0.24, 0.15, 0.09],
    decaySec: 0.46,
  },
  crescent: {
    fundamentalHz: 920,
    ratios: [1.0, 1.41, 2.19, 2.95],
    qs: [40, 35, 30, 24],
    amps: [0.4, 0.26, 0.17, 0.1],
    decaySec: 0.44,
  },
  carafe: {
    fundamentalHz: 680,
    ratios: [1.0, 1.58, 2.27, 3.04],
    qs: [36, 32, 28, 22],
    amps: [0.44, 0.26, 0.16, 0.1],
    decaySec: 0.58,
  },
};

const BRASS_FUNDAMENTAL_HZ: Record<BrassWeightDenom, number> = {
  50: 520,
  25: 660,
  10: 840,
  5: 1040,
  1: 1380,
  0.5: 1760,
};

const BRASS_PARTIAL_RATIOS: readonly [number, number, number, number] = [1.0, 2.01, 2.76, 3.89];

const POLYRHYTHM_PAN: Record<PolyrhythmRatio, number> = {
  '3:4': -0.45,
  '4:5': 0.0,
  '5:6': 0.45,
};

interface RegimeAcousticProfile {
  filterType: BiquadFilterType;
  filterFreqHz: number;
  filterQ: number;
  ambienceGain: number;
  luteScaleMidi: readonly number[];
  luteDamping: number;
  luteBodyCutoffHz: number;
}

const REGIME_ACOUSTIC_PROFILES: Record<MarketRegime, RegimeAcousticProfile> = {
  calm: {
    filterType: 'lowpass',
    filterFreqHz: 440,
    filterQ: 0.8,
    ambienceGain: 0.035,
    luteScaleMidi: [50, 52, 54, 57, 59, 62, 64, 66, 69], // D Major / Ionian pastoral
    luteDamping: 0.9965,
    luteBodyCutoffHz: 2800,
  },
  dragon_siege: {
    filterType: 'bandpass',
    filterFreqHz: 260,
    filterQ: 1.6,
    ambienceGain: 0.075,
    luteScaleMidi: [50, 51, 55, 57, 58, 62, 63, 67, 69], // D Phrygian Dominant tension
    luteDamping: 0.9945,
    luteBodyCutoffHz: 2400,
  },
  bumper_harvest: {
    filterType: 'bandpass',
    filterFreqHz: 1650,
    filterQ: 1.1,
    ambienceGain: 0.065,
    luteScaleMidi: [50, 52, 53, 57, 59, 62, 64, 65, 69], // D Dorian rain dance
    luteDamping: 0.996,
    luteBodyCutoffHz: 3100,
  },
  glacial_snap: {
    filterType: 'bandpass',
    filterFreqHz: 980,
    filterQ: 3.4,
    ambienceGain: 0.055,
    luteScaleMidi: [50, 52, 53, 55, 57, 58, 62, 65, 69], // D Aeolian crystalline frost
    luteDamping: 0.9975,
    luteBodyCutoffHz: 3600,
  },
  starfall_conclave: {
    filterType: 'bandpass',
    filterFreqHz: 2200,
    filterQ: 2.6,
    ambienceGain: 0.05,
    luteScaleMidi: [50, 52, 54, 56, 57, 59, 61, 62, 66, 69], // D Lydian celestial shimmer
    luteDamping: 0.997,
    luteBodyCutoffHz: 3800,
  },
};

function safeDisconnect(node: AudioNode | null | undefined): void {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // Ignore disconnect errors on already-torn-down contexts/nodes
  }
}

function safeStopSource(node: AudioScheduledSourceNode | null | undefined): void {
  if (!node) return;
  try {
    node.stop();
  } catch {
    // Ignore InvalidStateError if already stopped or not started
  }
}

function setParamValue(param: AudioParam | undefined, value: number): void {
  if (!param) return;
  param.value = clampFinite(value, -1e6, 1e6, 0);
}

function linearRamp(param: AudioParam | undefined, value: number, time: number): void {
  if (!param) return;
  const safeVal = clampFinite(value, -1e6, 1e6, 0);
  if (typeof param.linearRampToValueAtTime === 'function') {
    param.linearRampToValueAtTime(safeVal, time);
  } else {
    param.value = safeVal;
  }
}

function expRamp(param: AudioParam | undefined, value: number, time: number): void {
  if (!param) return;
  const safeVal = clampFinite(value, 0.0001, 1e6, 0.0001);
  if (typeof param.exponentialRampToValueAtTime === 'function') {
    param.exponentialRampToValueAtTime(safeVal, time);
  } else {
    param.value = safeVal;
  }
}

function setValueAt(param: AudioParam | undefined, value: number, time: number): void {
  if (!param) return;
  const safeVal = clampFinite(value, -1e6, 1e6, 0);
  if (typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(safeVal, time);
  } else {
    param.value = safeVal;
  }
}

export class ProceduralAsmrAudioEngine {
  private readonly bus: AudioPhysicsBus;
  private readonly contextFactory?: () => AudioContext;
  private unsubscribeBus: (() => void) | null = null;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientGain: GainNode | null = null;

  private whiteNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  private unlocked = false;
  private disposed = false;
  private unlockPromise: Promise<boolean> | null = null;
  private muted = false;
  private masterVolume = 0.8;
  private currentRegime: MarketRegime = 'calm';

  private swirlPhase = 0;
  private luteStep = 0;
  private luteTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly persistentNodes = new Set<AudioNode>();
  private readonly transientNodes = new Set<AudioNode>();
  private readonly voiceTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(bus: AudioPhysicsBus = globalAudioBus, contextFactory?: () => AudioContext) {
    this.bus = bus;
    this.contextFactory = contextFactory;
    this.unsubscribeBus = this.bus.on((event) => this.handleEvent(event));
  }

  /** Unlock/initialize the Web Audio context from a user gesture. */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.unlocked && this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        try {
          await this.ctx.resume();
        } catch {
          return false;
        }
      }
      return !this.disposed;
    }

    if (this.unlockPromise) {
      return this.unlockPromise;
    }

    this.unlockPromise = this.performUnlock();
    try {
      return await this.unlockPromise;
    } finally {
      this.unlockPromise = null;
    }
  }

  private async performUnlock(): Promise<boolean> {
    let ctx: AudioContext | null = null;
    try {
      if (this.contextFactory) {
        ctx = this.contextFactory();
      } else {
        const AudioCtor =
          (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ??
          (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtor) {
          ctx = new AudioCtor();
        }
      }
    } catch {
      return false;
    }

    if (!ctx) return false;

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }

    if (this.disposed) {
      try {
        if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
          void ctx.close();
        }
      } catch {
        // ignore
      }
      return false;
    }

    this.ctx = ctx;
    this.initializeMasterChain(ctx);
    this.buildNoiseBuffers(ctx);
    this.initializeAmbientBed(ctx);
    this.unlocked = true;
    this.scheduleNextLuteNote();
    return true;
  }

  private initializeMasterChain(ctx: AudioContext): void {
    const masterGain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    setParamValue(masterGain.gain, this.muted ? 0 : this.masterVolume);
    setParamValue(compressor.threshold, -14);
    setParamValue(compressor.knee, 18);
    setParamValue(compressor.ratio, 4);
    setParamValue(compressor.attack, 0.005);
    setParamValue(compressor.release, 0.15);

    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    this.masterGain = masterGain;
    this.compressor = compressor;
    this.persistentNodes.add(masterGain);
    this.persistentNodes.add(compressor);
  }

  private buildNoiseBuffers(ctx: AudioContext): void {
    const sr = Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0 ? Math.round(ctx.sampleRate) : 44100;
    const len = Math.max(1024, Math.round(sr * 1.5));
    const rng = createSeededRng(0x51a7b3c1);

    const whiteBuf = ctx.createBuffer(1, len, sr);
    const whiteData = whiteBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      whiteData[i] = clampFinite(rng() * 2 - 1, -1, 1, 0);
    }
    this.whiteNoiseBuffer = whiteBuf;

    // Paul Kellet's refined pink-noise filter for warm organic sizzles, wind, and hearth rumble
    const pinkBuf = ctx.createBuffer(1, len, sr);
    const pinkData = pinkBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = whiteData[i];
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      pinkData[i] = clampFinite(pink, -1, 1, 0);
    }
    this.pinkNoiseBuffer = pinkBuf;
  }

  private initializeAmbientBed(ctx: AudioContext): void {
    if (!this.masterGain || !this.pinkNoiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.pinkNoiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const profile = REGIME_ACOUSTIC_PROFILES[this.currentRegime];

    filter.type = profile.filterType;
    setParamValue(filter.frequency, profile.filterFreqHz);
    setParamValue(filter.Q, profile.filterQ);
    setParamValue(gain.gain, profile.ambienceGain);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(ctx.currentTime);

    this.ambientSource = src;
    this.ambientFilter = filter;
    this.ambientGain = gain;
    this.persistentNodes.add(src);
    this.persistentNodes.add(filter);
    this.persistentNodes.add(gain);
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  setMuted(muted: boolean): void {
    this.muted = Boolean(muted);
    if (this.masterGain) {
      setParamValue(this.masterGain.gain, this.muted ? 0 : this.masterVolume);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMasterVolume(level: number): void {
    const clamped = Number.isNaN(level) ? 0 : Math.max(0, Math.min(1, level));
    this.masterVolume = clamped;
    if (this.masterGain && !this.muted) {
      setParamValue(this.masterGain.gain, this.masterVolume);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  setWeatherRegime(regime: MarketRegime): void {
    this.currentRegime = regime;
    if (!this.unlocked || !this.ctx || this.disposed) return;

    this.applyRegimeToAmbientBed(regime);
    this.playRegimeTransitionCue(regime);
  }

  getActiveNodeCount(): number {
    return this.persistentNodes.size + this.transientNodes.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;

    if (this.unsubscribeBus) {
      this.unsubscribeBus();
      this.unsubscribeBus = null;
    }

    if (this.luteTimer !== null) {
      clearTimeout(this.luteTimer);
      this.luteTimer = null;
    }

    for (const timer of this.voiceTimers) {
      clearTimeout(timer);
    }
    this.voiceTimers.clear();

    for (const node of this.transientNodes) {
      if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
        safeStopSource(node as AudioScheduledSourceNode);
      }
      safeDisconnect(node);
    }
    this.transientNodes.clear();

    if (this.ambientSource) {
      safeStopSource(this.ambientSource);
      this.ambientSource = null;
    }
    for (const node of this.persistentNodes) {
      safeDisconnect(node);
    }
    this.persistentNodes.clear();

    this.ambientFilter = null;
    this.ambientGain = null;
    this.masterGain = null;
    this.compressor = null;
    this.whiteNoiseBuffer = null;
    this.pinkNoiseBuffer = null;

    if (this.ctx) {
      const ctxToClose = this.ctx;
      this.ctx = null;
      try {
        if (ctxToClose.state !== 'closed' && typeof ctxToClose.close === 'function') {
          void ctxToClose.close().catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  }

  private createPanner(ctx: AudioContext, panValue: number): AudioNode {
    const safePan = clampFinite(panValue, -1, 1, 0);
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      setParamValue(panner.pan, safePan);
      return panner;
    }
    const passthrough = ctx.createGain();
    setParamValue(passthrough.gain, 1);
    return passthrough;
  }

  /**
   * Register transient nodes for deterministic cleanup on `onended` (with timer fallback)
   * so `getActiveNodeCount()` returns cleanly to baseline without leaking.
   */
  private registerVoice(
    sources: AudioScheduledSourceNode[],
    otherNodes: AudioNode[],
    maxDurationSec: number,
  ): void {
    const allNodes: AudioNode[] = [...sources, ...otherNodes];
    for (const node of allNodes) {
      this.transientNodes.add(node);
    }

    if (sources.length === 0) {
      for (const node of otherNodes) {
        safeDisconnect(node);
        this.transientNodes.delete(node);
      }
      return;
    }

    const remainingSources = new Set<AudioScheduledSourceNode>(sources);
    let finalized = false;

    const finalizeVoice = (): void => {
      if (finalized) return;
      finalized = true;
      this.voiceTimers.delete(fallbackTimer);
      clearTimeout(fallbackTimer);
      for (const src of sources) {
        src.onended = null;
      }
      for (const node of allNodes) {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          safeStopSource(node as AudioScheduledSourceNode);
        }
        safeDisconnect(node);
        this.transientNodes.delete(node);
      }
    };

    const delayMs = Math.max(50, Math.ceil((clampFinite(maxDurationSec, 0.02, 15, 0.5) + 0.25) * 1000));
    const fallbackTimer = setTimeout(finalizeVoice, delayMs);
    (fallbackTimer as { unref?: () => void }).unref?.();
    this.voiceTimers.add(fallbackTimer);

    for (const src of sources) {
      src.onended = () => {
        if (this.disposed || finalized || !remainingSources.has(src)) return;
        remainingSources.delete(src);
        src.onended = null;
        safeDisconnect(src);
        this.transientNodes.delete(src);
        if (remainingSources.size === 0) {
          finalizeVoice();
        }
      };
    }
  }

  private handleEvent(event: AudioPhysicsBusEvent): void {
    if (!this.unlocked || !this.ctx || !this.masterGain || this.disposed) {
      return;
    }

    switch (event.type) {
      case 'mortar_grind':
        this.playMortarGrind(event.hardness, event.speed);
        break;
      case 'herb_slice':
        this.playHerbSlice(event.wetness);
        break;
      case 'pipette_drop':
        this.playPipetteDrop(event.viscosity, event.pitchOffset);
        break;
      case 'ladle_swirl':
        this.playLadleSwirl(event.angularSpeed, event.viscosity);
        break;
      case 'bellows_pump':
        this.playBellowsPump(event.intensity);
        break;
      case 'cauldron_simmer':
        this.playCauldronSimmer(event.temperatureC, event.viscosity);
        break;
      case 'glass_clink':
        this.playGlassClink(event.vessel, event.momentum);
        break;
      case 'cork_pop':
        this.playCorkPop();
        break;
      case 'wax_sizzle':
        this.playWaxSizzle(event.phase);
        break;
      case 'scale_weight_clink':
        this.playScaleWeightClink(event.denom, event.momentum);
        break;
      case 'quill_scratch':
        this.playQuillScratch(event.intensity);
        break;
      case 'cellar_drip':
        this.playCellarDrip(event.midiNote, event.ratio);
        break;
      case 'weather_ambience':
        this.setWeatherRegime(event.regime);
        break;
    }
  }

  private playMortarGrind(hardness: number, speed: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const h = clampFinite(hardness, 0, 1, 0.5);
    const s = clampFinite(speed, 0.05, 2, 0.5);
    const dur = 0.14;

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;
    setParamValue(noiseSrc.playbackRate, 0.75 + h * 0.75 + s * 0.15);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    setParamValue(bp.frequency, 900 + h * 2700);
    setParamValue(bp.Q, 2.2 + h * 4.2);

    const gritGain = ctx.createGain();
    const peakAmp = clampFinite(0.12 + s * 0.14, 0.04, 0.4, 0.2);
    setValueAt(gritGain.gain, 0.0001, now);
    linearRamp(gritGain.gain, peakAmp, now + 0.015);
    expRamp(gritGain.gain, 0.0001, now + dur);

    noiseSrc.connect(bp);
    bp.connect(gritGain);
    gritGain.connect(this.masterGain!);

    noiseSrc.start(now);
    noiseSrc.stop(now + dur);

    // Crystal fracture micro-ping scaled by mineral hardness
    const pingOsc = ctx.createOscillator();
    pingOsc.type = 'triangle';
    const startFreq = 1800 + h * 2600;
    setValueAt(pingOsc.frequency, startFreq, now);
    expRamp(pingOsc.frequency, startFreq * 0.65, now + 0.05);

    const pingGain = ctx.createGain();
    const pingAmp = clampFinite(0.03 + h * 0.1 * Math.min(1, s), 0.01, 0.2, 0.06);
    setValueAt(pingGain.gain, 0.0001, now);
    linearRamp(pingGain.gain, pingAmp, now + 0.003);
    expRamp(pingGain.gain, 0.0001, now + 0.055);

    pingOsc.connect(pingGain);
    pingGain.connect(this.masterGain!);
    pingOsc.start(now);
    pingOsc.stop(now + 0.06);

    this.registerVoice([noiseSrc, pingOsc], [bp, gritGain, pingGain], dur);
  }

  private playHerbSlice(wetness: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const w = clampFinite(wetness, 0, 1, 0.4);
    const dur = 0.11;

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;
    setParamValue(noiseSrc.playbackRate, 1.15 - w * 0.35);

    const sliceFilter = ctx.createBiquadFilter();
    sliceFilter.type = 'bandpass';
    setValueAt(sliceFilter.frequency, 3600 - w * 1800, now);
    expRamp(sliceFilter.frequency, 1100 - w * 400, now + dur);
    setParamValue(sliceFilter.Q, 1.5 + w * 2.8);

    const sliceGain = ctx.createGain();
    setValueAt(sliceGain.gain, 0.0001, now);
    linearRamp(sliceGain.gain, 0.22, now + 0.01);
    expRamp(sliceGain.gain, 0.0001, now + dur);

    noiseSrc.connect(sliceFilter);
    sliceFilter.connect(sliceGain);
    sliceGain.connect(this.masterGain!);
    noiseSrc.start(now);
    noiseSrc.stop(now + dur);

    // Subtle walnut board blade-stop thud
    const boardOsc = ctx.createOscillator();
    boardOsc.type = 'triangle';
    setValueAt(boardOsc.frequency, 195, now + 0.025);
    expRamp(boardOsc.frequency, 92, now + 0.075);

    const boardGain = ctx.createGain();
    setValueAt(boardGain.gain, 0.0001, now);
    setValueAt(boardGain.gain, 0.0001, now + 0.024);
    linearRamp(boardGain.gain, 0.11, now + 0.03);
    expRamp(boardGain.gain, 0.0001, now + 0.085);

    boardOsc.connect(boardGain);
    boardGain.connect(this.masterGain!);
    boardOsc.start(now + 0.024);
    boardOsc.stop(now + 0.09);

    this.registerVoice([noiseSrc, boardOsc], [sliceFilter, sliceGain, boardGain], dur);
  }

  private playPipetteDrop(viscosity: number, pitchOffset = 0): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const vis = clampFinite(viscosity, 0.5, 25, 4);
    const semitones = clampFinite(pitchOffset, -24, 24, 0);
    const pitchMult = Math.pow(2, semitones / 12);

    // Minnaert bubble cavity closure sweeps UP in frequency; thicker viscosity lowers centroid
    const baseHz = Math.max(180, (540 - vis * 11) * pitchMult);
    const targetHz = Math.min(2400, baseHz * 2.15);
    const dur = 0.085 + (vis / 25) * 0.035;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    setValueAt(osc.frequency, baseHz, now);
    expRamp(osc.frequency, targetHz, now + dur * 0.78);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    setParamValue(bp.frequency, (baseHz + targetHz) * 0.5, );
    setParamValue(bp.Q, 3.4);

    const gain = ctx.createGain();
    setValueAt(gain.gain, 0.0001, now);
    linearRamp(gain.gain, 0.24, now + 0.005);
    expRamp(gain.gain, 0.0001, now + dur);

    osc.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + dur);

    this.registerVoice([osc], [bp, gain], dur);
  }

  private playLadleSwirl(angularSpeed: number, viscosity: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const omega = clampFinite(Math.abs(angularSpeed), 0, 40, 2);
    const vis = clampFinite(viscosity, 0.5, 25, 4);
    const dur = 0.16;

    this.swirlPhase = (this.swirlPhase + 0.7 + omega * 0.15) % (Math.PI * 2);
    const pan = Math.sin(this.swirlPhase) * 0.7;

    const src = ctx.createBufferSource();
    src.buffer = this.pinkNoiseBuffer;
    setParamValue(src.playbackRate, 0.75 + Math.min(0.6, omega * 0.04));

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const centerHz = clampFinite(240 + omega * 42 - vis * 7, 140, 1200, 340);
    setParamValue(filter.frequency, centerHz);
    setParamValue(filter.Q, 1.6 + (vis / 25) * 1.4);

    const panner = this.createPanner(ctx, pan);
    const gain = ctx.createGain();
    const amp = clampFinite(0.04 + Math.min(1, omega / 12) * 0.15, 0.02, 0.24, 0.1);

    setValueAt(gain.gain, 0.0001, now);
    linearRamp(gain.gain, amp, now + 0.04);
    expRamp(gain.gain, 0.0001, now + dur);

    src.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(this.masterGain!);
    src.start(now);
    src.stop(now + dur);

    this.registerVoice([src], [filter, panner, gain], dur);
  }

  private playBellowsPump(intensity: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const k = clampFinite(intensity, 0.05, 1.5, 0.7);
    const dur = 0.34;

    const airSrc = ctx.createBufferSource();
    airSrc.buffer = this.pinkNoiseBuffer;

    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    setValueAt(airFilter.frequency, 260, now);
    expRamp(airFilter.frequency, 580 + k * 420, now + 0.11);
    expRamp(airFilter.frequency, 210, now + dur);
    setParamValue(airFilter.Q, 1.3);

    const airGain = ctx.createGain();
    setValueAt(airGain.gain, 0.0001, now);
    linearRamp(airGain.gain, 0.16 * Math.min(1.2, k), now + 0.05);
    expRamp(airGain.gain, 0.0001, now + dur);

    airSrc.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(this.masterGain!);
    airSrc.start(now);
    airSrc.stop(now + dur);

    // Warm leather + charcoal hearth low-end pulse
    const hearthOsc = ctx.createOscillator();
    hearthOsc.type = 'triangle';
    setValueAt(hearthOsc.frequency, 88, now);
    expRamp(hearthOsc.frequency, 56, now + 0.22);

    const hearthFilter = ctx.createBiquadFilter();
    hearthFilter.type = 'lowpass';
    setParamValue(hearthFilter.frequency, 190);

    const hearthGain = ctx.createGain();
    setValueAt(hearthGain.gain, 0.0001, now);
    linearRamp(hearthGain.gain, 0.09 * Math.min(1.2, k), now + 0.03);
    expRamp(hearthGain.gain, 0.0001, now + 0.24);

    hearthOsc.connect(hearthFilter);
    hearthFilter.connect(hearthGain);
    hearthGain.connect(this.masterGain!);
    hearthOsc.start(now);
    hearthOsc.stop(now + 0.25);

    this.registerVoice([airSrc, hearthOsc], [airFilter, airGain, hearthFilter, hearthGain], dur);
  }

  private playCauldronSimmer(temperatureC: number, viscosity: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const tempNorm = clampFinite((temperatureC - 15) / 100, 0, 1, 0.5);
    const vis = clampFinite(viscosity, 0.5, 25, 4);
    const dur = 0.24;

    const steamSrc = ctx.createBufferSource();
    steamSrc.buffer = this.pinkNoiseBuffer;

    const steamFilter = ctx.createBiquadFilter();
    steamFilter.type = 'bandpass';
    setParamValue(steamFilter.frequency, 1400 + tempNorm * 1800);
    setParamValue(steamFilter.Q, 1.4);

    const steamGain = ctx.createGain();
    const steamAmp = clampFinite(0.03 + tempNorm * 0.1, 0.02, 0.16, 0.06);
    setValueAt(steamGain.gain, 0.0001, now);
    linearRamp(steamGain.gain, steamAmp, now + 0.04);
    expRamp(steamGain.gain, 0.0001, now + dur);

    steamSrc.connect(steamFilter);
    steamFilter.connect(steamGain);
    steamGain.connect(this.masterGain!);
    steamSrc.start(now);
    steamSrc.stop(now + dur);

    // Thermal bubble pop oscillators
    const bubbleOsc1 = ctx.createOscillator();
    bubbleOsc1.type = 'sine';
    const b1Start = Math.max(140, 320 + tempNorm * 220 - vis * 8);
    setValueAt(bubbleOsc1.frequency, b1Start, now + 0.02);
    expRamp(bubbleOsc1.frequency, b1Start * 1.75, now + 0.08);

    const bubbleOsc2 = ctx.createOscillator();
    bubbleOsc2.type = 'sine';
    const b2Start = Math.max(160, 410 + tempNorm * 260 - vis * 9);
    setValueAt(bubbleOsc2.frequency, b2Start, now + 0.1);
    expRamp(bubbleOsc2.frequency, b2Start * 1.85, now + 0.17);

    const bubbleFilter = ctx.createBiquadFilter();
    bubbleFilter.type = 'bandpass';
    setParamValue(bubbleFilter.frequency, (b1Start + b2Start) * 0.7);
    setParamValue(bubbleFilter.Q, 2.5);

    const bubbleGain = ctx.createGain();
    const bubbleAmp = clampFinite(0.04 + tempNorm * 0.09, 0.02, 0.15, 0.07);
    setValueAt(bubbleGain.gain, 0.0001, now);
    linearRamp(bubbleGain.gain, bubbleAmp, now + 0.03);
    expRamp(bubbleGain.gain, 0.0001, now + 0.19);

    bubbleOsc1.connect(bubbleFilter);
    bubbleOsc2.connect(bubbleFilter);
    bubbleFilter.connect(bubbleGain);
    bubbleGain.connect(this.masterGain!);

    bubbleOsc1.start(now + 0.02);
    bubbleOsc1.stop(now + 0.09);
    bubbleOsc2.start(now + 0.1);
    bubbleOsc2.stop(now + 0.185);

    this.registerVoice(
      [steamSrc, bubbleOsc1, bubbleOsc2],
      [steamFilter, steamGain, bubbleFilter, bubbleGain],
      dur,
    );
  }

  private playGlassClink(vessel: PotionVessel, momentum: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const m = clampFinite(momentum, 0.05, 1.5, 0.7);
    const profile = VESSEL_MODAL_PROFILES[vessel] ?? VESSEL_MODAL_PROFILES.prism;
    const dur = profile.decaySec;

    const strikerSrc = ctx.createBufferSource();
    strikerSrc.buffer = this.whiteNoiseBuffer;

    const sources: AudioScheduledSourceNode[] = [strikerSrc];
    const nodes: AudioNode[] = [];

    strikerSrc.start(now);
    strikerSrc.stop(now + 0.02);

    // 4-mode BiquadFilterNode borosilicate resonant modal bank
    for (let i = 0; i < 4; i++) {
      const modeFreq = profile.fundamentalHz * profile.ratios[i];
      const modeDecay = dur * (1 - i * 0.16);
      const modeAmp = profile.amps[i] * Math.min(1.2, m);

      const modalFilter = ctx.createBiquadFilter();
      modalFilter.type = 'bandpass';
      setParamValue(modalFilter.frequency, modeFreq);
      setParamValue(modalFilter.Q, profile.qs[i]);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      setParamValue(osc.frequency, modeFreq);

      const modeGain = ctx.createGain();
      setValueAt(modeGain.gain, 0.0001, now);
      linearRamp(modeGain.gain, modeAmp, now + 0.003);
      expRamp(modeGain.gain, 0.0001, now + modeDecay);

      strikerSrc.connect(modalFilter);
      osc.connect(modalFilter);
      modalFilter.connect(modeGain);
      modeGain.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + modeDecay + 0.01);

      sources.push(osc);
      nodes.push(modalFilter, modeGain);
    }

    this.registerVoice(sources, nodes, dur + 0.02);
  }

  private playCorkPop(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const dur = 0.13;

    // Resonant pitch sweep from bottle neck cavity evacuation
    const popOsc = ctx.createOscillator();
    popOsc.type = 'sine';
    setValueAt(popOsc.frequency, 185, now);
    expRamp(popOsc.frequency, 640, now + 0.055);

    const resFilter = ctx.createBiquadFilter();
    resFilter.type = 'bandpass';
    setValueAt(resFilter.frequency, 220, now);
    expRamp(resFilter.frequency, 740, now + 0.055);
    setParamValue(resFilter.Q, 5.2);

    const popGain = ctx.createGain();
    setValueAt(popGain.gain, 0.0001, now);
    linearRamp(popGain.gain, 0.34, now + 0.004);
    expRamp(popGain.gain, 0.0001, now + dur);

    popOsc.connect(resFilter);
    resFilter.connect(popGain);
    popGain.connect(this.masterGain!);
    popOsc.start(now);
    popOsc.stop(now + dur);

    // Crisp vacuum air release burst
    const airBurst = ctx.createBufferSource();
    airBurst.buffer = this.whiteNoiseBuffer;

    const airBp = ctx.createBiquadFilter();
    airBp.type = 'bandpass';
    setParamValue(airBp.frequency, 880);
    setParamValue(airBp.Q, 2.4);

    const airGain = ctx.createGain();
    setValueAt(airGain.gain, 0.0001, now);
    linearRamp(airGain.gain, 0.18, now + 0.003);
    expRamp(airGain.gain, 0.0001, now + 0.045);

    airBurst.connect(airBp);
    airBp.connect(airGain);
    airGain.connect(this.masterGain!);
    airBurst.start(now);
    airBurst.stop(now + 0.05);

    this.registerVoice([popOsc, airBurst], [resFilter, popGain, airBp, airGain], dur);
  }

  private playWaxSizzle(phase: 'pour' | 'stamp'): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    if (phase === 'pour') {
      const dur = 0.26;
      const sizzleSrc = ctx.createBufferSource();
      sizzleSrc.buffer = this.whiteNoiseBuffer;

      const sizzleFilter = ctx.createBiquadFilter();
      sizzleFilter.type = 'bandpass';
      setValueAt(sizzleFilter.frequency, 1800, now);
      expRamp(sizzleFilter.frequency, 2900, now + dur);
      setParamValue(sizzleFilter.Q, 2.6);

      const sizzleGain = ctx.createGain();
      setValueAt(sizzleGain.gain, 0.0001, now);
      linearRamp(sizzleGain.gain, 0.15, now + 0.025);
      expRamp(sizzleGain.gain, 0.0001, now + dur);

      sizzleSrc.connect(sizzleFilter);
      sizzleFilter.connect(sizzleGain);
      sizzleGain.connect(this.masterGain!);
      sizzleSrc.start(now);
      sizzleSrc.stop(now + dur);

      this.registerVoice([sizzleSrc], [sizzleFilter, sizzleGain], dur);
      return;
    }

    // phase === 'stamp': filtered sizzle + damped brass signet thud
    const dur = 0.16;

    const sizzleSrc = ctx.createBufferSource();
    sizzleSrc.buffer = this.whiteNoiseBuffer;

    const sizzleFilter = ctx.createBiquadFilter();
    sizzleFilter.type = 'bandpass';
    setParamValue(sizzleFilter.frequency, 2400);
    setParamValue(sizzleFilter.Q, 2.8);

    const sizzleGain = ctx.createGain();
    setValueAt(sizzleGain.gain, 0.0001, now);
    linearRamp(sizzleGain.gain, 0.14, now + 0.008);
    expRamp(sizzleGain.gain, 0.0001, now + 0.12);

    sizzleSrc.connect(sizzleFilter);
    sizzleFilter.connect(sizzleGain);
    sizzleGain.connect(this.masterGain!);
    sizzleSrc.start(now);
    sizzleSrc.stop(now + 0.13);

    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'sine';
    setValueAt(thudOsc.frequency, 150, now);
    expRamp(thudOsc.frequency, 52, now + 0.09);

    const thudFilter = ctx.createBiquadFilter();
    thudFilter.type = 'lowpass';
    setParamValue(thudFilter.frequency, 240);

    const thudGain = ctx.createGain();
    setValueAt(thudGain.gain, 0.0001, now);
    linearRamp(thudGain.gain, 0.3, now + 0.004);
    expRamp(thudGain.gain, 0.0001, now + dur);

    thudOsc.connect(thudFilter);
    thudFilter.connect(thudGain);
    thudGain.connect(this.masterGain!);
    thudOsc.start(now);
    thudOsc.stop(now + dur);

    this.registerVoice(
      [sizzleSrc, thudOsc],
      [sizzleFilter, sizzleGain, thudFilter, thudGain],
      dur,
    );
  }

  private playScaleWeightClink(denom: BrassWeightDenom, momentum: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const m = clampFinite(momentum, 0.05, 1.5, 0.7);
    const fundamental = BRASS_FUNDAMENTAL_HZ[denom] ?? 840;
    const dur = 0.34;

    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];

    const strikeNoise = ctx.createBufferSource();
    strikeNoise.buffer = this.whiteNoiseBuffer;
    const strikeFilter = ctx.createBiquadFilter();
    strikeFilter.type = 'bandpass';
    setParamValue(strikeFilter.frequency, fundamental * 2.1);
    setParamValue(strikeFilter.Q, 4.0);
    const strikeGain = ctx.createGain();
    setValueAt(strikeGain.gain, 0.0001, now);
    linearRamp(strikeGain.gain, 0.14 * Math.min(1.2, m), now + 0.002);
    expRamp(strikeGain.gain, 0.0001, now + 0.03);

    strikeNoise.connect(strikeFilter);
    strikeFilter.connect(strikeGain);
    strikeGain.connect(this.masterGain!);
    strikeNoise.start(now);
    strikeNoise.stop(now + 0.035);
    sources.push(strikeNoise);
    nodes.push(strikeFilter, strikeGain);

    for (let i = 0; i < BRASS_PARTIAL_RATIOS.length; i++) {
      const freq = fundamental * BRASS_PARTIAL_RATIOS[i];
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      setParamValue(osc.frequency, freq);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setParamValue(bp.frequency, freq);
      setParamValue(bp.Q, 18 + i * 6);

      const partialDur = dur * (1 - i * 0.18);
      const gain = ctx.createGain();
      const amp = (0.22 / (i + 1)) * Math.min(1.2, m);
      setValueAt(gain.gain, 0.0001, now);
      linearRamp(gain.gain, amp, now + 0.002);
      expRamp(gain.gain, 0.0001, now + partialDur);

      osc.connect(bp);
      bp.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + partialDur + 0.01);

      sources.push(osc);
      nodes.push(bp, gain);
    }

    this.registerVoice(sources, nodes, dur + 0.02);
  }

  private playQuillScratch(intensity: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const k = clampFinite(intensity, 0.05, 1.5, 0.6);
    const dur = 0.085;

    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuffer;
    setParamValue(src.playbackRate, 1.1 + k * 0.35);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    setParamValue(hp.frequency, 1500);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    setParamValue(bp.frequency, 2800 + k * 1400);
    setParamValue(bp.Q, 3.2);

    const gain = ctx.createGain();
    setValueAt(gain.gain, 0.0001, now);
    linearRamp(gain.gain, 0.14 * Math.min(1.2, k), now + 0.008);
    expRamp(gain.gain, 0.0001, now + dur);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain!);
    src.start(now);
    src.stop(now + dur);

    this.registerVoice([src], [hp, bp, gain], dur);
  }

  private playCellarDrip(midiNote: number, ratio: PolyrhythmRatio): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const freqHz = midiToHz(midiNote);
    const pan = POLYRHYTHM_PAN[ratio] ?? 0;
    const dur = 0.34;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    setValueAt(osc1.frequency, freqHz * 0.94, now);
    expRamp(osc1.frequency, freqHz, now + 0.024);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    setParamValue(osc2.frequency, freqHz * 2.0);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    setParamValue(bp.frequency, freqHz * 1.25);
    setParamValue(bp.Q, 2.2);

    const panner = this.createPanner(ctx, pan);

    const gain1 = ctx.createGain();
    setValueAt(gain1.gain, 0.0001, now);
    linearRamp(gain1.gain, 0.18, now + 0.005);
    expRamp(gain1.gain, 0.0001, now + dur);

    const gain2 = ctx.createGain();
    setValueAt(gain2.gain, 0.0001, now);
    linearRamp(gain2.gain, 0.06, now + 0.004);
    expRamp(gain2.gain, 0.0001, now + dur * 0.6);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(bp);
    gain2.connect(bp);
    bp.connect(panner);
    panner.connect(this.masterGain!);

    osc1.start(now);
    osc1.stop(now + dur + 0.01);
    osc2.start(now);
    osc2.stop(now + dur * 0.65);

    this.registerVoice([osc1, osc2], [gain1, gain2, bp, panner], dur + 0.02);
  }

  private applyRegimeToAmbientBed(regime: MarketRegime): void {
    const profile = REGIME_ACOUSTIC_PROFILES[regime] ?? REGIME_ACOUSTIC_PROFILES.calm;
    if (this.ambientFilter) {
      this.ambientFilter.type = profile.filterType;
      setParamValue(this.ambientFilter.frequency, profile.filterFreqHz);
      setParamValue(this.ambientFilter.Q, profile.filterQ);
    }
    if (this.ambientGain) {
      setParamValue(this.ambientGain.gain, profile.ambienceGain);
    }
  }

  private playRegimeTransitionCue(regime: MarketRegime): void {
    const profile = REGIME_ACOUSTIC_PROFILES[regime] ?? REGIME_ACOUSTIC_PROFILES.calm;
    const scale = profile.luteScaleMidi;
    const note = scale[this.luteStep % scale.length];
    this.luteStep = (this.luteStep + 2) % scale.length;
    this.playKarplusLutePluck(note, regime, ((this.luteStep % 5) - 2) * 0.15);
  }

  private playKarplusLutePluck(midiNote: number, regime: MarketRegime, panValue = 0): void {
    if (!this.unlocked || !this.ctx || !this.masterGain || this.disposed) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const profile = REGIME_ACOUSTIC_PROFILES[regime] ?? REGIME_ACOUSTIC_PROFILES.calm;
    const freqHz = midiToHz(midiNote);
    const dur = 1.4;
    const sr = Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0 ? Math.round(ctx.sampleRate) : 44100;

    const samples = synthesizeKarplusStrongBuffer(sr, freqHz, dur, profile.luteDamping);
    const audioBuf = ctx.createBuffer(1, samples.length, sr);
    audioBuf.getChannelData(0).set(samples);

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;

    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    setParamValue(bodyFilter.frequency, profile.luteBodyCutoffHz);
    setParamValue(bodyFilter.Q, 0.9);

    const panner = this.createPanner(ctx, panValue);

    const gain = ctx.createGain();
    setValueAt(gain.gain, 0.16, now);
    expRamp(gain.gain, 0.0001, now + dur);

    src.connect(bodyFilter);
    bodyFilter.connect(panner);
    panner.connect(gain);
    gain.connect(this.masterGain);

    src.start(now);
    src.stop(now + dur);

    this.registerVoice([src], [bodyFilter, panner, gain], dur);
  }

  private scheduleNextLuteNote(): void {
    if (this.disposed || !this.unlocked) return;
    if (this.luteTimer !== null) {
      clearTimeout(this.luteTimer);
    }

    const delayMs = 4200 + ((this.luteStep * 733) % 2400);
    this.luteTimer = setTimeout(() => {
      this.luteTimer = null;
      if (this.disposed || !this.unlocked) return;

      const profile = REGIME_ACOUSTIC_PROFILES[this.currentRegime] ?? REGIME_ACOUSTIC_PROFILES.calm;
      const scale = profile.luteScaleMidi;
      const note = scale[this.luteStep % scale.length];
      const pan = ((this.luteStep % 3) - 1) * 0.25;
      this.luteStep = (this.luteStep + 3) % scale.length;

      if (!this.muted) {
        this.playKarplusLutePluck(note, this.currentRegime, pan);
      }
      this.scheduleNextLuteNote();
    }, delayMs);
    (this.luteTimer as { unref?: () => void }).unref?.();
  }
}
