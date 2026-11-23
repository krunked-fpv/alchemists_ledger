// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCheckHeadless, stepFluidSolverCpuRef } from '../../src/render/fluid_cpu_ref';
import {
  ApothecaryRenderer,
  type CauldronLayerVisual,
  type WaxColor,
} from '../../src/render/index';
import {
  CANONICAL_REAGENT_ORDER,
  CauldronSimulator,
  REAGENT_CATALOG,
  evaluateCommission,
  type FestivalCommissionSpec,
  type GameMode,
  type ReagentId,
} from '../../src/alchemy/index';
import {
  CellarAutomationEngine,
  DORIAN_LYDIAN_MIDI_NOTES,
  evalCubicBezier,
  type PolyrhythmRatio,
} from '../../src/cellar/index';
import {
  ALL_MARKET_REGIMES,
  computeMarketSnapshot,
  type MarketRegime,
  type MarketSnapshot,
} from '../../simulation/market_shocks';
import { BrassBalanceScale, type BrassWeightDenom } from '../../simulation/npc_envoys';
import { canSellBackRawReagent } from '../../simulation/haggling_matrix';
import {
  COOKIE_MAX_BYTES,
  COOKIE_VAULT_NAME,
  IDB_NAME,
  IDB_STORE,
  PRIMARY_LS_KEY,
  VaultManager,
  computeCrc32Hex,
  createDefaultLedgerState,
  decodeCookieVaultDigest,
  encodeCookieVaultDigest,
  type CraftedPotion,
  type HouseholdSlotId,
  type LedgerSaveStateV1,
} from '../../src/vault/index';
import { ApothecaryStudioApp } from '../../src/ui/studio_app';

interface MockIdbHandle {
  factory: IDBFactory;
  clearAll: () => void;
  hasRecord: () => boolean;
}

