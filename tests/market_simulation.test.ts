import { describe, expect, it } from 'vitest';
import {
  ALL_MARKET_REGIMES,
  ALL_POTION_EFFECTS,
  CANONICAL_REAGENT_ORDER,
  REAGENT_BASE_COSTS,
  computeCellarHedgeYield,
  computeMarketSnapshot,
  pickDailyMarketRegime,
  type MarketPotionInput,
  type MarketRegime,
  type PotionEffectTag,
  type ReagentId,
} from '../simulation/market_shocks';
import {
  ALL_ENVOY_ARCHETYPES,
  ARCHETYPE_EYE_TELLS,
  ARCHETYPE_NAMES,
  ARCHETYPE_POSTURE_TELLS,
  BrassBalanceScale,
  ENVOY_ARCHETYPES,
  generateEnvoyForPotion,
} from '../simulation/npc_envoys';
import {
  applyEndOfDaySolvency,
  appraisePotionForMarket,
  canSellBackRawReagent,
  evaluateBargainProposal,
} from '../simulation/haggling_matrix';

function makeSamplePotion(overrides: Partial<MarketPotionInput> = {}): MarketPotionInput {
  return {
    vessel: 'prism',
    purity: 0.88,
    marblingIndex: 0.62,
    layerCrispness: 0.84,
    collectorBrilliance: 0.72,
    dominantEffect: 'fire_ward',
    baseValueCrowns: 34,
    layers: [
      { specificGravity: 1.55 },
      { specificGravity: 1.26 },
      { specificGravity: 0.96 },
    ],
    seal: { color: 'crimson', crest: 'phoenix', stamped: true },
    ...overrides,
  };
}

