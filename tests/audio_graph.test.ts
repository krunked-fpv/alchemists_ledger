import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AudioPhysicsBus,
  ProceduralAsmrAudioEngine,
  globalAudioBus,
  synthesizeKarplusStrongBuffer,
  type AudioPhysicsBusEvent,
  type BrassWeightDenom,
  type MarketRegime,
  type PolyrhythmRatio,
  type PotionVessel,
} from '../src/audio/index';

interface ParamCall {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime' | 'setTargetAtTime';
  value: number;
  time: number;
}

class MockAudioParam {
  private _value: number;
  readonly calls: ParamCall[] = [];

  constructor(initialValue = 0) {
    this._value = initialValue;
  }

  get value(): number {
    return this._value;
  }

  set value(v: number) {
    if (Number.isNaN(v)) {
      throw new Error('NaN assigned to AudioParam.value');
    }
    this._value = v;
  }

  setValueAtTime(value: number, startTime: number): this {
    if (Number.isNaN(value) || Number.isNaN(startTime)) {
      throw new Error('NaN passed to setValueAtTime');
    }
    this.calls.push({ method: 'setValueAtTime', value, time: startTime });
    this._value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, endTime: number): this {
    if (Number.isNaN(value) || Number.isNaN(endTime)) {
      throw new Error('NaN passed to linearRampToValueAtTime');
    }
    this.calls.push({ method: 'linearRampToValueAtTime', value, time: endTime });
    return this;
  }

  exponentialRampToValueAtTime(value: number, endTime: number): this {
    if (Number.isNaN(value) || Number.isNaN(endTime) || value <= 0) {
      throw new Error(`Invalid exponentialRampToValueAtTime(${value}, ${endTime})`);
    }
    this.calls.push({ method: 'exponentialRampToValueAtTime', value, time: endTime });
    return this;
  }

  setTargetAtTime(target: number, startTime: number, _timeConstant: number): this {
    if (Number.isNaN(target) || Number.isNaN(startTime)) {
      throw new Error('NaN passed to setTargetAtTime');
    }
    this.calls.push({ method: 'setTargetAtTime', value: target, time: startTime });
    return this;
  }
}

class MockAudioNode {
  readonly connectedTo: MockAudioNode[] = [];
  disconnected = false;

  connect(destination: MockAudioNode): MockAudioNode {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
    this.connectedTo.length = 0;
  }
}

class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam(1);
}

class MockDynamicsCompressorNode extends MockAudioNode {
  readonly threshold = new MockAudioParam(-24);
  readonly knee = new MockAudioParam(30);
  readonly ratio = new MockAudioParam(12);
  readonly attack = new MockAudioParam(0.003);
  readonly release = new MockAudioParam(0.25);
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new MockAudioParam(350);
  readonly Q = new MockAudioParam(1);
  readonly gain = new MockAudioParam(0);
}

class MockStereoPannerNode extends MockAudioNode {
  readonly pan = new MockAudioParam(0);
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  readonly frequency = new MockAudioParam(440);
  readonly detune = new MockAudioParam(0);
  started = false;
  stopped = false;
  onended: (() => void) | null = null;

  start(_when?: number): void {
    this.started = true;
  }

  stop(_when?: number): void {
    this.stopped = true;
  }
}

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  readonly playbackRate = new MockAudioParam(1);
  started = false;
  stopped = false;
  onended: (() => void) | null = null;

  start(_when?: number): void {
    this.started = true;
  }

  stop(_when?: number): void {
    this.stopped = true;
  }
}