function createMockIndexedDb(): MockIdbHandle {
  const databases = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();

  const factory = {
    open(name: string) {
      const req: Record<string, unknown> = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };

      queueMicrotask(() => {
        let stores = databases.get(name);
        const isNew = !stores;
        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }

        const db = {
          objectStoreNames: {
            contains: (storeName: string) => stores!.has(storeName),
          },
          onversionchange: null as null | (() => void),
          close: () => {},
          createObjectStore: (storeName: string) => {
            if (!stores!.has(storeName)) {
              stores!.set(storeName, new Map());
            }
            return {};
          },
          transaction: (storeName: string) => {
            const tx: Record<string, unknown> = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: (requestedName: string) => {
                const map = stores!.get(requestedName || storeName);
                if (!map) {
                  throw new Error(`Missing store ${requestedName || storeName}`);
                }
                return {
                  get: (key: IDBValidKey) => {
                    const getReq: Record<string, unknown> = {
                      result: undefined,
                      onsuccess: null,
                      onerror: null,
                    };
                    queueMicrotask(() => {
                      getReq.result = map.get(key);
                      if (typeof getReq.onsuccess === 'function') {
                        (getReq.onsuccess as () => void)();
                      }
                      if (typeof tx.oncomplete === 'function') {
                        (tx.oncomplete as () => void)();
                      }
                    });
                    return getReq;
                  },
                  put: (value: unknown, key: IDBValidKey) => {
                    const putReq: Record<string, unknown> = {
                      result: key,
                      onsuccess: null,
                      onerror: null,
                    };
                    queueMicrotask(() => {
                      map.set(key, structuredClone(value));
                      if (typeof putReq.onsuccess === 'function') {
                        (putReq.onsuccess as () => void)();
                      }
                      if (typeof tx.oncomplete === 'function') {
                        (tx.oncomplete as () => void)();
                      }
                    });
                    return putReq;
                  },
                };
              },
            };
            return tx;
          },
        };

        req.result = db;
        if (isNew && typeof req.onupgradeneeded === 'function') {
          (req.onupgradeneeded as () => void)();
        }
        if (typeof req.onsuccess === 'function') {
          (req.onsuccess as () => void)();
        }
      });

      return req as unknown as IDBOpenDBRequest;
    },
    deleteDatabase(name: string) {
      const req: Record<string, unknown> = { onsuccess: null, onerror: null };
      queueMicrotask(() => {
        databases.delete(name);
        if (typeof req.onsuccess === 'function') {
          (req.onsuccess as () => void)();
        }
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;

  return {
    factory,
    clearAll: () => databases.clear(),
    hasRecord: () => Boolean(databases.get(IDB_NAME)?.get(IDB_STORE)?.has(PRIMARY_LS_KEY)),
  };
}

function makeRichCraftedPotion(slotId: HouseholdSlotId, index: number, day: number): CraftedPotion {
  const vessels = ['prism', 'teardrop', 'crescent', 'carafe'] as const;
  const colors = ['crimson', 'verdigris', 'gold', 'indigo'] as const;
  const crests = ['phoenix', 'alembic', 'crescent', 'scales'] as const;
  const effects = [
    'fire_ward',
    'burn_salve',
    'hearth_tonic',
    'galaxy_elixir',
    'neutralizing_salve',
    'soothing_draught',
  ] as const;

  const r1 = CANONICAL_REAGENT_ORDER[index % 12];
  const r2 = CANONICAL_REAGENT_ORDER[(index + 3) % 12];
  const r3 = CANONICAL_REAGENT_ORDER[(index + 7) % 12];
  const r4 = CANONICAL_REAGENT_ORDER[(index + 10) % 12];

  const layerReagents = [r1, r2, r3, r4].sort(
    (a, b) => REAGENT_CATALOG[b].specificGravity - REAGENT_CATALOG[a].specificGravity
  );

  return {
    id: `crucible-s${slotId}-p${index}`,
    name: `Crucible Reserve S${slotId}-${index}`,
    vessel: vessels[(slotId + index) % vessels.length],
    seal: {
      color: colors[(slotId + index) % colors.length],
      crest: crests[index % crests.length],
      stamped: true,
    },
    layers: layerReagents.map((reagentId, layerIdx) => ({
      reagentId,
      prepForm: layerIdx === 0 ? 'cellar_quintessence' : REAGENT_CATALOG[reagentId].preferredPrep,
      specificGravity: REAGENT_CATALOG[reagentId].specificGravity,
      volumeMl: 20 + layerIdx * 5,
      viscosity: REAGENT_CATALOG[reagentId].baseViscosity,
      colorRgb: [...REAGENT_CATALOG[reagentId].baseColorRgb],
      micaIntensity: REAGENT_CATALOG[reagentId].micaIntensity,
      interfaceSharpness: 0.91,
    })),
    purity: 0.94,
    marblingIndex: 0.12,
    layerCrispness: 0.89,
    collectorBrilliance: 0.86,
    ph: 7.1,
    peakTempC: 76,
    dominantEffect: effects[index % effects.length],
    baseValueCrowns: 88.5 + index * 12.5,
    createdAtDay: day,
  };
}

function clearCookieVault(): void {
  document.cookie = `${COOKIE_VAULT_NAME}=; path=/; max-age=0`;
}

function createStubCanvas2dContext(): CanvasRenderingContext2D {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    font: '12px serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    ellipse: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    save: noop,
    restore: noop,
    fillText: noop,
  } as unknown as CanvasRenderingContext2D;
}

function spyCanvasGetContext2dOnly(): void {
  const ctx2d = createStubCanvas2dContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((contextId: string) => {
    if (contextId === '2d') {
      return ctx2d;
    }
    return null;
  }) as unknown as HTMLCanvasElement['getContext']);
}