describe('Market Shocks & 5 Regime Multipliers', () => {
  it('reproduces canonical 12-reagent base buy costs and neutral demand under calm', () => {
    const snap = computeMarketSnapshot('calm', 1);
    expect(snap.regime).toBe('calm');
    expect(snap.day).toBe(1);
    expect(CANONICAL_REAGENT_ORDER).toHaveLength(12);

    for (const id of CANONICAL_REAGENT_ORDER) {
      expect(snap.reagentBuyPrices[id]).toBe(REAGENT_BASE_COSTS[id]);
      expect(snap.reagentSellBackPrices[id]).toBeLessThanOrEqual(
        Math.floor(0.65 * snap.reagentBuyPrices[id] * 2) / 2
      );
      expect(snap.reagentSellBackPrices[id]).toBeGreaterThan(0);
    }

    for (const effect of ALL_POTION_EFFECTS) {
      expect(snap.effectDemandMultipliers[effect]).toBe(1.0);
    }
  });

  it('applies exact demand & scarcity shocks across all 5 regimes', () => {
    const calm = computeMarketSnapshot('calm', 5);
    const siege = computeMarketSnapshot('dragon_siege', 5);
    const harvest = computeMarketSnapshot('bumper_harvest', 5);
    const glacial = computeMarketSnapshot('glacial_snap', 5);
    const starfall = computeMarketSnapshot('starfall_conclave', 5);

    // dragon_siege: +85% fire_ward & burn_salve demand, scarce cinnabar & bismuth
    expect(siege.effectDemandMultipliers.fire_ward).toBeCloseTo(1.85, 4);
    expect(siege.effectDemandMultipliers.burn_salve).toBeCloseTo(1.85, 4);
    expect(siege.reagentBuyPrices.cinnabar_sulfur_ash).toBeGreaterThan(
      calm.reagentBuyPrices.cinnabar_sulfur_ash * 1.4
    );
    expect(siege.reagentBuyPrices.bismuth_vitriol_salt).toBeGreaterThan(
      calm.reagentBuyPrices.bismuth_vitriol_salt * 1.4
    );

    // bumper_harvest: -40% botanical herb prices
    const botanicals: ReagentId[] = [
      'verdigris_moss_sap',
      'saffron_hearth_pollen',
      'cobalt_lotus_nectar',
      'moonveil_lichen_dew',
      'rose_madder_distillate',
    ];
    for (const herb of botanicals) {
      expect(harvest.reagentBuyPrices[herb]).toBeLessThanOrEqual(
        calm.reagentBuyPrices[herb] * 0.65
      );
      expect(harvest.reagentBuyPrices[herb]).toBeCloseTo(
        calm.reagentBuyPrices[herb] * 0.6,
        0
      );
    }
    expect(harvest.reagentBuyPrices.cinnabar_sulfur_ash).toBe(
      calm.reagentBuyPrices.cinnabar_sulfur_ash
    );

    // glacial_snap: +75% hearth_tonic demand
    expect(glacial.effectDemandMultipliers.hearth_tonic).toBeCloseTo(1.75, 4);

    // starfall_conclave: +110% galaxy_elixir collector demand
    expect(starfall.effectDemandMultipliers.galaxy_elixir).toBeCloseTo(2.1, 4);
    expect(starfall.reagentBuyPrices.auric_mica_suspension).toBeGreaterThan(
      calm.reagentBuyPrices.auric_mica_suspension
    );
    expect(starfall.reagentBuyPrices.starlight_aether_oil).toBeGreaterThan(
      calm.reagentBuyPrices.starlight_aether_oil
    );
  });

  it('handles festival modifiers cleanly and picks all 5 regimes deterministically across days', () => {
    const modded = computeMarketSnapshot('calm', 3, {
      cinnabar_sulfur_ash: 1.5,
      verdigris_moss_sap: 0.7,
      amber_honey_resin: Number.NaN,
    });
    expect(modded.reagentBuyPrices.cinnabar_sulfur_ash).toBe(21);
    expect(modded.reagentBuyPrices.verdigris_moss_sap).toBe(5);
    expect(modded.reagentBuyPrices.amber_honey_resin).toBe(8);

    const seen = new Set<MarketRegime>();
    for (let day = 1; day <= 60; day++) {
      const r1 = pickDailyMarketRegime('2026-11-23', day);
      const r2 = pickDailyMarketRegime('2026-11-23', day);
      expect(r1).toBe(r2);
      expect(ALL_MARKET_REGIMES).toContain(r1);
      seen.add(r1);
    }
    expect(seen.size).toBe(5);
  });

  it('prevents consecutive identical regimes across 30 days when prevRegime is passed', () => {
    const seeds = ['2026-11-23', 'household-slot-1', 'solstice-seed'];

    for (const seed of seeds) {
      let prevRegime: MarketRegime | undefined;
      const sequence: MarketRegime[] = [];

      for (let day = 1; day <= 30; day++) {
        const nextRegime = pickDailyMarketRegime(seed, day, prevRegime);
        expect(ALL_MARKET_REGIMES).toContain(nextRegime);
        if (prevRegime !== undefined) {
          expect(nextRegime).not.toBe(prevRegime);
        }
        sequence.push(nextRegime);
        prevRegime = nextRegime;
      }

      // Deterministic repeatability of the chained 30-day schedule
      let replayPrev: MarketRegime | undefined;
      for (let day = 1; day <= 30; day++) {
        const replayed = pickDailyMarketRegime(seed, day, replayPrev);
        expect(replayed).toBe(sequence[day - 1]);
        replayPrev = replayed;
      }

      // Verify stepping away when prevRegime directly matches the unguarded candidate
      for (let day = 1; day <= 10; day++) {
        const unguarded = pickDailyMarketRegime(seed, day);
        const stepped = pickDailyMarketRegime(seed, day, unguarded);
        expect(stepped).not.toBe(unguarded);
        expect(ALL_MARKET_REGIMES).toContain(stepped);
      }

      expect(new Set(sequence).size).toBe(5);
    }
  });

  it('computes cellar hedge yields exceeding raw liquidation and responsive to shocks', () => {
    const calmSnap = computeMarketSnapshot('calm', 1);
    expect(computeCellarHedgeYield('verdigris_moss_sap', 'calm', 0)).toBe(0);
    expect(computeCellarHedgeYield('verdigris_moss_sap', 'calm', -2)).toBe(0);

    const unitYield = computeCellarHedgeYield('verdigris_moss_sap', 'calm', 1);
    const tripleYield = computeCellarHedgeYield('verdigris_moss_sap', 'calm', 3);
    expect(unitYield).toBeGreaterThan(calmSnap.reagentSellBackPrices.verdigris_moss_sap);
    expect(tripleYield).toBeGreaterThan(unitYield * 2.5);

    const siegeSaffron = computeCellarHedgeYield('saffron_hearth_pollen', 'dragon_siege', 2);
    const calmSaffron = computeCellarHedgeYield('saffron_hearth_pollen', 'calm', 2);
    expect(siegeSaffron).toBeGreaterThan(calmSaffron);
  });
});

