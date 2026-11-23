import { describe, expect, it } from 'vitest';
import {
  CANONICAL_REAGENT_ORDER,
  CauldronSimulator,
  REAGENT_CATALOG,
  computeEffectiveShearCrit,
  evaluateCommission,
  getPhIndicatorRgb,
  type FestivalCommissionSpec,
  type ReagentId,
} from '../src/alchemy/index';
import * as ReagentsDirect from '../src/alchemy/reagents';
import {
  CellarAutomationEngine,
  DORIAN_LYDIAN_MIDI_NOTES,
  evalCubicBezier,
  type PolyrhythmRatio,
} from '../src/cellar/index';

describe('12 Canonical Reagents & Physical Properties', () => {
  it('exposes all 12 reagents in canonical order matching exact physical specs and direct re-exports', () => {
    expect(CANONICAL_REAGENT_ORDER).toEqual([
      'amber_honey_resin',
      'cinnabar_sulfur_ash',
      'bismuth_vitriol_salt',
      'glacial_alum_shard',
      'chalk_pearl_lime',
      'verdigris_moss_sap',
      'saffron_hearth_pollen',
      'cobalt_lotus_nectar',
      'moonveil_lichen_dew',
      'rose_madder_distillate',
      'auric_mica_suspension',
      'starlight_aether_oil',
    ]);

    expect(ReagentsDirect.CANONICAL_REAGENT_ORDER).toBe(CANONICAL_REAGENT_ORDER);
    expect(ReagentsDirect.REAGENT_CATALOG).toBe(REAGENT_CATALOG);
    expect(ReagentsDirect.CauldronSimulator).toBe(CauldronSimulator);
    expect(ReagentsDirect.evaluateCommission).toBe(evaluateCommission);
    expect(ReagentsDirect.getPhIndicatorRgb).toBe(getPhIndicatorRgb);
    expect(ReagentsDirect.computeEffectiveShearCrit).toBe(computeEffectiveShearCrit);

    const expected: Array<{
      id: ReagentId;
      index: number;
      category: string;
      rho: number;
      visc: number;
      ph: number;
      dh: number;
      hard: number;
      prep: string;
      cost: number;
    }> = [
      { id: 'amber_honey_resin', index: 0, category: 'resin', rho: 1.42, visc: 15.5, ph: -0.6, dh: 4, hard: 0.25, prep: 'raw', cost: 8 },
      { id: 'cinnabar_sulfur_ash', index: 1, category: 'mineral', rho: 1.55, visc: 4.2, ph: -1.8, dh: 28, hard: 0.72, prep: 'ground_crystal', cost: 14 },
      { id: 'bismuth_vitriol_salt', index: 2, category: 'crystal', rho: 1.48, visc: 3.0, ph: -2.4, dh: 16, hard: 0.88, prep: 'ground_crystal', cost: 12 },
      { id: 'glacial_alum_shard', index: 3, category: 'crystal', rho: 1.34, visc: 2.4, ph: 1.9, dh: -26, hard: 0.94, prep: 'ground_crystal', cost: 11 },
      { id: 'chalk_pearl_lime', index: 4, category: 'mineral', rho: 1.26, visc: 5.0, ph: 2.8, dh: -8, hard: 0.65, prep: 'ground_crystal', cost: 9 },
      { id: 'verdigris_moss_sap', index: 5, category: 'botanical', rho: 1.14, visc: 6.8, ph: -0.9, dh: -5, hard: 0.2, prep: 'sliced_botanical', cost: 7 },
      { id: 'saffron_hearth_pollen', index: 6, category: 'botanical', rho: 1.08, visc: 3.6, ph: 0.4, dh: 22, hard: 0.3, prep: 'sliced_botanical', cost: 10 },
      { id: 'cobalt_lotus_nectar', index: 7, category: 'botanical', rho: 1.02, visc: 4.4, ph: 1.1, dh: -12, hard: 0.18, prep: 'pipette_drops', cost: 11 },
      { id: 'moonveil_lichen_dew', index: 8, category: 'botanical', rho: 0.96, visc: 1.8, ph: -0.3, dh: -15, hard: 0.15, prep: 'pipette_drops', cost: 9 },
      { id: 'rose_madder_distillate', index: 9, category: 'botanical', rho: 0.92, visc: 2.1, ph: -1.4, dh: 6, hard: 0.22, prep: 'sliced_botanical', cost: 10 },
      { id: 'auric_mica_suspension', index: 10, category: 'mica', rho: 0.88, visc: 2.9, ph: 0.0, dh: 2, hard: 0.55, prep: 'pipette_drops', cost: 16 },
      { id: 'starlight_aether_oil', index: 11, category: 'oil', rho: 0.82, visc: 1.1, ph: 0.8, dh: -18, hard: 0.12, prep: 'pipette_drops', cost: 18 },
    ];

    expect(Object.keys(REAGENT_CATALOG)).toHaveLength(12);
    for (const row of expected) {
      const spec = REAGENT_CATALOG[row.id];
      expect(spec.index).toBe(row.index);
      expect(spec.category).toBe(row.category);
      expect(spec.specificGravity).toBeCloseTo(row.rho, 6);
      expect(spec.baseViscosity).toBeCloseTo(row.visc, 6);
      expect(spec.phShift).toBeCloseTo(row.ph, 6);
      expect(spec.enthalpyDeltaC).toBe(row.dh);
      expect(spec.hardness).toBeCloseTo(row.hard, 6);
      expect(spec.preferredPrep).toBe(row.prep);
      expect(spec.baseCostCrowns).toBe(row.cost);
      expect(spec.tags.length).toBeGreaterThan(0);
    }
  });
});