describe('1. Shader & Fluid Crucible', () => {
  beforeEach(() => {
    spyCanvasGetContext2dOnly();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies all 3 GLSL ES 3.00 shaders and every required uniform via compileCheckHeadless()', () => {
    const check = compileCheckHeadless();
    expect(check.cauldronShaderValid).toBe(true);
    expect(check.causticsShaderValid).toBe(true);
    expect(check.weatherShaderValid).toBe(true);

    const expectedUniforms = [
      // shaders/cauldron_core.glsl
      'u_time',
      'u_dt',
      'u_resolution',
      'u_pointerPos',
      'u_pointerVel',
      'u_ladleOmega',
      'u_viscosity',
      'u_temperature',
      'u_marbling',
      'u_layerCrispness',
      'u_micaAmount',
      'u_rippleOrigin',
      'u_ripplePhase',
      'u_layerColors',
      'u_layerDensities',
      'u_prevState',
      // shaders/glass_caustics.glsl
      'u_vesselType',
      'u_pourProgress',
      'u_waxStamped',
      'u_waxColor',
      // shaders/stained_glass_weather.glsl
      'u_regimeIndex',
      'u_sunAngle',
    ];

    for (const uniformName of expectedUniforms) {
      expect(check.uniformsVerified).toContain(uniformName);
    }
  });

  it('survives extreme figure-8 reversals, dt=0, dt=5.0 spikes, min/max viscosity, and 115C without NaN', () => {
    let grid: Float32Array | undefined;

    const stressSequence: Array<{
      dt: number;
      pointerVel: [number, number];
      ladleOmega: number;
      viscosity: number;
      temperatureC: number;
    }> = [
      { dt: 0, pointerVel: [0, 0], ladleOmega: 35, viscosity: 0.5, temperatureC: 115 },
      { dt: 1 / 60, pointerVel: [8, -8], ladleOmega: 35, viscosity: 0.5, temperatureC: 115 },
      { dt: 1 / 60, pointerVel: [-8, 8], ladleOmega: -35, viscosity: 0.5, temperatureC: 115 },
      { dt: 1 / 60, pointerVel: [8, 8], ladleOmega: 35, viscosity: 0.5, temperatureC: 115 },
      { dt: 5.0, pointerVel: [-8, -8], ladleOmega: -35, viscosity: 0.5, temperatureC: 115 },
      { dt: 5.0, pointerVel: [8, -8], ladleOmega: 35, viscosity: 25.0, temperatureC: 115 },
      { dt: 1 / 240, pointerVel: [-8, 8], ladleOmega: -35, viscosity: 25.0, temperatureC: 115 },
      { dt: 0, pointerVel: [999, -999], ladleOmega: 35, viscosity: 25.0, temperatureC: 115 },
    ];

    for (let cycle = 0; cycle < 4; cycle++) {
      for (const step of stressSequence) {
        const res = stepFluidSolverCpuRef({ ...step, grid });
        expect(res.hasNaN).toBe(false);
        expect(Number.isFinite(res.maxVelocity)).toBe(true);
        expect(Number.isFinite(res.vorticityPeak)).toBe(true);
        for (let i = 0; i < res.grid.length; i++) {
          expect(Number.isFinite(res.grid[i])).toBe(true);
        }
        grid = res.grid;
      }
    }

    // Also verify recovery if an external caller injects a corrupted grid buffer
    const poisonedGrid = new Float32Array(grid!.length);
    poisonedGrid[0] = Number.NaN;
    poisonedGrid[1] = Number.POSITIVE_INFINITY;
    poisonedGrid[2] = Number.NEGATIVE_INFINITY;
    const healed = stepFluidSolverCpuRef({
      dt: 1 / 60,
      pointerVel: [4, -4],
      ladleOmega: -35,
      viscosity: 0.5,
      temperatureC: 115,
      grid: poisonedGrid,
    });
    expect(healed.hasNaN).toBe(false);
    expect(Number.isFinite(healed.maxVelocity)).toBe(true);
    expect(Number.isFinite(healed.vorticityPeak)).toBe(true);
    for (let i = 0; i < healed.grid.length; i++) {
      expect(Number.isFinite(healed.grid[i])).toBe(true);
    }
  });

  it('steps ApothecaryRenderer across extreme motion, vessels, and regimes in jsdom without throwing', () => {
    const cauldronCanvas = document.createElement('canvas');
    const decantCanvas = document.createElement('canvas');
    const windowCanvas = document.createElement('canvas');
    const renderer = new ApothecaryRenderer({ cauldronCanvas, decantCanvas, windowCanvas });

    try {
      expect(['webgl2', 'canvas2d']).toContain(renderer.getBackend());
      const layers: CauldronLayerVisual[] = [
        {
          colorRgb: [0.86, 0.24, 0.14],
          specificGravity: 1.55,
          volumeFraction: 0.5,
          micaIntensity: 0.2,
          sharpness: 0.92,
        },
        {
          colorRgb: [0.46, 0.32, 0.88],
          specificGravity: 0.82,
          volumeFraction: 0.5,
          micaIntensity: 0.85,
          sharpness: 0.88,
        },
      ];

      renderer.updateCauldronState({
        layers,
        temperatureC: 115,
        viscosity: 0.5,
        marblingIndex: 0.72,
        layerCrispness: 0.45,
        phRgb: [0.42, 0.28, 0.78],
      });
      renderer.setLadleMotion(0.5, 0.5, 8, -8, 35);
      renderer.triggerDropletRipple(0.3, 0.7);
      const vessels = ['prism', 'teardrop', 'crescent', 'carafe'] as const;
      const waxColors: WaxColor[] = ['crimson', 'verdigris', 'gold', 'indigo'];
      for (let i = 0; i < vessels.length; i++) {
        renderer.updateDecantView({
          vessel: vessels[i],
          pourProgress: 0.25 + i * 0.25,
          corked: i >= 1,
          waxColor: waxColors[i],
          waxPoured: i >= 2,
          waxStamped: i >= 3,
          layers,
        });
        renderer.updateWeather(ALL_MARKET_REGIMES[i % ALL_MARKET_REGIMES.length]);
        renderer.renderFrame(i * 16.67);
      }
      renderer.updateWeather('starfall_conclave');
      renderer.setLadleMotion(0.5, 0.5, -8, 8, -35);
      renderer.renderFrame(5016.67); // 5s tab-switch spike
    } finally {
      renderer.dispose();
    }
  });
});

