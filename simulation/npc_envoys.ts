import {
  ALL_POTION_EFFECTS,
  clamp01,
  estimatePotionMarketValue,
  hashSeedToUint32,
  roundHalfCrown,
  type BrassScaleState,
  type BrassWeightDenom,
  type EnvoyArchetypeId,
  type EnvoyOffer,
  type MarketPotionInput,
  type MarketRegime,
  type MarketSnapshot,
  type PotionEffectTag,
  type PotionVessel,
} from './market_shocks';

export type {
  BrassScaleState,
  BrassWeightDenom,
  EnvoyArchetypeId,
  EnvoyOffer,
  MarketPotionInput,
  MarketRegime,
  MarketSnapshot,
  PotionEffectTag,
  PotionVessel,
};

export interface EnvoyArchetypeProfile {
  title: string;
  postureTell: string;
  eyeTell: string;
  preferredEffects: PotionEffectTag[];
  priceElasticity: number;
  qualitySensitivity: number;
}

export const ALL_ENVOY_ARCHETYPES: readonly EnvoyArchetypeId[] = [
  'singed_warden',
  'guild_loupe_connoisseur',
  'rain_soaked_herbalist',
  'frostbitten_courier',
  'starfall_astronomer',
  'iron_miner_factor',
  'court_chirurgeon',
  'wandering_bard_peddler',
] as const;

export const ENVOY_ARCHETYPES: Record<EnvoyArchetypeId, EnvoyArchetypeProfile> = {
  singed_warden: {
    title: 'Singed Citadel Warden',
    postureTell: 'Favors a blistered gauntlet and shifts weight away from the hearth.',
    eyeTell: 'Pupils dart urgently toward crimson ward vials whenever embers crackle.',
    preferredEffects: ['fire_ward', 'burn_salve'],
    priceElasticity: 0.22,
    qualitySensitivity: 0.35,
  },
  guild_loupe_connoisseur: {
    title: 'Guild Loupe Connoisseur',
    postureTell: 'Leans forward with a brass jeweler loupe poised a hair from the glass.',
    eyeTell: 'Squints critically at density horizons and refracted mica shimmer.',
    preferredEffects: ['galaxy_elixir', 'neutralizing_salve'],
    priceElasticity: 0.55,
    qualitySensitivity: 0.95,
  },
  rain_soaked_herbalist: {
    title: 'Rain-Soaked Moorland Herbalist',
    postureTell: 'Shakes rainwater from oilskin cuffs and tucks mossy satchels tight.',
    eyeTell: 'Glances warmly at emerald and amber botanical infusions.',
    preferredEffects: ['soothing_draught', 'burn_salve'],
    priceElasticity: 0.78,
    qualitySensitivity: 0.48,
  },
  frostbitten_courier: {
    title: 'Frostbitten Pass Courier',
    postureTell: 'Hugs trembling shoulders and stamps snowmelt from spurred boots.',
    eyeTell: 'Fixes unblinking eyes on golden warming tonics near the bellows.',
    preferredEffects: ['hearth_tonic', 'soothing_draught'],
    priceElasticity: 0.28,
    qualitySensitivity: 0.3,
  },
  starfall_astronomer: {
    title: 'Starfall Observatory Astronomer',
    postureTell: 'Cradles an astrolabe case under one velvet sleeve with poised stillness.',
    eyeTell: 'Tracks swirling auric flecks and violet strata as though charting comets.',
    preferredEffects: ['galaxy_elixir', 'hearth_tonic'],
    priceElasticity: 0.36,
    qualitySensitivity: 0.88,
  },
  iron_miner_factor: {
    title: 'Iron-Vein Miner Factor',
    postureTell: 'Crosses soot-stained forearms and plants boots wide by the counter.',
    eyeTell: 'Weighs every brass gram on the scale pan before meeting your gaze.',
    preferredEffects: ['neutralizing_salve', 'fire_ward'],
    priceElasticity: 0.85,
    qualitySensitivity: 0.4,
  },
  court_chirurgeon: {
    title: 'Royal Court Chirurgeon',
    postureTell: 'Stands rigid with a silver lancet case and spotless linen cuffs.',
    eyeTell: 'Checks wax seal crest and sediment clarity with clinical precision.',
    preferredEffects: ['burn_salve', 'neutralizing_salve', 'soothing_draught'],
    priceElasticity: 0.42,
    qualitySensitivity: 0.82,
  },
  wandering_bard_peddler: {
    title: 'Wandering Bard-Peddler',
    postureTell: 'Taps a lute-strap rhythm on the walnut ledge and tilts his feathered hat.',
    eyeTell: 'Winks at ornate prism vessels while gauging your reaction to his opening bid.',
    preferredEffects: ['soothing_draught', 'galaxy_elixir', 'hearth_tonic'],
    priceElasticity: 0.7,
    qualitySensitivity: 0.58,
  },
};