describe('CauldronSimulator Thermodynamics, Gravity Sorting & Shear Physics', () => {
  it('sorts density layers bottom-to-top by specificGravity and conserves volume exactly', () => {
    const sim = new CauldronSimulator('apprentice');

    // Add lightest to heaviest + an out-of-order middle layer + duplicate pour
    sim.addReagent('starlight_aether_oil', 'pipette_drops', 15);
    sim.addReagent('amber_honey_resin', 'raw', 30);
    sim.addReagent('cinnabar_sulfur_ash', 'ground_crystal', 20);
    sim.addReagent('verdigris_moss_sap', 'sliced_botanical', 25);
    sim.addReagent('amber_honey_resin', 'raw', 10);
    sim.addReagent('cinnabar_sulfur_ash', 'ground_crystal', 0); // ignored non-positive

    const state = sim.getState();
    expect(state.totalVolumeMl).toBeCloseTo(100, 6);
    const layerVolSum = state.layers.reduce((acc, l) => acc + l.volumeMl, 0);
    expect(layerVolSum).toBeCloseTo(state.totalVolumeMl, 6);

    expect(state.layers.map((l) => l.reagentId)).toEqual([
      'cinnabar_sulfur_ash',  // 1.55 (bottom)
      'amber_honey_resin',    // 1.42
      'verdigris_moss_sap',   // 1.14
      'starlight_aether_oil', // 0.82 (top)
    ]);

    for (let i = 0; i < state.layers.length - 1; i++) {
      expect(state.layers[i].specificGravity).toBeGreaterThan(
        state.layers[i + 1].specificGravity
      );
    }
  });

  it('produces smooth anthocyanin pH indicator shifts across acid, neutral, and alkali ranges', () => {
    const acid = getPhIndicatorRgb(1.5);
    const midAcid = getPhIndicatorRgb(3.5);
    const neutral = getPhIndicatorRgb(7.0);
    const emerald = getPhIndicatorRgb(10.0);
    const amber = getPhIndicatorRgb(12.5);

    // Acid is crimson-dominant
    expect(acid[0]).toBeGreaterThan(0.75);
    expect(acid[0]).toBeGreaterThan(acid[1] * 3);

    // Neutral 7.0 is violet (blue > red > green)
    expect(neutral[2]).toBeGreaterThan(neutral[0]);
    expect(neutral[0]).toBeGreaterThan(neutral[1]);

    // Moderate alkali shifts emerald (green dominant)
    expect(emerald[1]).toBeGreaterThan(emerald[0]);
    expect(emerald[1]).toBeGreaterThan(emerald[2]);

    // Strong alkali shifts amber (warm red+green, low blue)
    expect(amber[0]).toBeGreaterThan(0.75);
    expect(amber[1]).toBeGreaterThan(0.5);
    expect(amber[2]).toBeLessThan(0.3);

    // Monotonic clamping and NaN guard
    expect(getPhIndicatorRgb(-5)).toEqual(acid);
    expect(getPhIndicatorRgb(20)).toEqual(amber);
    expect(getPhIndicatorRgb(Number.NaN)).toEqual(neutral);
    expect(midAcid.every((c) => c >= 0 && c <= 1)).toBe(true);

    // Chemical pH integration in cauldron
    const sim = new CauldronSimulator('apprentice');
    const acidicState = sim.addReagent('bismuth_vitriol_salt', 'ground_crystal', 50);
    expect(acidicState.ph).toBeLessThan(4.0);
    expect(acidicState.phIndicatorRgb[0]).toBeGreaterThan(acidicState.phIndicatorRgb[1]);

    const neutralizedState = sim.addReagent('chalk_pearl_lime', 'ground_crystal', 50);
    expect(neutralizedState.ph).toBeGreaterThan(acidicState.ph);
  });

  it('models exothermic heating, endothermic cooling, bellows impulse, and Newton cooling', () => {
    const sim = new CauldronSimulator('apprentice');
    sim.reset(22);

    const heated = sim.addReagent('cinnabar_sulfur_ash', 'ground_crystal', 25);
    expect(heated.temperatureC).toBeCloseTo(50, 2);

    const quenched = sim.addReagent('glacial_alum_shard', 'ground_crystal', 25);
    expect(quenched.temperatureC).toBeLessThan(heated.temperatureC);
    expect(quenched.temperatureC).toBeLessThan(30);

    const bellows = sim.pumpBellows(2.0);
    expect(bellows.temperatureC).toBeGreaterThan(quenched.temperatureC + 20);

    const cooled = sim.stepCooling(20);
    expect(cooled.temperatureC).toBeLessThan(bellows.temperatureC);
    expect(cooled.temperatureC).toBeGreaterThanOrEqual(22);
  });

  it('separates gentle crisp-horizon stirring from supercritical Suminagashi marbling', () => {
    const coldThickCrit = computeEffectiveShearCrit(15.5, 22);
    const hotThinCrit = computeEffectiveShearCrit(2.0, 95);
    expect(coldThickCrit).toBeGreaterThan(hotThinCrit);
    expect(computeEffectiveShearCrit(Number.NaN, Number.NaN)).toBeGreaterThan(0);

    // Gentle stir below shearCrit keeps horizons crisp
    const gentleSim = new CauldronSimulator('grandmaster');
    gentleSim.addReagent('amber_honey_resin', 'raw', 40);
    gentleSim.addReagent('starlight_aether_oil', 'pipette_drops', 20);
    const preStir = gentleSim.getState();
    const afterGentle = gentleSim.applyLadleStir(preStir.shearCritRadS * 0.5, 3.0);

    expect(afterGentle.layerCrispness).toBeGreaterThan(0.85);
    expect(afterGentle.marblingIndex).toBeLessThan(0.1);

    // High-shear stir well above shearCrit folds Suminagashi marbling
    const vigorousSim = new CauldronSimulator('grandmaster');
    vigorousSim.addReagent('amber_honey_resin', 'raw', 40);
    vigorousSim.addReagent('starlight_aether_oil', 'pipette_drops', 20);
    const afterHighShear = vigorousSim.applyLadleStir(preStir.shearCritRadS * 3.0, 3.0);

    expect(afterHighShear.marblingIndex).toBeGreaterThan(0.5);
    expect(afterHighShear.layerCrispness).toBeLessThan(afterGentle.layerCrispness - 0.3);

    // dt = 0 edge guard
    const zeroDt = vigorousSim.applyLadleStir(40, 0);
    expect(Number.isNaN(zeroDt.marblingIndex)).toBe(false);
    expect(Number.isNaN(zeroDt.layerCrispness)).toBe(false);
  });

  it('applies harsh boil-over penalty > 98C in grandmaster while remaining forgiving in apprentice', () => {
    const apprentice = new CauldronSimulator('apprentice');
    const grandmaster = new CauldronSimulator('grandmaster');

    for (const sim of [apprentice, grandmaster]) {
      sim.addReagent('cinnabar_sulfur_ash', 'ground_crystal', 25);
      sim.addReagent('saffron_hearth_pollen', 'sliced_botanical', 25);
      sim.pumpBellows(2.5); // drives temperature well above 98C
    }

    const appState = apprentice.getState();
    const gmState = grandmaster.getState();

    expect(appState.temperatureC).toBeGreaterThan(98);
    expect(gmState.temperatureC).toBeGreaterThan(98);

    expect(appState.boilOverPenalty).toBe(0);
    expect(gmState.boilOverPenalty).toBeGreaterThan(0.2);
    expect(appState.purity).toBeGreaterThan(gmState.purity + 0.15);
    expect(appState.layerCrispness).toBeGreaterThan(gmState.layerCrispness);

    // Mode switch respects updated mode
    apprentice.setMode('grandmaster');
    const afterSwitch = apprentice.pumpBellows(0.5);
    expect(afterSwitch.boilOverPenalty).toBeGreaterThan(0);

    // Prep form quality rewards refined cellar forms and preferred prep over raw crystals
    const rawCrystalSim = new CauldronSimulator('grandmaster');
    const rawState = rawCrystalSim.addReagent('bismuth_vitriol_salt', 'raw', 25);
    const groundCrystalSim = new CauldronSimulator('grandmaster');
    const groundState = groundCrystalSim.addReagent('bismuth_vitriol_salt', 'ground_crystal', 25);
    const quintessenceSim = new CauldronSimulator('grandmaster');
    const quintState = quintessenceSim.addReagent('bismuth_vitriol_salt', 'cellar_quintessence', 25);

    expect(quintState.purity).toBeGreaterThanOrEqual(groundState.purity);
    expect(groundState.purity).toBeGreaterThan(rawState.purity);
  });

  it('decants isolated potions and evaluates festival commissions accurately', () => {
    const sim = new CauldronSimulator('grandmaster');
    sim.addReagent('cobalt_lotus_nectar', 'pipette_drops', 25);
    sim.addReagent('auric_mica_suspension', 'pipette_drops', 25);
    sim.addReagent('starlight_aether_oil', 'cellar_quintessence', 25);

    const potion = sim.decantToPotion(
      'crescent',
      { color: 'gold', crest: 'crescent', stamped: true },
      4,
      'test-galaxy-1'
    );

    // Resetting cauldron must not mutate already-decanted potion layers
    sim.reset();
    expect(potion.id).toBe('test-galaxy-1');
    expect(potion.layers).toHaveLength(3);
    expect(potion.dominantEffect).toBe('galaxy_elixir');
    expect(potion.baseValueCrowns).toBeGreaterThan(0);

    const commission: FestivalCommissionSpec = {
      id: 'comm-starfall-1',
      tier: 'grandmaster',
      title: 'Starfall Conclave Draft',
      description: 'Three crisp strata of celestial elixirs.',
      requiredEffect: 'galaxy_elixir',
      minLayers: 3,
      minLayerCrispness: 0.85,
      minPurity: 0.9,
      targetPh: [6.0, 9.5],
      rewardCrowns: 120,
    };

    const passResult = evaluateCommission(potion, commission);
    expect(passResult.satisfied).toBe(true);
    expect(passResult.bonusMultiplier).toBeGreaterThanOrEqual(1.0);

    const failCommission: FestivalCommissionSpec = {
      ...commission,
      requiredEffect: 'fire_ward',
      minPeakTempC: 90,
    };
    const failResult = evaluateCommission(potion, failCommission);
    expect(failResult.satisfied).toBe(false);
    expect(failResult.bonusMultiplier).toBe(0);
    expect(failResult.reason).toContain('Effect mismatch');
    expect(failResult.reason).toContain('Peak temperature');
  });
});