describe('2. STEM Thermodynamics & Conservation Crucible', () => {
  it('enforces exact volume conservation and descending bottom-to-top specific gravity in both modes', () => {
    const modes: GameMode[] = ['apprentice', 'grandmaster'];

    for (const mode of modes) {
      const sim = new CauldronSimulator(mode);
      const additions: Array<[ReagentId, 'raw' | 'ground_crystal' | 'sliced_botanical' | 'pipette_drops', number]> = [
        ['starlight_aether_oil', 'pipette_drops', 12],
        ['verdigris_moss_sap', 'sliced_botanical', 28],
        ['cinnabar_sulfur_ash', 'ground_crystal', 18],
        ['amber_honey_resin', 'raw', 22],
        ['verdigris_moss_sap', 'sliced_botanical', 10], // duplicate merge
        ['bismuth_vitriol_salt', 'ground_crystal', 15],
      ];

      let expectedVolume = 0;
      for (const [id, prep, ml] of additions) {
        expectedVolume += ml;
        const st = sim.addReagent(id, prep, ml);
        const sumLayers = st.layers.reduce((acc, layer) => acc + layer.volumeMl, 0);
        expect(sumLayers).toBeCloseTo(st.totalVolumeMl, 6);
        expect(st.totalVolumeMl).toBeCloseTo(expectedVolume, 6);
        for (let i = 0; i < st.layers.length - 1; i++) {
          expect(st.layers[i].specificGravity).toBeGreaterThanOrEqual(
            st.layers[i + 1].specificGravity
          );
        }
      }
    }
  });

  it('preserves crispness >= 0.75 at omega=0.8 while whipping at omega=16.0 lifts marblingIndex > 0.45', () => {
    const modes: GameMode[] = ['apprentice', 'grandmaster'];

    for (const mode of modes) {
      const gentle = new CauldronSimulator(mode);
      gentle.addReagent('cinnabar_sulfur_ash', 'ground_crystal', 25);
      gentle.addReagent('verdigris_moss_sap', 'sliced_botanical', 25);
      gentle.addReagent('starlight_aether_oil', 'pipette_drops', 25);

      for (let i = 0; i < 60; i++) {
        gentle.applyLadleStir(0.8, 1 / 30);
      }
      const gentleState = gentle.getState();
      expect(gentleState.layerCrispness).toBeGreaterThanOrEqual(0.75);

      const whipped = new CauldronSimulator(mode);
      whipped.addReagent('cinnabar_sulfur_ash', 'ground_crystal', 25);
      whipped.addReagent('verdigris_moss_sap', 'sliced_botanical', 25);
      whipped.addReagent('starlight_aether_oil', 'pipette_drops', 25);

      for (let i = 0; i < 60; i++) {
        whipped.applyLadleStir(16.0, 1 / 30);
      }
      const whippedState = whipped.getState();
      expect(whippedState.marblingIndex).toBeGreaterThan(0.45);
      expect(whippedState.layerCrispness).toBeLessThan(gentleState.layerCrispness);
    }
  });

  it('triggers boilOverPenalty > 0 above 98C in grandmaster while remaining forgiving in apprentice', () => {
    const apprentice = new CauldronSimulator('apprentice');
    const grandmaster = new CauldronSimulator('grandmaster');

    for (const sim of [apprentice, grandmaster]) {
      sim.addReagent('cinnabar_sulfur_ash', 'ground_crystal', 30);
      sim.addReagent('saffron_hearth_pollen', 'sliced_botanical', 30);
      sim.pumpBellows(3.0);
    }

    const appState = apprentice.getState();
    const gmState = grandmaster.getState();

    expect(appState.temperatureC).toBeGreaterThan(98);
    expect(gmState.temperatureC).toBeGreaterThan(98);
    expect(appState.boilOverPenalty).toBe(0);
    expect(gmState.boilOverPenalty).toBeGreaterThan(0);
    expect(appState.purity).toBeGreaterThan(gmState.purity);
  });

  it('runs CellarAutomationEngine across 3:4, 4:5, and 5:6 polyrhythms with bounded Beziers and zero duplicate edges', () => {
    const ratios: PolyrhythmRatio[] = ['3:4', '4:5', '5:6'];
    const engine = new CellarAutomationEngine();

    const retort = engine.addNode('boiling_retort', 0.12, 0.5, 'saffron_hearth_pollen');
    const siphon = engine.addNode('copper_siphon', 0.38, 0.5);
    const condenser = engine.addNode('graham_condenser', 0.72, 0.25);
    const alembic = engine.addNode('drip_alembic', 0.72, 0.75);
    const reserveRetort = engine.addNode('boiling_retort', 0.12, 0.85, 'cobalt_lotus_nectar');
    const reserveAlembic = engine.addNode('drip_alembic', 0.42, 0.85);

    const e1 = engine.connectNodes(retort.id, siphon.id, ratios[0]); // 3:4
    const e2 = engine.connectNodes(siphon.id, condenser.id, ratios[1]); // 4:5
    const e3 = engine.connectNodes(siphon.id, alembic.id, ratios[2]); // 5:6
    const e4 = engine.connectNodes(reserveRetort.id, reserveAlembic.id, ratios[0]); // 3:4

    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    expect(e3).not.toBeNull();
    expect(e4).not.toBeNull();

    // Duplicate and self-loop edges rejected cleanly
    expect(engine.connectNodes(retort.id, siphon.id, '5:6')).toBeNull();
    expect(engine.connectNodes(siphon.id, condenser.id, '3:4')).toBeNull();
    expect(engine.connectNodes(retort.id, retort.id, '3:4')).toBeNull();
    expect(engine.getGraph().edges).toHaveLength(4);

    // Check evalCubicBezier convex hull bounds across extreme control points
    const p0: [number, number] = [0.1, 0.2];
    const p1: [number, number] = [0.4, 0.9];
    const p2: [number, number] = [0.6, 0.1];
    const p3: [number, number] = [0.9, 0.8];
    expect(evalCubicBezier(p0, p1, p2, p3, -1)).toEqual(p0);
    expect(evalCubicBezier(p0, p1, p2, p3, 2)).toEqual(p3);
    expect(evalCubicBezier(p0, p1, p2, p3, Number.NaN)).toEqual(p0);
    for (let step = 0; step <= 40; step++) {
      const [bx, by] = evalCubicBezier(p0, p1, p2, p3, step / 40);
      expect(bx).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(bx).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(by).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(by).toBeLessThanOrEqual(0.9 + 1e-9);
    }

    // Deterministic equivalence: 2 bars via single tick vs 240 frames at 1/60s
    const shadowEngine = new CellarAutomationEngine(engine.getGraph());
    const bulkEvents = engine.tick(4.0);
    const frameEvents = [];
    for (let f = 0; f < 240; f++) {
      frameEvents.push(...shadowEngine.tick(1 / 60));
    }

    expect(bulkEvents).toEqual(frameEvents);
    expect(engine.getGraph()).toEqual(shadowEngine.getGraph());
    for (const evt of bulkEvents) {
      expect(DORIAN_LYDIAN_MIDI_NOTES).toContain(evt.midiNote);
    }

    const graph = engine.getGraph();
    expect(graph.quintessences.saffron_hearth_pollen).toBeGreaterThan(0);
    expect(graph.catalystSalts.saffron_hearth_pollen).toBeGreaterThan(0);
    expect(graph.catalystSalts.cobalt_lotus_nectar).toBeGreaterThan(0);
    expect(engine.tick(0)).toEqual([]);
    expect(engine.tick(-0.5)).toEqual([]);
  });
});