describe('Zero Raw Buy/Sell Arbitrage Invariant', () => {
  it('enforces sellBack <= 0.65 * buyPrice and zero profit across every cross-shock transition', () => {
    const modifierProfiles: Array<Partial<Record<ReagentId, number>> | undefined> = [
      undefined,
      Object.fromEntries(CANONICAL_REAGENT_ORDER.map((id) => [id, 0.5])),
      Object.fromEntries(CANONICAL_REAGENT_ORDER.map((id) => [id, 2.0])),
    ];

    const snapshots = ALL_MARKET_REGIMES.flatMap((regime) =>
      modifierProfiles.map((mods, idx) => computeMarketSnapshot(regime, idx + 1, mods))
    );

    for (const buySnap of snapshots) {
      for (const id of CANONICAL_REAGENT_ORDER) {
        // Same-turn invariant
        expect(buySnap.reagentSellBackPrices[id]).toBeLessThanOrEqual(
          Math.floor(0.65 * buySnap.reagentBuyPrices[id] * 2) / 2
        );
        expect(buySnap.reagentSellBackPrices[id]).toBeLessThanOrEqual(
          0.65 * buySnap.reagentBuyPrices[id]
        );

        const sameTurnCheck = canSellBackRawReagent(id, 4, buySnap);
        expect(sameTurnCheck.revenueCrowns).toBeGreaterThan(0);
        expect(sameTurnCheck.netArbitrageCheck).toBeLessThan(0);

        // Cross-shock invariant: buying in ANY regime/modifier and selling in ANY other
        for (const sellSnap of snapshots) {
          expect(sellSnap.reagentSellBackPrices[id]).toBeLessThan(buySnap.reagentBuyPrices[id]);
          const crossCheck = canSellBackRawReagent(id, 3, sellSnap);
          expect(crossCheck.netArbitrageCheck).toBeLessThanOrEqual(0);
          expect(crossCheck.revenueCrowns).toBeLessThan(buySnap.reagentBuyPrices[id] * 3);
        }
      }
    }
  });

  it('guards against tampered snapshot sellBackPrices in canSellBackRawReagent', () => {
    const snap = computeMarketSnapshot('calm', 1);
    const tampered = {
      ...snap,
      reagentSellBackPrices: {
        ...snap.reagentSellBackPrices,
        amber_honey_resin: 999,
      },
    };
    const res = canSellBackRawReagent('amber_honey_resin', 5, tampered);
    expect(res.netArbitrageCheck).toBeLessThanOrEqual(0);
    expect(res.revenueCrowns).toBeLessThan(snap.reagentBuyPrices.amber_honey_resin * 5);
    expect(canSellBackRawReagent('amber_honey_resin', 0, tampered)).toEqual({
      revenueCrowns: 0,
      netArbitrageCheck: 0,
    });
  });
});