class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 1.0;
  sampleRate = 44100;
  readonly destination = new MockAudioNode();

  readonly gains: MockGainNode[] = [];
  readonly compressors: MockDynamicsCompressorNode[] = [];
  readonly oscillators: MockOscillatorNode[] = [];
  readonly biquadFilters: MockBiquadFilterNode[] = [];
  readonly bufferSources: MockAudioBufferSourceNode[] = [];
  readonly stereoPanners: MockStereoPannerNode[] = [];
  readonly buffers: MockAudioBuffer[] = [];

  resumeCalls = 0;
  closeCalls = 0;
  shouldFailResume = false;

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.shouldFailResume) {
      throw new Error('Autoplay blocked');
    }
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
  }

  createGain(): MockGainNode {
    const node = new MockGainNode();
    this.gains.push(node);
    return node;
  }

  createDynamicsCompressor(): MockDynamicsCompressorNode {
    const node = new MockDynamicsCompressorNode();
    this.compressors.push(node);
    return node;
  }

  createOscillator(): MockOscillatorNode {
    const node = new MockOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const node = new MockBiquadFilterNode();
    this.biquadFilters.push(node);
    return node;
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const node = new MockAudioBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createStereoPanner(): MockStereoPannerNode {
    const node = new MockStereoPannerNode();
    this.stereoPanners.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): MockAudioBuffer {
    const buf = new MockAudioBuffer(channels, length, sampleRate);
    this.buffers.push(buf);
    return buf;
  }

  /** Simulate Web Audio firing `onended` on all non-looping finite sources. */
  flushTransientEnded(): number {
    let fired = 0;
    for (const osc of this.oscillators) {
      if (osc.started && osc.onended) {
        const cb = osc.onended;
        osc.onended = null;
        cb();
        fired += 1;
      }
    }
    for (const src of this.bufferSources) {
      if (!src.loop && src.started && src.onended) {
        const cb = src.onended;
        src.onended = null;
        cb();
        fired += 1;
      }
    }
    return fired;
  }

  snapshotCounts() {
    return {
      gains: this.gains.length,
      compressors: this.compressors.length,
      oscillators: this.oscillators.length,
      biquadFilters: this.biquadFilters.length,
      bufferSources: this.bufferSources.length,
      stereoPanners: this.stereoPanners.length,
    };
  }
}

function createHarness() {
  const bus = new AudioPhysicsBus();
  const mockCtx = new MockAudioContext();
  const factorySpy = vi.fn(() => mockCtx as unknown as AudioContext);
  const engine = new ProceduralAsmrAudioEngine(bus, factorySpy);
  return { bus, mockCtx, factorySpy, engine };
}

const ALL_13_EVENTS: AudioPhysicsBusEvent[] = [
  { type: 'mortar_grind', hardness: 0.85, speed: 0.9 },
  { type: 'herb_slice', wetness: 0.35 },
  { type: 'pipette_drop', viscosity: 3.6, pitchOffset: 2 },
  { type: 'ladle_swirl', angularSpeed: 6.4, viscosity: 4.5 },
  { type: 'bellows_pump', intensity: 0.8 },
  { type: 'cauldron_simmer', temperatureC: 88, viscosity: 5.2 },
  { type: 'glass_clink', vessel: 'prism', momentum: 0.75 },
  { type: 'cork_pop' },
  { type: 'wax_sizzle', phase: 'pour' },
  { type: 'scale_weight_clink', denom: 25, momentum: 0.7 },
  { type: 'quill_scratch', intensity: 0.65 },
  { type: 'cellar_drip', midiNote: 69, ratio: '3:4' },
  { type: 'weather_ambience', regime: 'dragon_siege' },
];

describe('AudioPhysicsBus', () => {
  it('delivers emitted events, supports unsubscribe, and clears listeners', () => {
    const bus = new AudioPhysicsBus();
    const received: string[] = [];

    const unsub1 = bus.on((e) => received.push(`a:${e.type}`));
    bus.on((e) => received.push(`b:${e.type}`));

    bus.emit({ type: 'cork_pop' });
    expect(received).toEqual(['a:cork_pop', 'b:cork_pop']);

    unsub1();
    bus.emit({ type: 'quill_scratch', intensity: 0.5 });
    expect(received).toEqual(['a:cork_pop', 'b:cork_pop', 'b:quill_scratch']);

    bus.clear();
    bus.emit({ type: 'cork_pop' });
    expect(received).toHaveLength(3);
  });

  it('exports globalAudioBus singleton instance', () => {
    expect(globalAudioBus).toBeInstanceOf(AudioPhysicsBus);
  });
});

