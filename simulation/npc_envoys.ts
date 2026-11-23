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

export const ARCHETYPE_POSTURE_TELLS: Record<
  EnvoyArchetypeId,
  readonly [string, string, string, string]
> = {
  singed_warden: [
    'Favors a blistered gauntlet and shifts weight away from the hearth.',
    'Keeps a soot-crusted tower shield braced beside the door and never unbuckles his baldric.',
    'Rests scorched knuckles on the oak counter, ready to sprint back at the first alarm bell.',
    'Stands stiffly in heat-warped brigandine that smells faintly of dragon-smoke and tallow.',
  ],
  guild_loupe_connoisseur: [
    'Leans forward with a brass jeweler loupe poised a hair from the glass.',
    'Adjusts velvet cufflinks and places a silk inspection cloth square upon the walnut counter.',
    'Holds a gloved forefinger against the bottle neck without leaving a single smudge.',
    'Tilts the flask slowly toward the sunlit window, testing viscosity in disciplined silence.',
  ],
  rain_soaked_herbalist: [
    'Shakes rainwater from oilskin cuffs and tucks mossy satchels tight.',
    'Drips peat-dark water onto the flagstones while cradling a willow herb basket.',
    'Leans a mud-spattered walking staff against the shelf and unbuttons a damp wool cloak.',
    'Warms rain-chilled fingers briefly near the counter lantern before lifting any bottle.',
  ],
  frostbitten_courier: [
    'Hugs trembling shoulders and stamps snowmelt from spurred boots.',
    'Rubs numb gloved palms together and keeps a frost-rimed dispatch tube slung tight.',
    'Shifts from foot to foot in a heavy sheepskin coat dusted with high-pass sleet.',
    'Breathes pale mist into curled fingers while leaning close to the warm apothecary hearth.',
  ],
  starfall_astronomer: [
    'Cradles an astrolabe case under one velvet sleeve with poised stillness.',
    'Traces a celestial chord in the air while waiting for the balance beam to settle.',
    'Draws an indigo star-chart sleeve away from the glassware with measured grace.',
    'Rests an inked brass sextant lightly on the counter as if aligning it with the glass.',
  ],
  iron_miner_factor: [
    'Crosses soot-stained forearms and plants boots wide by the counter.',
    'Sets a heavy iron tally-rod beside the brass pan with an unmistakable thud.',
    'Tugs a leather ore-apron straight and folds calloused hands behind a broad belt.',
    'Leans a solid shoulder against the oak post, unhurried as bedrock.',
  ],
  court_chirurgeon: [
    'Stands rigid with a silver lancet case and spotless linen cuffs.',
    'Folds crisp apothecary gloves over the counter edge, keeping an exact arm\'s length.',
    'Holds upright posture beneath a starched velvet collar that never catches a speck of dust.',
    'Inspects the bottle at eye level with two immaculate fingers on the base and neck.',
  ],
  wandering_bard_peddler: [
    'Taps a lute-strap rhythm on the walnut ledge and tilts his feathered hat.',
    'Rests one boot on a brass-bound travel trunk while flourishing an embroidered sleeve.',
    'Spins a lucky silver penny across knuckles in effortless three-quarter time.',
    'Leans cheerfully on both elbows across the counter as if sharing tavern gossip.',
  ],
};

export const ARCHETYPE_EYE_TELLS: Record<
  EnvoyArchetypeId,
  readonly [string, string, string, string]