describe('8 NPC Envoy Archetypes & Diegetic Tells', () => {
  it('defines all 8 archetypes with complete tells, effects, and elasticity/quality curves', () => {
    expect(ALL_ENVOY_ARCHETYPES).toHaveLength(8);
    const seenEffects = new Set<PotionEffectTag>();

    for (const id of ALL_ENVOY_ARCHETYPES) {
      const profile = ENVOY_ARCHETYPES[id];
      expect(profile.title.length).toBeGreaterThan(3);
      expect(profile.postureTell.length).toBeGreaterThan(10);
      expect(profile.eyeTell.length).toBeGreaterThan(10);
      expect(profile.preferredEffects.length).toBeGreaterThan(0);
      expect(profile.priceElasticity).toBeGreaterThan(0);
      expect(profile.priceElasticity).toBeLessThanOrEqual(1);
      expect(profile.qualitySensitivity).toBeGreaterThanOrEqual(0);
      expect(profile.qualitySensitivity).toBeLessThanOrEqual(1);
      for (const eff of profile.preferredEffects) {
        seenEffects.add(eff);
      }
    }

    expect(seenEffects.size).toBe(6);
  });

  it('generates deterministic offers for both null and crafted potions and spans all 8 archetypes', () => {
    const snap = computeMarketSnapshot('calm', 4);
    const potion = makeSamplePotion({ dominantEffect: 'galaxy_elixir' });

    const o1 = generateEnvoyForPotion(potion, snap, 'seed-alpha');
    const o2 = generateEnvoyForPotion(potion, snap, 'seed-alpha');
    expect(o1).toEqual(o2);
    expect(o1.patienceLeft).toBeGreaterThanOrEqual(1);
    expect(o1.patienceLeft).toBeLessThanOrEqual(4);
    expect(o1.maxWillingnessCrowns).toBeGreaterThan(o1.fairOfferCrowns);
    expect(o1.postureTell.length).toBeGreaterThan(10);
    expect(o1.eyeTell.length).toBeGreaterThan(10);
    expect(ARCHETYPE_POSTURE_TELLS[o1.archetype]).toContain(o1.postureTell);
    expect(ARCHETYPE_EYE_TELLS[o1.archetype]).toContain(o1.eyeTell);

    // Null-potion generation across seeds and regimes should reach all 8 archetypes
    const observed = new Set<string>();
    for (const regime of ALL_MARKET_REGIMES) {
      const rSnap = computeMarketSnapshot(regime, 2);
      for (let i = 0; i < 60; i++) {
        const offer = generateEnvoyForPotion(null, rSnap, `null-seed-${i}`);
        expect(offer.patienceLeft).toBeGreaterThanOrEqual(1);
        expect(offer.patienceLeft).toBeLessThanOrEqual(4);
        expect(offer.maxWillingnessCrowns).toBeGreaterThan(offer.fairOfferCrowns);
        observed.add(offer.archetype);
      }
    }
    expect(observed.size).toBe(8);
  });

  it('provides 64 unique envoy names and 32 posture + 32 eye tells across all 8 archetypes', () => {
    const allNames: string[] = [];
    const allPostureTells: string[] = [];
    const allEyeTells: string[] = [];

    for (const id of ALL_ENVOY_ARCHETYPES) {
      const names = ARCHETYPE_NAMES[id];
      const postureTells = ARCHETYPE_POSTURE_TELLS[id];
      const eyeTells = ARCHETYPE_EYE_TELLS[id];

      expect(names).toHaveLength(8);
      expect(postureTells).toHaveLength(4);
      expect(eyeTells).toHaveLength(4);
      expect(postureTells).toContain(ENVOY_ARCHETYPES[id].postureTell);
      expect(eyeTells).toContain(ENVOY_ARCHETYPES[id].eyeTell);

      allNames.push(...names);
      allPostureTells.push(...postureTells);
      allEyeTells.push(...eyeTells);
    }

    expect(allNames).toHaveLength(64);
    expect(new Set(allNames).size).toBe(64);
    expect(allPostureTells).toHaveLength(32);
    expect(new Set(allPostureTells).size).toBe(32);
    expect(allEyeTells).toHaveLength(32);
    expect(new Set(allEyeTells).size).toBe(32);
  });

  it('produces zero repeated envoy names inside any 12-visit window across 30 calls and varies tells', () => {
    const scenarios: Array<{
      label: string;
      potion: MarketPotionInput | null;
      snapshot: ReturnType<typeof computeMarketSnapshot>;
    }> = [
      {
        label: 'open-shopfront-calm',
        potion: null,
        snapshot: computeMarketSnapshot('calm', 4),
      },
      {
        label: 'constrained-fire-ward-siege',
        potion: makeSamplePotion({ dominantEffect: 'fire_ward' }),
        snapshot: computeMarketSnapshot('dragon_siege', 7),
      },
      {
        label: 'galaxy-elixir-starfall',
        potion: makeSamplePotion({ dominantEffect: 'galaxy_elixir' }),
        snapshot: computeMarketSnapshot('starfall_conclave', 11),
      },
    ];

    for (const scenario of scenarios) {
      const recentWindow: string[] = [];
      const allVisitedNames: string[] = [];
      const seenPostureTells = new Set<string>();
      const seenEyeTells = new Set<string>();

      for (let visit = 0; visit < 30; visit++) {
        const offer = generateEnvoyForPotion(
          scenario.potion,
          scenario.snapshot,
          `${scenario.label}::visit-${visit}`,
          recentWindow
        );

        expect(recentWindow).not.toContain(offer.name);
        expect(ARCHETYPE_POSTURE_TELLS[offer.archetype]).toContain(offer.postureTell);
        expect(ARCHETYPE_EYE_TELLS[offer.archetype]).toContain(offer.eyeTell);

        allVisitedNames.push(offer.name);
        seenPostureTells.add(offer.postureTell);
        seenEyeTells.add(offer.eyeTell);

        recentWindow.push(offer.name);
        if (recentWindow.length > 12) {
          recentWindow.shift();
        }
      }

      // Check every sliding window of up to 12 visits
      for (let start = 0; start < allVisitedNames.length; start++) {
        const windowSlice = allVisitedNames.slice(start, start + 12);
        expect(new Set(windowSlice).size).toBe(windowSlice.length);
      }

      expect(seenPostureTells.size).toBeGreaterThanOrEqual(4);
      expect(seenEyeTells.size).toBeGreaterThanOrEqual(4);
    }

    // Also verify all 4 posture & 4 eye tells of a single archetype vary by seedStr
    const siegeSnap = computeMarketSnapshot('dragon_siege', 1);
    const firePotion = makeSamplePotion({ dominantEffect: 'fire_ward' });
    const wardenPostures = new Set<string>();
    const wardenEyes = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const offer = generateEnvoyForPotion(firePotion, siegeSnap, `tell-var-${i}`);
      if (offer.archetype === 'singed_warden') {
        wardenPostures.add(offer.postureTell);
        wardenEyes.add(offer.eyeTell);
      }
    }
    expect(wardenPostures.size).toBe(4);
    expect(wardenEyes.size).toBe(4);
  });
});