const ARCHETYPE_NAMES: Record<EnvoyArchetypeId, readonly string[]> = {
  singed_warden: ['Captain Torsten Ashwatch', 'Warden Ingrid Cinderpike', 'Sergeant Bram Emberguard'],
  guild_loupe_connoisseur: ['Magister Aurelia Vance', 'Assayer Corvus Glass', 'Syndic Helena Prismont'],
  rain_soaked_herbalist: ['Maren Bogwillow', 'Rowan Fenmoss', 'Alder Raincloak'],
  frostbitten_courier: ['Courier Astrid Rimefoot', 'Rider Lukas Frostpass', 'Kaelen Snowspur'],
  starfall_astronomer: ['Astronomer Soren Vane', 'Magister Lyra Comethale', 'Thales Observatory-Fellow'],
  iron_miner_factor: ['Factor Goran Slaghammer', 'Foreman Hjalmar Veinpick', 'Orin Deepseam'],
  court_chirurgeon: ['Chirurgeon Evelyn Hart', 'Doctor Cassian Bloodroot', 'Physician Clara Balm'],
  wandering_bard_peddler: ['Fiddler Julian Lark', 'Minstrel Sylvie Rosewood', 'Bastian Six-Strings'],
};

const REGIME_ARCHETYPE_WEIGHTS: Record<MarketRegime, Partial<Record<EnvoyArchetypeId, number>>> = {
  calm: {},
  dragon_siege: {
    singed_warden: 4,
    court_chirurgeon: 2,
    iron_miner_factor: 2,
  },
  bumper_harvest: {
    rain_soaked_herbalist: 4,
    wandering_bard_peddler: 2,
    court_chirurgeon: 2,
  },
  glacial_snap: {
    frostbitten_courier: 4,
    wandering_bard_peddler: 2,
    singed_warden: 2,
  },
  starfall_conclave: {
    starfall_astronomer: 4,
    guild_loupe_connoisseur: 3,
    wandering_bard_peddler: 2,
  },
};

const ALL_VESSELS: readonly PotionVessel[] = ['prism', 'teardrop', 'crescent', 'carafe'] as const;

function pickWeightedArchetype(
  candidates: readonly EnvoyArchetypeId[],
  regime: MarketRegime,
  hash: number
): EnvoyArchetypeId {
  const regimeWeights = REGIME_ARCHETYPE_WEIGHTS[regime] ?? {};
  const expanded: EnvoyArchetypeId[] = [];
  for (const id of candidates) {
    const weight = regimeWeights[id] ?? 1;
    for (let i = 0; i < weight; i++) {
      expanded.push(id);
    }
  }
  const pool = expanded.length > 0 ? expanded : candidates;
  return pool[hash % pool.length];
}