describe('3. Market Shock & Anti-Arbitrage Crucible', () => {
  it('guarantees zero raw buy/sell arbitrage across all 12 reagents, 5 regimes, and 25 regime transitions', () => {
    const festivalJsonPath = path.resolve(__dirname, '../../public/data/festivals.json');
    const festivalData = JSON.parse(fs.readFileSync(festivalJsonPath, 'utf8')) as {
      reagentElasticityModifiers: Partial<Record<ReagentId, number>>;
    };

    const snapshotsByRegime = new Map<MarketRegime, MarketSnapshot>();
    const minFestivalByRegime = new Map<MarketRegime, MarketSnapshot>();
    const liveFestivalByRegime = new Map<MarketRegime, MarketSnapshot>();

    const minMods = Object.fromEntries(CANONICAL_REAGENT_ORDER.map((id) => [id, 0.5])) as Record<
      ReagentId,
      number
    >;

    for (const regime of ALL_MARKET_REGIMES) {
      snapshotsByRegime.set(regime, computeMarketSnapshot(regime, 1));
      minFestivalByRegime.set(regime, computeMarketSnapshot(regime, 2, minMods));
      liveFestivalByRegime.set(
        regime,
        computeMarketSnapshot(regime, 3, festivalData.reagentElasticityModifiers)
      );
    }

    // Exhaustive check across all 12 reagents and all 5x5 = 25 regime transitions (A -> B)
    for (const id of CANONICAL_REAGENT_ORDER) {
      let minBuyAcrossAllRegimes = Infinity;
      let maxSellAcrossAllRegimes = -Infinity;

      for (const regime of ALL_MARKET_REGIMES) {
        const snap = snapshotsByRegime.get(regime)!;
        const minModSnap = minFestivalByRegime.get(regime)!;
        const liveSnap = liveFestivalByRegime.get(regime)!;

        for (const candidate of [snap, minModSnap, liveSnap]) {
          expect(candidate.reagentSellBackPrices[id]).toBeLessThanOrEqual(
            0.65 * candidate.reagentBuyPrices[id]
          );
          if (candidate.reagentBuyPrices[id] < minBuyAcrossAllRegimes) {
            minBuyAcrossAllRegimes = candidate.reagentBuyPrices[id];
          }
          if (candidate.reagentSellBackPrices[id] > maxSellAcrossAllRegimes) {
            maxSellAcrossAllRegimes = candidate.reagentSellBackPrices[id];
          }
        }
      }

      // Fundamental cross-regime no-hoarding invariant
      expect(maxSellAcrossAllRegimes).toBeLessThanOrEqual(minBuyAcrossAllRegimes);

      for (const regimeA of ALL_MARKET_REGIMES) {
        const buySnap = snapshotsByRegime.get(regimeA)!;
        for (const regimeB of ALL_MARKET_REGIMES) {
          const sellSnap = snapshotsByRegime.get(regimeB)!;
          const buyPrice = buySnap.reagentBuyPrices[id];
          const sellCheck = canSellBackRawReagent(id, 5, sellSnap);

          expect(sellCheck.netArbitrageCheck).toBeLessThanOrEqual(0);
          expect(sellSnap.reagentSellBackPrices[id]).toBeLessThanOrEqual(buyPrice);
          expect(sellCheck.revenueCrowns).toBeLessThanOrEqual(buyPrice * 5);
        }
      }
    }
  });

  it('converges BrassBalanceScale damped torque physics to balanced equilibrium across weight combinations', () => {
    const cases: Array<{ leftMass: number; weights: BrassWeightDenom[]; expectBalanced: boolean }> = [
      { leftMass: 86.5, weights: [50, 25, 10, 1, 0.5], expectBalanced: true },
      { leftMass: 16.0, weights: [10, 5, 1], expectBalanced: true },
      { leftMass: 25.2, weights: [25], expectBalanced: true }, // within 0.25 crown tolerance
      { leftMass: 0, weights: [], expectBalanced: true },
      { leftMass: 40, weights: [25, 10], expectBalanced: false },
      { leftMass: 10, weights: [25, 5], expectBalanced: false },
    ];

    for (const testCase of cases) {
      const scale = new BrassBalanceScale(testCase.leftMass);
      for (const denom of testCase.weights) {
        scale.addWeight(denom);
      }
      for (let i = 0; i < 150; i++) {
        scale.step(1 / 60);
      }

      const settled = scale.getState();
      expect(settled.settled).toBe(true);
      expect(settled.balanced).toBe(testCase.expectBalanced);
      expect(Number.isFinite(settled.tiltAngleRad)).toBe(true);
      expect(Number.isFinite(settled.angularVelRadS)).toBe(true);

      if (testCase.leftMass === settled.rightMassCrowns) {
        expect(Math.abs(settled.tiltAngleRad)).toBeLessThan(1e-3);
        expect(Math.abs(settled.angularVelRadS)).toBeLessThan(1e-3);
      }
    }
  });
});