describe('Damped Brass Balance Scale Physics', () => {
  it('converges to exact 0 rad equilibrium when counterweights match left potion mass', () => {
    const scale = new BrassBalanceScale(36.5);
    expect(scale.getState().settled).toBe(false);
    expect(scale.getState().balanced).toBe(false);

    scale.addWeight(25);
    scale.addWeight(10);
    scale.addWeight(1);
    const loaded = scale.addWeight(0.5);
    expect(loaded.rightMassCrowns).toBe(36.5);
    expect(loaded.weightsOnPan).toEqual([25, 10, 1, 0.5]);
    expect(loaded.balanced).toBe(true);
    expect(loaded.settled).toBe(false);

    for (let i = 0; i < 90; i++) {
      scale.step(1 / 60);
    }

    const settled = scale.getState();
    expect(settled.settled).toBe(true);
    expect(settled.balanced).toBe(true);
    expect(Math.abs(settled.tiltAngleRad)).toBeLessThan(1e-4);
    expect(Math.abs(settled.angularVelRadS)).toBeLessThan(1e-4);
  });

  it('settles at signed equilibrium tilts for heavy/light mismatches and resists extreme dt spikes', () => {
    const scale = new BrassBalanceScale(12);
    scale.addWeight(10); // +2 crowns left-heavy

    for (let i = 0; i < 120; i++) {
      scale.step(1 / 60);
    }
    const leftHeavy = scale.getState();
    expect(leftHeavy.settled).toBe(true);
    expect(leftHeavy.balanced).toBe(false);
    expect(leftHeavy.tiltAngleRad).toBeGreaterThan(0.02);
    expect(leftHeavy.tiltAngleRad).toBeLessThan(0.42);

    // Add 5 crowns -> now 3 crowns right-heavy
    scale.addWeight(5);
    for (let i = 0; i < 120; i++) {
      scale.step(1 / 60);
    }
    const rightHeavy = scale.getState();
    expect(rightHeavy.settled).toBe(true);
    expect(rightHeavy.tiltAngleRad).toBeLessThan(-0.02);

    // Out-of-bounds removal no-ops cleanly; valid removal + clearWeights rebalance
    const beforeRemove = scale.removeWeight(99);
    expect(beforeRemove.weightsOnPan).toEqual([10, 5]);
    scale.removeWeight(1);
    expect(scale.getState().weightsOnPan).toEqual([10]);
    scale.setLeftMass(0);
    scale.clearWeights();
    for (let i = 0; i < 90; i++) {
      scale.step(1 / 60);
    }
    expect(scale.getState().settled).toBe(true);
    expect(scale.getState().balanced).toBe(true);

    // Extreme dt clamping / NaN safety
    scale.setLeftMass(50);
    const spiked = scale.step(999);
    expect(Number.isFinite(spiked.tiltAngleRad)).toBe(true);
    expect(Number.isFinite(spiked.angularVelRadS)).toBe(true);
    const invalidDt = scale.step(Number.NaN);
    expect(Number.isFinite(invalidDt.tiltAngleRad)).toBe(true);
    expect(scale.step(-1).tiltAngleRad).toBe(invalidDt.tiltAngleRad);
  });
});