export function generateEnvoyForPotion(
  potion: MarketPotionInput | null,
  snapshot: MarketSnapshot,
  seedStr: string
): EnvoyOffer {
  const safeSeed = typeof seedStr === 'string' ? seedStr : 'default';
  const baseHash = hashSeedToUint32(
    `${safeSeed}::${snapshot.regime}::${snapshot.day}::${potion?.dominantEffect ?? 'open'}`
  );
  const subHash1 = hashSeedToUint32(`${safeSeed}::vessel::${baseHash}`);
  const subHash2 = hashSeedToUint32(`${safeSeed}::name::${baseHash}`);
  const subHash3 = hashSeedToUint32(`${safeSeed}::patience::${baseHash}`);

  let candidates: EnvoyArchetypeId[];
  if (potion) {
    const matching = ALL_ENVOY_ARCHETYPES.filter((id) =>
      ENVOY_ARCHETYPES[id].preferredEffects.includes(potion.dominantEffect)
    );
    candidates = matching.length > 0 ? matching : [...ALL_ENVOY_ARCHETYPES];
  } else {
    candidates = [...ALL_ENVOY_ARCHETYPES];
  }

  const archetype = pickWeightedArchetype(candidates, snapshot.regime, baseHash);
  const profile = ENVOY_ARCHETYPES[archetype];
  const names = ARCHETYPE_NAMES[archetype];
  const name = names[subHash2 % names.length];

  const requestedEffect: PotionEffectTag =
    potion && profile.preferredEffects.includes(potion.dominantEffect)
      ? potion.dominantEffect
      : profile.preferredEffects[subHash1 % profile.preferredEffects.length] ??
        ALL_POTION_EFFECTS[subHash1 % ALL_POTION_EFFECTS.length];

  const desiredVessel: PotionVessel | undefined = potion
    ? subHash1 % 3 === 0
      ? ALL_VESSELS[(subHash1 >>> 2) % ALL_VESSELS.length]
      : potion.vessel
    : subHash1 % 2 === 0
      ? ALL_VESSELS[(subHash1 >>> 2) % ALL_VESSELS.length]
      : undefined;

  let baseAppraised: number;
  let qualityAlignment = 1.0;
  let vesselBonus = 1.0;

  if (potion) {
    baseAppraised = estimatePotionMarketValue(potion, snapshot);
    const purity = clamp01(potion.purity);
    const craft = Math.max(clamp01(potion.layerCrispness), clamp01(potion.marblingIndex));
    const brilliance = clamp01(potion.collectorBrilliance);
    const qualityComposite = 0.5 * purity + 0.25 * craft + 0.25 * brilliance;
    qualityAlignment = Math.max(
      0.72,
      Math.min(1.28, 1 + profile.qualitySensitivity * (qualityComposite - 0.58) * 0.48)
    );
    if (desiredVessel && desiredVessel === potion.vessel) {
      vesselBonus = 1.06;
    }
  } else {
    const demand = snapshot.effectDemandMultipliers[requestedEffect] ?? 1.0;
    baseAppraised = roundHalfCrown(28 * demand);
  }

  const fairOfferCrowns = Math.max(
    2,
    roundHalfCrown(baseAppraised * qualityAlignment * vesselBonus * 0.96)
  );
  const headroomMult = 1.14 + (1 - profile.priceElasticity) * 0.46;
  const maxWillingnessCrowns = Math.max(
    fairOfferCrowns + 1,
    roundHalfCrown(fairOfferCrowns * headroomMult)
  );

  // Urgent envoys bring shorter patience (2..3), leisurely connoisseurs/peddlers (3..4).
  const basePatience = profile.priceElasticity <= 0.3 ? 2 : 3;
  const patienceLeft = Math.max(1, Math.min(4, basePatience + (subHash3 % 2)));

  const hexSuffix = (baseHash >>> 0).toString(16).padStart(8, '0');

  return {
    id: `envoy_${snapshot.day}_${archetype}_${hexSuffix}`,
    archetype,
    name,
    requestedEffect,
    desiredVessel,
    postureTell: profile.postureTell,
    eyeTell: profile.eyeTell,
    priceElasticity: profile.priceElasticity,
    qualitySensitivity: profile.qualitySensitivity,
    maxWillingnessCrowns,
    fairOfferCrowns,
    patienceLeft,
  };
}

export class BrassBalanceScale {
  private static readonly GRAVITY_M_S2 = 9.81;
  private static readonly ARM_LENGTH_M = 0.18;
  private static readonly INERTIA = 0.25;
  private static readonly DAMPING_C = 6.0;
  private static readonly STIFFNESS_K = 48.0;
  private static readonly MAX_TILT_RAD = 0.42;
  private static readonly BALANCE_TOLERANCE_CROWNS = 0.25;
  private static readonly SETTLE_ANGLE_EPS = 1e-3;
  private static readonly SETTLE_VEL_EPS = 1e-3;
  private static readonly MAX_STEP_DT = 0.2;
  private static readonly SUBSTEP_DT = 1 / 120;

  private leftMassCrowns: number;
  private weightsOnPan: BrassWeightDenom[] = [];
  private tiltAngleRad = 0;
  private angularVelRadS = 0;

  constructor(leftMassCrowns = 0) {
    this.leftMassCrowns =
      Number.isFinite(leftMassCrowns) && leftMassCrowns > 0 ? leftMassCrowns : 0;
  }

  setLeftMass(crowns: number): void {
    this.leftMassCrowns = Number.isFinite(crowns) && crowns > 0 ? crowns : 0;
  }