describe('synthesizeKarplusStrongBuffer', () => {
  it('produces non-empty physical string decay strictly bounded in [-1, 1] with zero NaNs', () => {
    for (const freqHz of [110, 220, 329.63, 440, 880]) {
      const sampleRate = 44100;
      const durationSec = 1.0;
      const buf = synthesizeKarplusStrongBuffer(sampleRate, freqHz, durationSec, 0.996);

      expect(buf).toBeInstanceOf(Float32Array);
      expect(buf.length).toBe(sampleRate * durationSec);

      let allFinite = true;
      let minSample = Infinity;
      let maxSample = -Infinity;
      let maxAbs = 0;
      let startEnergy = 0;
      let endEnergy = 0;
      const quarter = Math.floor(buf.length / 4);

      for (let i = 0; i < buf.length; i++) {
        const s = buf[i];
        if (!Number.isFinite(s) || Number.isNaN(s)) {
          allFinite = false;
        }
        if (s < minSample) minSample = s;
        if (s > maxSample) maxSample = s;
        maxAbs = Math.max(maxAbs, Math.abs(s));
        if (i < quarter) startEnergy += s * s;
        if (i >= buf.length - quarter) endEnergy += s * s;
      }

      expect(allFinite).toBe(true);
      expect(minSample).toBeGreaterThanOrEqual(-1);
      expect(maxSample).toBeLessThanOrEqual(1);
      expect(maxAbs).toBeGreaterThan(0.1);
      expect(endEnergy).toBeLessThan(startEnergy);
    }
  });

  it('safely clamps degenerate parameters without producing NaNs', () => {
    expect(synthesizeKarplusStrongBuffer(44100, 220, 0).length).toBe(0);
    expect(synthesizeKarplusStrongBuffer(44100, 220, -1).length).toBe(0);

    const weird = synthesizeKarplusStrongBuffer(48000, -50, 0.25, 2.5);
    expect(weird.length).toBe(12000);
    let allValid = true;
    for (let i = 0; i < weird.length; i++) {
      if (!Number.isFinite(weird[i]) || weird[i] < -1 || weird[i] > 1) {
        allValid = false;
        break;
      }
    }
    expect(allValid).toBe(true);
  });
});