> = {
  singed_warden: [
    'Pupils dart urgently toward crimson ward vials whenever embers crackle.',
    'Narrows smoke-reddened eyes at the hearth glow before snapping attention back to the shelf.',
    'Scans every stoppered flask for thick fire-ward sediment with impatient urgency.',
    'Keeps one eye fixed on the street bell through the stained glass while gesturing toward burn salves.',
  ],
  guild_loupe_connoisseur: [
    'Squints critically at density horizons and refracted mica shimmer.',
    'Tracks each micro-bubble rising through the strata like an auditor checking a ledger.',
    'Blinks slowly behind thick crystal spectacles, judging clarity along the meniscus.',
    'Locks onto the wax seal crispness before inspecting the faintest trace of cloudiness.',
  ],
  rain_soaked_herbalist: [
    'Glances warmly at emerald and amber botanical infusions.',
    'Peers intently for bruised-leaf clarity and suspended woodland pollen.',
    'Brightens at the sight of verdant moss tones swirling gently inside round glass.',
    'Follows every slow-drifting herb fleck as though reading weather in moorland streams.',
  ],
  frostbitten_courier: [
    'Fixes unblinking eyes on golden warming tonics near the bellows.',
    'Searches the shelf desperately for amber hearth-cordials before dusk settles on the pass.',
    'Tracks the glowing embers reflected in saffron flasks with wind-chapped intensity.',
    'Glances repeatedly between the frosted windowpane and your warmest spiced draughts.',
  ],
  starfall_astronomer: [
    'Tracks swirling auric flecks and violet strata as though charting comets.',
    'Studies luminous mica suspension patterns against the stained glass with quiet wonder.',
    'Focuses on deep cobalt and starlight layers, oblivious to the clatter of coins.',
    'Measures refractive brilliance across faceted prism walls with nocturnal patience.',
  ],
  iron_miner_factor: [
    'Weighs every brass gram on the scale pan before meeting your gaze.',
    'Calculates coin totals behind flinty eyes, unmoved by ornate labels or gilding.',
    'Checks the thickness of the bottle glass and the seal before naming a single half-crown.',
    'Stares squarely at the balance needle until the beam comes to dead-level rest.',
  ],
  court_chirurgeon: [
    'Checks wax seal crest and sediment clarity with clinical precision.',
    'Scans for undesirable precipitate or haze with the severity of a royal ward inspection.',
    'Verifies color purity and sharp stratification before granting a single approving nod.',
    'Reads the posture of your hands on the scale weights as closely as the potion itself.',
  ],
  wandering_bard_peddler: [
    'Winks at ornate prism vessels while gauging your reaction to his opening bid.',
    'Dances bright, curious eyes across colorful swirled bottles and shiny wax crests.',
    'Catches every glint of candlelight off the brass pans with theatrical amusement.',
    'Looks straight for your smile before deciding how high to push the next jesting offer.',
  ],
};

export const ENVOY_ARCHETYPES: Record<EnvoyArchetypeId, EnvoyArchetypeProfile> = {
  singed_warden: {
    title: 'Singed Citadel Warden',
    postureTell: ARCHETYPE_POSTURE_TELLS.singed_warden[0],
    eyeTell: ARCHETYPE_EYE_TELLS.singed_warden[0],
    preferredEffects: ['fire_ward', 'burn_salve'],
    priceElasticity: 0.22,
    qualitySensitivity: 0.35,
  },
  guild_loupe_connoisseur: {
    title: 'Guild Loupe Connoisseur',
    postureTell: ARCHETYPE_POSTURE_TELLS.guild_loupe_connoisseur[0],
    eyeTell: ARCHETYPE_EYE_TELLS.guild_loupe_connoisseur[0],
    preferredEffects: ['galaxy_elixir', 'neutralizing_salve'],
    priceElasticity: 0.55,
    qualitySensitivity: 0.95,
  },
  rain_soaked_herbalist: {
    title: 'Rain-Soaked Moorland Herbalist',
    postureTell: ARCHETYPE_POSTURE_TELLS.rain_soaked_herbalist[0],
    eyeTell: ARCHETYPE_EYE_TELLS.rain_soaked_herbalist[0],
    preferredEffects: ['soothing_draught', 'burn_salve'],
    priceElasticity: 0.78,
    qualitySensitivity: 0.48,
  },
  frostbitten_courier: {
    title: 'Frostbitten Pass Courier',
    postureTell: ARCHETYPE_POSTURE_TELLS.frostbitten_courier[0],
    eyeTell: ARCHETYPE_EYE_TELLS.frostbitten_courier[0],
    preferredEffects: ['hearth_tonic', 'soothing_draught'],
    priceElasticity: 0.28,
    qualitySensitivity: 0.3,
  },
  starfall_astronomer: {
    title: 'Starfall Observatory Astronomer',
    postureTell: ARCHETYPE_POSTURE_TELLS.starfall_astronomer[0],
    eyeTell: ARCHETYPE_EYE_TELLS.starfall_astronomer[0],
    preferredEffects: ['galaxy_elixir', 'hearth_tonic'],
    priceElasticity: 0.36,
    qualitySensitivity: 0.88,
  },
  iron_miner_factor: {
    title: 'Iron-Vein Miner Factor',
    postureTell: ARCHETYPE_POSTURE_TELLS.iron_miner_factor[0],
    eyeTell: ARCHETYPE_EYE_TELLS.iron_miner_factor[0],
    preferredEffects: ['neutralizing_salve', 'fire_ward'],
    priceElasticity: 0.85,
    qualitySensitivity: 0.4,
  },
  court_chirurgeon: {
    title: 'Royal Court Chirurgeon',
    postureTell: ARCHETYPE_POSTURE_TELLS.court_chirurgeon[0],
    eyeTell: ARCHETYPE_EYE_TELLS.court_chirurgeon[0],
    preferredEffects: ['burn_salve', 'neutralizing_salve', 'soothing_draught'],
    priceElasticity: 0.42,
    qualitySensitivity: 0.82,
  },
  wandering_bard_peddler: {
    title: 'Wandering Bard-Peddler',
    postureTell: ARCHETYPE_POSTURE_TELLS.wandering_bard_peddler[0],
    eyeTell: ARCHETYPE_EYE_TELLS.wandering_bard_peddler[0],
    preferredEffects: ['soothing_draught', 'galaxy_elixir', 'hearth_tonic'],
    priceElasticity: 0.7,
    qualitySensitivity: 0.58,
  },
};