describe('4. Shadow-Cookie Vault Crucible', () => {
  const originalIdb = globalThis.indexedDB;

  beforeEach(() => {
    localStorage.clear();
    clearCookieVault();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
    clearCookieVault();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIdb,
      configurable: true,
      writable: true,
    });
  });

  it('encodes heavily loaded 3-slot LedgerSaveStateV1 strictly <= 3900 bytes and rejects fuzzed cookies', () => {
    const state: LedgerSaveStateV1 = createDefaultLedgerState('2026-11-23');
    state.activeSlot = 2;

    const appTypes = [
      'boiling_retort',
      'graham_condenser',
      'copper_siphon',
      'drip_alembic',
    ] as const;
    const ratios: PolyrhythmRatio[] = ['3:4', '4:5', '5:6'];

    for (const slotId of [1, 2, 3] as HouseholdSlotId[]) {
      const slot = state.slots[slotId];
      slot.mode = slotId === 3 ? 'grandmaster' : 'apprentice';
      slot.day = 24 + slotId;
      slot.crowns = 1450.5 * slotId;
      slot.reputation = 95 * slotId;
      slot.regime = ALL_MARKET_REGIMES[(slotId + 1) % ALL_MARKET_REGIMES.length];
      slot.unlockedVessels = ['prism', 'teardrop', 'crescent', 'carafe'];

      for (const id of CANONICAL_REAGENT_ORDER) {
        slot.reagentStock[id] = 50 + REAGENT_CATALOG[id].index * 7;
        slot.cellarGraph.quintessences[id] = 12;
        slot.cellarGraph.catalystSalts[id] = 9;
      }

      for (let p = 0; p < 6; p++) {
        slot.shelfPotions.push(makeRichCraftedPotion(slotId, p, slot.day));
      }

      for (let n = 0; n < 6; n++) {
        slot.cellarGraph.nodes.push({
          id: `cellar-node-${n + 1}`,
          type: appTypes[n % appTypes.length],
          x: (n + 1) / 7,
          y: 0.25 + (n % 2) * 0.4,
          inputReagent: CANONICAL_REAGENT_ORDER[n],
          active: true,
          cyclePhase: 0.2,
        });
        if (n > 0) {
          slot.cellarGraph.edges.push({
            id: `cellar-edge-${n}`,
            fromNodeId: `cellar-node-${n}`,
            toNodeId: `cellar-node-${n + 1}`,
            ratio: ratios[n % ratios.length],
            dropletProgress: 0.4,
          });
        }
      }

      slot.completedCommissionIds.push(
        `comm-2026-w48-apprentice`,
        `comm-2026-w48-journeyman`,
        `comm-2026-w48-grandmaster`
      );
    }

    const digest = encodeCookieVaultDigest(state);
    const byteLen = new TextEncoder().encode(digest).length;
    expect(byteLen).toBeLessThanOrEqual(COOKIE_MAX_BYTES);
    expect(byteLen).toBeLessThan(4096);

    const decoded = decodeCookieVaultDigest(digest);
    expect(decoded).not.toBeNull();
    expect(decoded!.activeSlot).toBe(2);
    for (const slotId of [1, 2, 3] as HouseholdSlotId[]) {
      expect(decoded!.slots[slotId].crowns).toBe(1450.5 * slotId);
      expect(decoded!.slots[slotId].shelfPotions.length).toBeGreaterThan(0);
      expect(decoded!.slots[slotId].shelfPotions.length).toBeLessThanOrEqual(6);
      expect(decoded!.slots[slotId].cellarGraph.nodes.length).toBeGreaterThan(0);
    }

    // Corrupt cookie fuzzing must return null without throwing
    const parts = digest.split('.');
    const invalidUtf8B64 = Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url');
    const protoB64 = Buffer.from('{"v":1,"__proto__":{"polluted":true}}', 'utf8').toString('base64url');
    const badSchemaB64 = Buffer.from(
      JSON.stringify({ v: 1, active: 1, slots: [{ s: 99 }] }),
      'utf8'
    ).toString('base64url');

    const fuzzInputs = [
      '',
      'v1',
      'v1.deadbeef',
      `v2.${parts[1]}.${parts[2]}`,
      `v1.${computeCrc32Hex(invalidUtf8B64)}.${invalidUtf8B64}`,
      `v1.${computeCrc32Hex(protoB64)}.${protoB64}`,
      `v1.${computeCrc32Hex(badSchemaB64)}.${badSchemaB64}`,
      `v1.00000000.${parts[2]}`,
      `v1.${parts[1]}.${parts[2].slice(0, -4)}AAAA`,
      `v1.${parts[1]}.%%%notbase64%%%`,
      'x'.repeat(COOKIE_MAX_BYTES + 20),
    ];

    for (const fuzz of fuzzInputs) {
      expect(() => decodeCookieVaultDigest(fuzz)).not.toThrow();
      expect(decodeCookieVaultDigest(fuzz)).toBeNull();
    }
  });

  it('heals catastrophic localStorage + indexedDB deletion from cookie and regenerates deleted cookie', async () => {
    const idb = createMockIndexedDb();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: idb.factory,
      configurable: true,
      writable: true,
    });

    const vault = new VaultManager();
    const state = createDefaultLedgerState('2026-11-23');
    state.activeSlot = 2;
    state.slots[2].mode = 'grandmaster';
    state.slots[2].crowns = 712.5;
    state.slots[2].shelfPotions.push(makeRichCraftedPotion(2, 0, 5));
    state.slots[2].cellarGraph.nodes.push({
      id: 'cellar-node-1',
      type: 'graham_condenser',
      x: 0.5,
      y: 0.5,
      inputReagent: 'saffron_hearth_pollen',
      active: true,
      cyclePhase: 0,
    });

    await vault.save(state);
    expect(localStorage.getItem(PRIMARY_LS_KEY)).not.toBeNull();
    expect(idb.hasRecord()).toBe(true);
    expect(document.cookie).toContain(`${COOKIE_VAULT_NAME}=v1.`);

    // Catastrophic deletion of BOTH localStorage and indexedDB
    localStorage.clear();
    idb.clearAll();
    expect(localStorage.getItem(PRIMARY_LS_KEY)).toBeNull();
    expect(idb.hasRecord()).toBe(false);

    const healedBoot = await vault.boot('2026-11-23');
    expect(healedBoot.healedFrom).toBe('cookie');
    expect(healedBoot.state.activeSlot).toBe(2);
    expect(healedBoot.state.slots[2].crowns).toBe(712.5);
    expect(healedBoot.state.slots[2].shelfPotions).toHaveLength(1);
    expect(localStorage.getItem(PRIMARY_LS_KEY)).not.toBeNull();
    expect(idb.hasRecord()).toBe(true);

    // Delete krunked-cookie-vault-v1 -> auditAndHeal() regenerates it
    clearCookieVault();
    expect(document.cookie).not.toContain(`${COOKIE_VAULT_NAME}=`);
    const audit = await vault.auditAndHeal();
    expect(audit.healed).toBe(true);
    expect(audit.source).toBe('primary');
    expect(document.cookie).toContain(`${COOKIE_VAULT_NAME}=v1.`);

    // Delete krunked-cookie-vault-v1 -> save() regenerates it
    clearCookieVault();
    expect(document.cookie).not.toContain(`${COOKIE_VAULT_NAME}=`);
    const { cookieBytes } = await vault.save(healedBoot.state);
    expect(cookieBytes).toBeGreaterThan(20);
    expect(cookieBytes).toBeLessThanOrEqual(COOKIE_MAX_BYTES);
    expect(document.cookie).toContain(`${COOKIE_VAULT_NAME}=v1.`);
  });
});