  addWeight(denom: BrassWeightDenom): BrassScaleState {
    if (Number.isFinite(denom) && denom > 0) {
      this.weightsOnPan.push(denom);
      // Dropping a brass weight onto the right pan imparts a gentle downward nudge.
      this.angularVelRadS -= Math.min(0.8, denom * 0.05);
    }
    return this.getState();
  }

  removeWeight(index: number): BrassScaleState {
    if (Number.isInteger(index) && index >= 0 && index < this.weightsOnPan.length) {
      const [removed] = this.weightsOnPan.splice(index, 1);
      this.angularVelRadS += Math.min(0.6, removed * 0.04);
    }
    return this.getState();
  }

  clearWeights(): BrassScaleState {
    if (this.weightsOnPan.length > 0) {
      this.weightsOnPan = [];
      this.angularVelRadS += 0.25;
    }
    return this.getState();
  }

  step(dtSec: number): BrassScaleState {
    if (!Number.isFinite(dtSec) || dtSec <= 0) {
      return this.getState();
    }

    const clampedDt = Math.min(dtSec, BrassBalanceScale.MAX_STEP_DT);
    const subSteps = Math.max(1, Math.ceil(clampedDt / BrassBalanceScale.SUBSTEP_DT));
    const h = clampedDt / subSteps;

    const rightMass = this.computeRightMass();
    const massDiff = this.leftMassCrowns - rightMass;
    const gL = BrassBalanceScale.GRAVITY_M_S2 * BrassBalanceScale.ARM_LENGTH_M;

    for (let i = 0; i < subSteps; i++) {
      const torque =
        gL * massDiff -
        BrassBalanceScale.DAMPING_C * this.angularVelRadS -
        BrassBalanceScale.STIFFNESS_K * this.tiltAngleRad;

      const alpha = torque / BrassBalanceScale.INERTIA;
      this.angularVelRadS += alpha * h;
      this.tiltAngleRad += this.angularVelRadS * h;

      if (this.tiltAngleRad >= BrassBalanceScale.MAX_TILT_RAD) {
        this.tiltAngleRad = BrassBalanceScale.MAX_TILT_RAD;
        if (this.angularVelRadS > 0) this.angularVelRadS = 0;
      } else if (this.tiltAngleRad <= -BrassBalanceScale.MAX_TILT_RAD) {
        this.tiltAngleRad = -BrassBalanceScale.MAX_TILT_RAD;
        if (this.angularVelRadS < 0) this.angularVelRadS = 0;
      }
    }

    const targetTilt = this.computeEquilibriumTilt(rightMass);
    if (
      Math.abs(this.tiltAngleRad - targetTilt) < BrassBalanceScale.SETTLE_ANGLE_EPS &&
      Math.abs(this.angularVelRadS) < BrassBalanceScale.SETTLE_VEL_EPS
    ) {
      this.tiltAngleRad = targetTilt;
      this.angularVelRadS = 0;
    }

    return this.getState();
  }

  getState(): BrassScaleState {
    const rightMassCrowns = this.computeRightMass();
    const targetTilt = this.computeEquilibriumTilt(rightMassCrowns);
    const balanced =
      Math.abs(this.leftMassCrowns - rightMassCrowns) <=
      BrassBalanceScale.BALANCE_TOLERANCE_CROWNS;
    const settled =
      Math.abs(this.tiltAngleRad - targetTilt) < BrassBalanceScale.SETTLE_ANGLE_EPS &&
      Math.abs(this.angularVelRadS) < BrassBalanceScale.SETTLE_VEL_EPS;

    return {
      leftMassCrowns: this.leftMassCrowns,
      rightMassCrowns,
      weightsOnPan: [...this.weightsOnPan],
      tiltAngleRad: this.tiltAngleRad,
      angularVelRadS: this.angularVelRadS,
      settled,
      balanced,
    };
  }

  private computeRightMass(): number {
    let sum = 0;
    for (const w of this.weightsOnPan) {
      sum += w;
    }
    return roundHalfCrown(sum);
  }

  private computeEquilibriumTilt(rightMassCrowns: number): number {
    const raw =
      (BrassBalanceScale.GRAVITY_M_S2 *
        BrassBalanceScale.ARM_LENGTH_M *
        (this.leftMassCrowns - rightMassCrowns)) /
      BrassBalanceScale.STIFFNESS_K;
    return Math.max(
      -BrassBalanceScale.MAX_TILT_RAD,
      Math.min(BrassBalanceScale.MAX_TILT_RAD, raw)
    );
  }
}