export const ARCHETYPE_NAMES: Record<EnvoyArchetypeId, readonly string[]> = {
  singed_warden: [
    'Captain Torsten Ashwatch',
    'Warden Ingrid Cinderpike',
    'Sergeant Bram Emberguard',
    'Watchman Aldric Soothelm',
    'Bastion-Marshal Freya Coalbrand',
    'Outrider Garrett Charshield',
    'Sentinel Helga Hearthplate',
    'Captain Orlov Scorchwall',
  ],
  guild_loupe_connoisseur: [
    'Magister Aurelia Vance',
    'Assayer Corvus Glass',
    'Syndic Helena Prismont',
    'Curator Thaddeus Beryl',
    'Inspector Mireille Quartz',
    'Proctor Lucian Speculum',
    'Appraiser Isolde Vitreous',
    'Master Alistair Crownlens',
  ],
  rain_soaked_herbalist: [
    'Maren Bogwillow',
    'Rowan Fenmoss',
    'Alder Raincloak',
    'Briar Peatfern',
    'Linnea Mistreed',
    'Fennick Dewroot',
    'Tamsin Heatherwick',
    'Sedgewick Cloudmoss',
  ],
  frostbitten_courier: [
    'Courier Astrid Rimefoot',
    'Rider Lukas Frostpass',
    'Kaelen Snowspur',
    'Despatcher Sigrid Galecrest',
    'Outrunner Henrik Glacierborn',
    'Yrsa Hailcloak',
    'Milo Sleetstride',
    'Brigid Coldlantern',
  ],
  starfall_astronomer: [
    'Astronomer Soren Vane',
    'Magister Lyra Comethale',
    'Thales Observatory-Fellow',
    'Stargazer Celestine Zenith',
    'Orrery-Keeper Dorian Astrolabe',
    'Scholar Nyx Nebulon',
    'Watcher Cassiopeia Veil',
    'Savant Eamon Solstice',
  ],
  iron_miner_factor: [
    'Factor Goran Slaghammer',
    'Foreman Hjalmar Veinpick',
    'Orin Deepseam',
    'Steward Dagna Pyrite',
    'Quartermaster Ulric Basalt',
    'Ganger Tomas Orebarrow',
    'Assay-Boss Petra Flintlock',
    'Factor Borin Hearthslag',
  ],
  court_chirurgeon: [
    'Chirurgeon Evelyn Hart',
    'Doctor Cassian Bloodroot',
    'Physician Clara Balm',
    'Apothecary-Royal Cedric Lancet',
    'Matron Vivienne Yarrow',
    'Surgeon-Major Gideon Suture',
    'Healer Beatrice Salvia',
    'Doctor Leopold Feverfew',
  ],
  wandering_bard_peddler: [
    'Fiddler Julian Lark',
    'Minstrel Sylvie Rosewood',
    'Bastian Six-Strings',
    'Troubadour Corin Silverbell',
    'Peddler Pippa Saffroncoat',
    'Balladeer Mateo Tambour',
    'Lutenist Rosalind Pennywise',
    'Juggler Barnaby Copperpot',
  ],
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

/**
 * Selects a candidate archetype and envoy name, filtering out recent names across
 * candidate archetypes so a 12-visit sliding window never repeats the same envoy.
 */
function pickEnvoyIdentity(
  candidates: readonly EnvoyArchetypeId[],
  regime: MarketRegime,
  recentNames: readonly string[] | undefined,
  baseHash: number,
  nameHash: number
): { archetype: EnvoyArchetypeId; name: string } {
  const recentList = Array.isArray(recentNames)
    ? recentNames.filter((n): n is string => typeof n === 'string')
    : [];
  const recentSet = new Set(recentList);

  const freshArchetypes = candidates.filter((id) =>
    ARCHETYPE_NAMES[id].some((name) => !recentSet.has(name))
  );

  if (freshArchetypes.length > 0) {
    const archetype = pickWeightedArchetype(freshArchetypes, regime, baseHash);
    const freshNames = ARCHETYPE_NAMES[archetype].filter((name) => !recentSet.has(name));
    return {
      archetype,
      name: freshNames[nameHash % freshNames.length],
    };
  }

  // Fallback when every candidate name is already in recentNames: pick the least-recently-seen name.
  const archetype = pickWeightedArchetype(candidates, regime, baseHash);
  const names = ARCHETYPE_NAMES[archetype];
  let bestName = names[nameHash % names.length];
  let oldestIndex = Infinity;

  for (let offset = 0; offset < names.length; offset++) {
    const candidateName = names[(nameHash + offset) % names.length];
    const lastIdx = recentList.lastIndexOf(candidateName);
    if (lastIdx < oldestIndex) {
      oldestIndex = lastIdx;
      bestName = candidateName;
    }
  }

  return { archetype, name: bestName };
}

export function generateEnvoyForPotion(
  potion: MarketPotionInput | null,
  snapshot: MarketSnapshot,
  seedStr: string,
  recentNames?: readonly string[]
): EnvoyOffer {
  const safeSeed = typeof seedStr === 'string' ? seedStr : 'default';
  const baseHash = hashSeedToUint32(
    `${safeSeed}::${snapshot.regime}::${snapshot.day}::${potion?.dominantEffect ?? 'open'}`
  );
  const subHash1 = hashSeedToUint32(`${safeSeed}::vessel::${baseHash}`);
  const subHash2 = hashSeedToUint32(`${safeSeed}::name::${baseHash}`);
  const subHash3 = hashSeedToUint32(`${safeSeed}::patience::${baseHash}`);
  const postureHash = hashSeedToUint32(`${safeSeed}::posture::${baseHash}`);
  const eyeHash = hashSeedToUint32(`${safeSeed}::eye::${baseHash}`);

  let candidates: EnvoyArchetypeId[];
  if (potion) {
    const matching = ALL_ENVOY_ARCHETYPES.filter((id) =>
      ENVOY_ARCHETYPES[id].preferredEffects.includes(potion.dominantEffect)
    );
    candidates = matching.length > 0 ? matching : [...ALL_ENVOY_ARCHETYPES];
  } else {
    candidates = [...ALL_ENVOY_ARCHETYPES];
  }

  const { archetype, name } = pickEnvoyIdentity(
    candidates,
    snapshot.regime,
    recentNames,
    baseHash,
    subHash2
  );
  const profile = ENVOY_ARCHETYPES[archetype];
  const posturePool = ARCHETYPE_POSTURE_TELLS[archetype];
  const eyePool = ARCHETYPE_EYE_TELLS[archetype];
  const postureTell = posturePool[postureHash % posturePool.length];
  const eyeTell = eyePool[eyeHash % eyePool.length];

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
    postureTell,
    eyeTell,
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