describe('5. End-to-End Studio Commission & DOM Lifecycle Crucible', () => {
  const originalIdb = globalThis.indexedDB;

  beforeEach(() => {
    spyCanvasGetContext2dOnly();
    localStorage.clear();
    clearCookieVault();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
    clearCookieVault();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIdb,
      configurable: true,
      writable: true,
    });
  });

  it('satisfies festival commissions from public/data/festivals.json and boots/disposes ApothecaryStudioApp cleanly', async () => {
    const festivalJsonPath = path.resolve(__dirname, '../../public/data/festivals.json');
    const festival = JSON.parse(fs.readFileSync(festivalJsonPath, 'utf8')) as {
      commissions: FestivalCommissionSpec[];
    };

    // Brew a hearth_tonic meeting all 3 commission tiers in public/data/festivals.json
    const sim = new CauldronSimulator('grandmaster');
    sim.addReagent('amber_honey_resin', 'raw', 25);
    sim.addReagent('saffron_hearth_pollen', 'cellar_quintessence', 35);
    sim.addReagent('rose_madder_distillate', 'sliced_botanical', 30);
    sim.addReagent('starlight_aether_oil', 'pipette_drops', 20);
    sim.pumpBellows(2.0); // pushes peak temp cleanly above 70C without exceeding 98C
    sim.applyLadleStir(0.8, 1.0);

    const state = sim.getState();
    expect(state.temperatureC).toBeLessThanOrEqual(98);
    expect(state.boilOverPenalty).toBe(0);

    const crafted = sim.decantToPotion(
      'carafe',
      { color: 'gold', crest: 'phoenix', stamped: true },
      1
    );

    for (const commission of festival.commissions) {
      const result = evaluateCommission(crafted, commission);
      expect(result.satisfied).toBe(true);
      expect(result.bonusMultiplier).toBeGreaterThanOrEqual(1.0);
    }

    // Full DOM Studio boot, station cycling, and clean disposal
    const root = document.createElement('div');
    document.body.appendChild(root);
    const vault = new VaultManager({ useIdb: false });
    const boot = await vault.boot('2026-11-23');
    const app = new ApothecaryStudioApp(root, vault, boot.state);

    try {
      const stationTabs = root.querySelectorAll<HTMLButtonElement>('[data-testid^="station-tab-"]');
      expect(stationTabs.length).toBe(5);
      for (const tab of stationTabs) {
        tab.click();
      }
      expect(root.querySelector('[data-testid="reagent-jar-amber_honey_resin"]')).not.toBeNull();
    } finally {
      app.dispose();
    }
  });
});