describe('Kinetic Cellar Bezier Curves & Polyrhythmic Distillation', () => {
  it('evaluates cubic Beziers with exact endpoints, clamping, and convex hull bounds', () => {
    const p0: [number, number] = [0.1, 0.2];
    const p1: [number, number] = [0.3, 0.9];
    const p2: [number, number] = [0.7, 0.1];
    const p3: [number, number] = [0.9, 0.8];

    expect(evalCubicBezier(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(evalCubicBezier(p0, p1, p2, p3, 1)).toEqual(p3);
    expect(evalCubicBezier(p0, p1, p2, p3, -0.5)).toEqual(p0);
    expect(evalCubicBezier(p0, p1, p2, p3, 1.8)).toEqual(p3);

    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const [x, y] = evalCubicBezier(p0, p1, p2, p3, t);
      expect(x).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(x).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(y).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });

  it('prevents self-loops & duplicate edges and cleans up connected edges on removeNode', () => {
    const engine = new CellarAutomationEngine();
    const n1 = engine.addNode('boiling_retort', 0.2, 0.5, 'verdigris_moss_sap');
    const n2 = engine.addNode('graham_condenser', 0.6, 0.5);

    expect(engine.connectNodes(n1.id, n1.id, '3:4')).toBeNull();
    expect(engine.connectNodes(n1.id, 'missing-node', '3:4')).toBeNull();

    const edge = engine.connectNodes(n1.id, n2.id, '4:5');
    expect(edge).not.toBeNull();
    expect(engine.connectNodes(n1.id, n2.id, '5:6')).toBeNull();

    engine.setNodeReagent(n1.id, 'moonveil_lichen_dew');
    expect(engine.getGraph().nodes[0].inputReagent).toBe('moonveil_lichen_dew');

    engine.removeNode(n1.id);
    expect(engine.getGraph().nodes).toHaveLength(1);
    expect(engine.getGraph().edges).toHaveLength(0);
  });

  it('runs deterministic 3:4, 4:5, and 5:6 polyrhythms producing quintessences and catalyst salts', () => {
    const ratios: PolyrhythmRatio[] = ['3:4', '4:5', '5:6'];
    const eventCounts: number[] = [];
    const productionCounts: number[] = [];

    for (const ratio of ratios) {
      const engA = new CellarAutomationEngine();
      const retort = engA.addNode('boiling_retort', 0.1, 0.5, 'saffron_hearth_pollen');
      const siphon = engA.addNode('copper_siphon', 0.4, 0.5);
      const condenser = engA.addNode('graham_condenser', 0.7, 0.3);
      const alembic = engA.addNode('drip_alembic', 0.7, 0.7);

      engA.connectNodes(retort.id, siphon.id, ratio);
      engA.connectNodes(siphon.id, condenser.id, ratio);
      engA.connectNodes(siphon.id, alembic.id, ratio);

      // Identical second engine ticked at 60fps (1/60s) must yield identical outputs
      const engB = new CellarAutomationEngine(engA.getGraph());

      const eventsA = engA.tick(2.0); // 1 full bar
      const eventsB = [];
      for (let i = 0; i < 120; i++) {
        eventsB.push(...engB.tick(1 / 60));
      }

      expect(eventsA).toEqual(eventsB);
      expect(engA.getGraph()).toEqual(engB.getGraph());

      for (const evt of eventsA) {
        expect(evt.type).toBe('cellar_drip');
        expect(evt.ratio).toBe(ratio);
        expect(DORIAN_LYDIAN_MIDI_NOTES).toContain(evt.midiNote);
      }

      const graph = engA.getGraph();
      const qUnits = graph.quintessences.saffron_hearth_pollen ?? 0;
      const sUnits = graph.catalystSalts.saffron_hearth_pollen ?? 0;
      expect(qUnits).toBeGreaterThan(0);
      expect(sUnits).toBeGreaterThan(0);
      expect(qUnits).toBe(sUnits);

      eventCounts.push(eventsA.length);
      productionCounts.push(qUnits);

      // Consume refined goods cleanly
      expect(engA.consumeRefined('cellar_quintessence', 'saffron_hearth_pollen')).toBe(true);
      expect(engA.consumeRefined('catalyst_salt', 'saffron_hearth_pollen')).toBe(true);
      expect(engA.getGraph().quintessences.saffron_hearth_pollen).toBe(qUnits - 1);
      expect(engA.getGraph().catalystSalts.saffron_hearth_pollen).toBe(sUnits - 1);
    }

    // Polyrhythm density strictly increases across 3:4 -> 4:5 -> 5:6
    expect(eventCounts[0]).toBeLessThan(eventCounts[1]);
    expect(eventCounts[1]).toBeLessThan(eventCounts[2]);
    expect(productionCounts).toEqual([4, 5, 6]);
  });

  it('respects consumeBotanical stock gating and handles zero/negative dt safely', () => {
    const engine = new CellarAutomationEngine();
    const retort = engine.addNode('boiling_retort', 0.1, 0.5, 'verdigris_moss_sap');
    const condenser = engine.addNode('graham_condenser', 0.8, 0.5);
    engine.connectNodes(retort.id, condenser.id, '3:4');

    expect(engine.tick(0)).toEqual([]);
    expect(engine.tick(-1)).toEqual([]);

    let stock = 2;
    const events = engine.tick(2.0, () => {
      if (stock <= 0) return false;
      stock -= 1;
      return true;
    });

    const produced = events.filter((e) => e.producedItem !== undefined);
    expect(produced).toHaveLength(2);
    expect(engine.getGraph().quintessences.verdigris_moss_sap).toBe(2);
    expect(engine.consumeRefined('cellar_quintessence', 'verdigris_moss_sap')).toBe(true);
    expect(engine.consumeRefined('cellar_quintessence', 'verdigris_moss_sap')).toBe(true);
    expect(engine.consumeRefined('cellar_quintessence', 'verdigris_moss_sap')).toBe(false);
  });
});