describe('Market Appraisal, Bargaining Curves & Solvency', () => {
  it('appraises potions higher under matching regime shocks and superior alchemy metrics', () => {
    const calm = computeMarketSnapshot('calm', 1);
    const starfall = computeMarketSnapshot('starfall_conclave', 1);

    const pristineGalaxy = makeSamplePotion({
      dominantEffect: 'galaxy_elixir',
      purity: 0.96,
      collectorBrilliance: 0.92,
      layerCrispness: 0.9,
    });
    const cloudyGalaxy = makeSamplePotion({
      dominantEffect: 'galaxy_elixir',
      purity: 0.25,
      collectorBrilliance: 0.1,
      layerCrispness: 0.2,
      seal: { color: 'indigo', crest: 'crescent', stamped: false },
    });

    const calmPristineVal = appraisePotionForMarket(pristineGalaxy, calm);
    const starfallPristineVal = appraisePotionForMarket(pristineGalaxy, starfall);
    const calmCloudyVal = appraisePotionForMarket(cloudyGalaxy, calm);

    expect(starfallPristineVal).toBeGreaterThan(calmPristineVal * 1.9);
    expect(calmPristineVal).toBeGreaterThan(calmCloudyVal);
  });

  it('executes full accepted / counter / walked bargaining curves without mutating input offer', () => {
    const snap = computeMarketSnapshot('dragon_siege', 3);
    const potion = makeSamplePotion({ dominantEffect: 'fire_ward' });
    const offer = generateEnvoyForPotion(potion, snap, 'warden-bargain');
    const originalSnapshot = { ...offer };

    // 1. Fair offer accepted immediately
    const accepted = evaluateBargainProposal(offer, potion, offer.fairOfferCrowns, snap);
    expect(accepted.outcome).toBe('accepted');
    expect(accepted.finalCrowns).toBe(offer.fairOfferCrowns);
    expect(offer).toEqual(originalSnapshot);

    // 2. High ask triggers counter-offer, then accepting the counter closes the deal
    const highAsk = offer.maxWillingnessCrowns;
    const countered = evaluateBargainProposal(offer, potion, highAsk, snap);
    if (countered.outcome === 'counter') {
      expect(countered.nextOffer.patienceLeft).toBeLessThan(offer.patienceLeft);
      expect(countered.nextOffer.fairOfferCrowns).toBeGreaterThanOrEqual(offer.fairOfferCrowns);
      expect(countered.finalCrowns).toBe(countered.nextOffer.fairOfferCrowns);

      const followUp = evaluateBargainProposal(
        countered.nextOffer,
        potion,
        countered.nextOffer.fairOfferCrowns,
        snap
      );
      expect(followUp.outcome).toBe('accepted');
      expect(followUp.finalCrowns).toBe(countered.nextOffer.fairOfferCrowns);
    } else {
      expect(countered.outcome).toBe('accepted');
    }

    // 3. Repeated stubborn over-asks exhaust patience and cause envoy to walk out
    let currOffer = offer;
    let walkedOut = false;
    for (let round = 0; round < 6; round++) {
      const res = evaluateBargainProposal(
        currOffer,
        potion,
        currOffer.maxWillingnessCrowns * 1.15,
        snap
      );
      if (res.outcome === 'walked') {
        expect(res.finalCrowns).toBe(0);
        expect(res.nextOffer.patienceLeft).toBe(0);
        walkedOut = true;
        break;
      }
      currOffer = res.nextOffer;
    }
    expect(walkedOut).toBe(true);

    // 4. Outrageous ask walks out immediately
    const insult = evaluateBargainProposal(
      offer,
      potion,
      offer.maxWillingnessCrowns * 3,
      snap
    );
    expect(insult.outcome).toBe('walked');
    expect(insult.finalCrowns).toBe(0);
    expect(insult.nextOffer.patienceLeft).toBe(0);

    // 5. Zero/empty counterweight prompts cleanly without draining patience
    const emptyPan = evaluateBargainProposal(offer, potion, 0, snap);
    expect(emptyPan.outcome).toBe('counter');
    expect(emptyPan.nextOffer.patienceLeft).toBe(offer.patienceLeft);

    // 6. Wrong potion effect reduces envoy willingness
    const wrongPotion = makeSamplePotion({ dominantEffect: 'soothing_draught' });
    const mismatchRes = evaluateBargainProposal(offer, wrongPotion, offer.fairOfferCrowns, snap);
    expect(['counter', 'walked']).toContain(mismatchRes.outcome);

    // 7. Urgent envoy (singed_warden) tolerates larger markup ratio than frugal iron_miner_factor
    const calmSnap = computeMarketSnapshot('calm', 1);
    const baseFirePotion = makeSamplePotion({ dominantEffect: 'fire_ward' });
    const baseNeutralPotion = makeSamplePotion({ dominantEffect: 'neutralizing_salve' });

    let wardenOffer = generateEnvoyForPotion(baseFirePotion, calmSnap, 'w-0');
    for (let i = 0; i < 30 && wardenOffer.archetype !== 'singed_warden'; i++) {
      wardenOffer = generateEnvoyForPotion(baseFirePotion, calmSnap, `w-${i}`);
    }
    let factorOffer = generateEnvoyForPotion(baseNeutralPotion, calmSnap, 'f-0');
    for (let i = 0; i < 30 && factorOffer.archetype !== 'iron_miner_factor'; i++) {
      factorOffer = generateEnvoyForPotion(baseNeutralPotion, calmSnap, `f-${i}`);
    }

    expect(wardenOffer.archetype).toBe('singed_warden');
    expect(factorOffer.archetype).toBe('iron_miner_factor');
    expect(wardenOffer.maxWillingnessCrowns / wardenOffer.fairOfferCrowns).toBeGreaterThan(
      factorOffer.maxWillingnessCrowns / factorOffer.fairOfferCrowns
    );
  });

  it('enforces grandmaster insolvency while keeping apprentice mode forgiving', () => {
    const snap = computeMarketSnapshot('glacial_snap', 6);
    const overhead = snap.overheadCoalParchmentCrowns;
    expect(overhead).toBeGreaterThan(8);

    // Solvent grandmaster
    const gmSolvent = applyEndOfDaySolvency(100, 'grandmaster', snap);
    expect(gmSolvent.insolvent).toBe(false);
    expect(gmSolvent.overheadPaid).toBe(overhead);
    expect(gmSolvent.nextCrowns).toBe(100 - overhead);

    // Insolvent grandmaster
    const gmBroke = applyEndOfDaySolvency(5, 'grandmaster', snap);
    expect(gmBroke.insolvent).toBe(true);
    expect(gmBroke.nextCrowns).toBe(0);
    expect(gmBroke.overheadPaid).toBe(5);

    // Forgiving apprentice (both solvent and low-crowns)
    const appSolvent = applyEndOfDaySolvency(100, 'apprentice', snap);
    expect(appSolvent.insolvent).toBe(false);
    expect(appSolvent.overheadPaid).toBeLessThan(overhead);
    expect(appSolvent.nextCrowns + appSolvent.overheadPaid).toBe(100);

    const appLow = applyEndOfDaySolvency(5, 'apprentice', snap);
    expect(appLow.insolvent).toBe(false);
    expect(appLow.nextCrowns).toBe(5);
    expect(appLow.overheadPaid).toBe(0);
  });
});