describe('ProceduralAsmrAudioEngine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('safely no-ops all 13 events before unlock() without calling contextFactory or throwing', () => {
    const { bus, factorySpy, engine } = createHarness();
    expect(engine.isUnlocked()).toBe(false);
    expect(engine.getActiveNodeCount()).toBe(0);

    engine.setMuted(true);
    engine.setMuted(false);
    engine.setMasterVolume(0.6);
    engine.setWeatherRegime('starfall_conclave');

    for (const ev of ALL_13_EVENTS) {
      expect(() => bus.emit(ev)).not.toThrow();
    }

    expect(factorySpy).not.toHaveBeenCalled();
    expect(engine.isUnlocked()).toBe(false);
    expect(engine.getActiveNodeCount()).toBe(0);

    engine.dispose();
  });

  it('unlocks on gesture, routes master GainNode -> soft-knee DynamicsCompressorNode -> destination, and is idempotent', async () => {
    const { mockCtx, factorySpy, engine } = createHarness();

    const ok1 = await engine.unlock();
    expect(ok1).toBe(true);
    expect(engine.isUnlocked()).toBe(true);
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(mockCtx.resumeCalls).toBe(1);
    expect(mockCtx.state).toBe('running');

    // Master chain check
    expect(mockCtx.compressors).toHaveLength(1);
    const compressor = mockCtx.compressors[0];
    expect(compressor.knee.value).toBeGreaterThan(0);
    expect(compressor.ratio.value).toBeGreaterThan(1);
    expect(compressor.threshold.value).toBeLessThan(0);
    expect(compressor.connectedTo).toContain(mockCtx.destination);

    const masterGain = mockCtx.gains.find((g) => g.connectedTo.includes(compressor));
    expect(masterGain).toBeDefined();

    // Idempotent second unlock does not duplicate context or master chain
    const ok2 = await engine.unlock();
    expect(ok2).toBe(true);
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(mockCtx.compressors).toHaveLength(1);

    engine.dispose();
  });

  it('handles unlock failure gracefully when contextFactory throws or resume rejects', async () => {
    const bus = new AudioPhysicsBus();
    const throwingEngine = new ProceduralAsmrAudioEngine(bus, () => {
      throw new Error('No audio hardware');
    });
    expect(await throwingEngine.unlock()).toBe(false);
    expect(throwingEngine.isUnlocked()).toBe(false);
    throwingEngine.dispose();

    const blockedCtx = new MockAudioContext();
    blockedCtx.shouldFailResume = true;
    const blockedEngine = new ProceduralAsmrAudioEngine(
      bus,
      () => blockedCtx as unknown as AudioContext,
    );
    expect(await blockedEngine.unlock()).toBe(false);
    expect(blockedEngine.isUnlocked()).toBe(false);
    blockedEngine.dispose();
  });

  it('clamps master volume to [0, 1] and toggles mute cleanly', async () => {
    const { mockCtx, engine } = createHarness();
    await engine.unlock();

    const compressor = mockCtx.compressors[0];
    const masterGain = mockCtx.gains.find((g) => g.connectedTo.includes(compressor))!;

    engine.setMasterVolume(1.8);
    expect(engine.getMasterVolume()).toBe(1);
    expect(masterGain.gain.value).toBe(1);

    engine.setMasterVolume(-0.4);
    expect(engine.getMasterVolume()).toBe(0);
    expect(masterGain.gain.value).toBe(0);

    engine.setMasterVolume(Number.NaN);
    expect(engine.getMasterVolume()).toBe(0);

    engine.setMasterVolume(0.55);
    expect(engine.getMasterVolume()).toBeCloseTo(0.55, 6);
    expect(masterGain.gain.value).toBeCloseTo(0.55, 6);

    engine.setMuted(true);
    expect(engine.isMuted()).toBe(true);
    expect(masterGain.gain.value).toBe(0);

    // Changing volume while muted updates stored volume without unmuting gain
    engine.setMasterVolume(0.75);
    expect(engine.getMasterVolume()).toBeCloseTo(0.75, 6);
    expect(masterGain.gain.value).toBe(0);

    engine.setMuted(false);
    expect(engine.isMuted()).toBe(false);
    expect(masterGain.gain.value).toBeCloseTo(0.75, 6);

    engine.dispose();
  });

  it('builds expected Web Audio synthesis chains for all 13 AudioPhysicsBusEvent handlers', async () => {
    const { bus, mockCtx, engine } = createHarness();
    await engine.unlock();

    // 1. mortar_grind
    let before = mockCtx.snapshotCounts();
    bus.emit({ type: 'mortar_grind', hardness: 0.9, speed: 0.8 });
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);
    expect(mockCtx.biquadFilters.slice(before.biquadFilters).some((f) => f.type === 'bandpass')).toBe(true);
    expect(mockCtx.oscillators.length).toBeGreaterThan(before.oscillators);

    // 2. herb_slice
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'herb_slice', wetness: 0.2 });
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);
    expect(mockCtx.biquadFilters.slice(before.biquadFilters).some((f) => f.type === 'bandpass')).toBe(true);
    expect(mockCtx.oscillators.length).toBeGreaterThan(before.oscillators);

    // 3. pipette_drop (Minnaert upward chirp)
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'pipette_drop', viscosity: 2.0, pitchOffset: 3 });
    const dropOsc = mockCtx.oscillators[before.oscillators];
    expect(dropOsc).toBeDefined();
    const dropRamps = dropOsc.frequency.calls.filter((c) => c.method === 'exponentialRampToValueAtTime');
    expect(dropRamps.length).toBeGreaterThan(0);
    expect(dropRamps[0].value).toBeGreaterThan(dropOsc.frequency.calls[0].value);
    expect(mockCtx.biquadFilters.length).toBeGreaterThan(before.biquadFilters);

    // 4. ladle_swirl (uses StereoPannerNode + BiquadFilterNode)
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'ladle_swirl', angularSpeed: 8.5, viscosity: 5.0 });
    expect(mockCtx.stereoPanners.length).toBeGreaterThan(before.stereoPanners);
    expect(mockCtx.biquadFilters.length).toBeGreaterThan(before.biquadFilters);
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);

    // 5. bellows_pump
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'bellows_pump', intensity: 1.0 });
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);
    expect(mockCtx.biquadFilters.slice(before.biquadFilters).some((f) => f.type === 'bandpass')).toBe(true);
    expect(mockCtx.biquadFilters.slice(before.biquadFilters).some((f) => f.type === 'lowpass')).toBe(true);

    // 6. cauldron_simmer
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'cauldron_simmer', temperatureC: 94, viscosity: 3.5 });
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);
    expect(mockCtx.oscillators.length - before.oscillators).toBeGreaterThanOrEqual(2);
    expect(mockCtx.biquadFilters.length).toBeGreaterThan(before.biquadFilters);

    // 7. glass_clink (4-mode BiquadFilterNode modal banks across all 4 vessel types)
    const vessels: PotionVessel[] = ['prism', 'teardrop', 'crescent', 'carafe'];
    const vesselFundamentals: number[] = [];
    for (const vessel of vessels) {
      before = mockCtx.snapshotCounts();
      bus.emit({ type: 'glass_clink', vessel, momentum: 0.8 });
      const newFilters = mockCtx.biquadFilters.slice(before.biquadFilters);
      const bandpassModes = newFilters.filter((f) => f.type === 'bandpass');
      expect(bandpassModes).toHaveLength(4);
      vesselFundamentals.push(bandpassModes[0].frequency.value);
    }
    expect(new Set(vesselFundamentals).size).toBe(4);

    // 8. cork_pop (upward resonant pitch sweep)
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'cork_pop' });
    const corkOsc = mockCtx.oscillators[before.oscillators];
    expect(corkOsc).toBeDefined();
    const corkSet = corkOsc.frequency.calls.find((c) => c.method === 'setValueAtTime')!;
    const corkSweep = corkOsc.frequency.calls.find((c) => c.method === 'exponentialRampToValueAtTime')!;
    expect(corkSweep.value).toBeGreaterThan(corkSet.value);
    expect(mockCtx.biquadFilters.length).toBeGreaterThan(before.biquadFilters);

    // 9. wax_sizzle ('pour' and 'stamp' damped thud)
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'wax_sizzle', phase: 'pour' });
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);
    expect(mockCtx.biquadFilters.length).toBeGreaterThan(before.biquadFilters);

    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'wax_sizzle', phase: 'stamp' });
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);
    expect(mockCtx.oscillators.length).toBeGreaterThan(before.oscillators);
    expect(mockCtx.biquadFilters.slice(before.biquadFilters).some((f) => f.type === 'lowpass')).toBe(true);

    // 10. scale_weight_clink (metallic modal partials scaling with brass weight denom)
    const denoms: BrassWeightDenom[] = [50, 25, 10, 5, 1, 0.5];
    const denomFirstPartials: number[] = [];
    for (const denom of denoms) {
      before = mockCtx.snapshotCounts();
      bus.emit({ type: 'scale_weight_clink', denom, momentum: 0.75 });
      const addedOscs = mockCtx.oscillators.slice(before.oscillators);
      expect(addedOscs.length).toBeGreaterThanOrEqual(4);
      denomFirstPartials.push(addedOscs[0].frequency.value);
    }
    // Lighter brass weights ring higher than heavier weights
    expect(denomFirstPartials[5]).toBeGreaterThan(denomFirstPartials[0]);

    // 11. quill_scratch
    before = mockCtx.snapshotCounts();
    bus.emit({ type: 'quill_scratch', intensity: 0.8 });
    expect(mockCtx.bufferSources.length).toBeGreaterThan(before.bufferSources);
    expect(mockCtx.biquadFilters.slice(before.biquadFilters).some((f) => f.type === 'highpass')).toBe(true);
    expect(mockCtx.biquadFilters.slice(before.biquadFilters).some((f) => f.type === 'bandpass')).toBe(true);

    // 12. cellar_drip (StereoPannerNode + MIDI tuning across polyrhythm ratios)
    const ratios: PolyrhythmRatio[] = ['3:4', '4:5', '5:6'];
    const dripPans: number[] = [];
    for (const ratio of ratios) {
      before = mockCtx.snapshotCounts();
      bus.emit({ type: 'cellar_drip', midiNote: 69, ratio });
      const newPanners = mockCtx.stereoPanners.slice(before.stereoPanners);
      expect(newPanners).toHaveLength(1);
      dripPans.push(newPanners[0].pan.value);
      const dripOsc = mockCtx.oscillators[before.oscillators];
      const targetFreq = dripOsc.frequency.calls.find(
        (c) => c.method === 'exponentialRampToValueAtTime',
      )!.value;
      expect(targetFreq).toBeCloseTo(440, 2);
    }
    expect(dripPans[0]).toBeLessThan(0);
    expect(dripPans[1]).toBe(0);
    expect(dripPans[2]).toBeGreaterThan(0);

    // 13. weather_ambience across all 5 MarketRegimes (retunes bed + Karplus-Strong lute pluck)
    const regimes: MarketRegime[] = [
      'calm',
      'dragon_siege',
      'bumper_harvest',
      'glacial_snap',
      'starfall_conclave',
    ];
    const ambientFilter = mockCtx.biquadFilters[0];
    const regimeFreqs: number[] = [];
    for (const regime of regimes) {
      before = mockCtx.snapshotCounts();
      bus.emit({ type: 'weather_ambience', regime });
      regimeFreqs.push(ambientFilter.frequency.value);
      const luteSrcs = mockCtx.bufferSources.slice(before.bufferSources);
      expect(luteSrcs).toHaveLength(1);
      expect(luteSrcs[0].buffer).not.toBeNull();
      const chan = luteSrcs[0].buffer!.getChannelData(0);
      expect(chan.length).toBeGreaterThan(mockCtx.sampleRate);
      expect(chan.every((v) => Number.isFinite(v) && v >= -1 && v <= 1)).toBe(true);
    }
    expect(new Set(regimeFreqs).size).toBe(5);

    engine.dispose();
  });

  it('returns active node count cleanly to baseline after onended cleanup across all 13 events', async () => {
    const { bus, mockCtx, engine } = createHarness();
    await engine.unlock();

    const baseline = engine.getActiveNodeCount();
    expect(baseline).toBeGreaterThan(0);

    for (const ev of ALL_13_EVENTS) {
      bus.emit(ev);
    }
    expect(engine.getActiveNodeCount()).toBeGreaterThan(baseline);

    const endedCount = mockCtx.flushTransientEnded();
    expect(endedCount).toBeGreaterThan(0);
    expect(engine.getActiveNodeCount()).toBe(baseline);

    // Repeating burst and flushing again stays leak-free
    bus.emit({ type: 'glass_clink', vessel: 'carafe', momentum: 1.0 });
    bus.emit({ type: 'wax_sizzle', phase: 'stamp' });
    expect(engine.getActiveNodeCount()).toBeGreaterThan(baseline);
    mockCtx.flushTransientEnded();
    expect(engine.getActiveNodeCount()).toBe(baseline);

    engine.dispose();
    expect(engine.getActiveNodeCount()).toBe(0);
    expect(mockCtx.closeCalls).toBe(1);
  });

  it('cleans up transient nodes via fallback timer if onended never fires and drives sparse lute timer', async () => {
    vi.useFakeTimers();
    const { bus, mockCtx, engine } = createHarness();
    await engine.unlock();

    const baseline = engine.getActiveNodeCount();
    bus.emit({ type: 'cork_pop' });
    expect(engine.getActiveNodeCount()).toBeGreaterThan(baseline);

    // Advance past fallback cleanup window without invoking onended
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.getActiveNodeCount()).toBe(baseline);

    // Advance into sparse generative Karplus-Strong lute schedule window
    const srcsBefore = mockCtx.bufferSources.length;
    await vi.advanceTimersByTimeAsync(7000);
    expect(mockCtx.bufferSources.length).toBeGreaterThan(srcsBefore);

    mockCtx.flushTransientEnded();
    await vi.advanceTimersByTimeAsync(2000);
    expect(engine.getActiveNodeCount()).toBe(baseline);

    engine.dispose();
    expect(engine.getActiveNodeCount()).toBe(0);
  });

  it('supports default globalAudioBus wiring, missing AudioContext in SSR, and NaN event resilience', async () => {
    const headlessEngine = new ProceduralAsmrAudioEngine();
    expect(await headlessEngine.unlock()).toBe(false);
    headlessEngine.dispose();

    const mockCtx = new MockAudioContext();
    const globalEngine = new ProceduralAsmrAudioEngine(
      undefined,
      () => mockCtx as unknown as AudioContext,
    );
    expect(await globalEngine.unlock()).toBe(true);
    const baseline = globalEngine.getActiveNodeCount();

    globalAudioBus.emit({ type: 'pipette_drop', viscosity: Number.NaN, pitchOffset: Number.NaN });
    globalAudioBus.emit({ type: 'cauldron_simmer', temperatureC: Number.NaN, viscosity: -10 });
    globalAudioBus.emit({ type: 'mortar_grind', hardness: Number.POSITIVE_INFINITY, speed: -3 });
    expect(globalEngine.getActiveNodeCount()).toBeGreaterThan(baseline);

    mockCtx.flushTransientEnded();
    expect(globalEngine.getActiveNodeCount()).toBe(baseline);

    globalEngine.dispose();
    expect(globalEngine.getActiveNodeCount()).toBe(0);
  });
});
