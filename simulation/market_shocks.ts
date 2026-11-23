export type ReagentId =
  | 'amber_honey_resin'
  | 'cinnabar_sulfur_ash'
  | 'bismuth_vitriol_salt'
  | 'glacial_alum_shard'
  | 'chalk_pearl_lime'
  | 'verdigris_moss_sap'
  | 'saffron_hearth_pollen'
  | 'cobalt_lotus_nectar'
  | 'moonveil_lichen_dew'
  | 'rose_madder_distillate'
  | 'auric_mica_suspension'
  | 'starlight_aether_oil';

export const CANONICAL_REAGENT_ORDER: readonly ReagentId[] = [
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
] as const;

export type ReagentCategory =
  | 'botanical'
  | 'mineral'
  | 'crystal'
  | 'resin'
  | 'mica'
  | 'oil';

export type MarketRegime =
  | 'calm'
  | 'dragon_siege'
  | 'bumper_harvest'
  | 'glacial_snap'
  | 'starfall_conclave';

export type PotionVessel = 'prism' | 'teardrop' | 'crescent' | 'carafe';
export type GameMode = 'apprentice' | 'grandmaster';
export type BrassWeightDenom = 50 | 25 | 10 | 5 | 1 | 0.5;

export type PotionEffectTag =
  | 'fire_ward'
  | 'burn_salve'
  | 'hearth_tonic'
  | 'galaxy_elixir'
  | 'neutralizing_salve'
  | 'soothing_draught';

export type EnvoyArchetypeId =
  | 'singed_warden'
  | 'guild_loupe_connoisseur'
  | 'rain_soaked_herbalist'
  | 'frostbitten_courier'
  | 'starfall_astronomer'
  | 'iron_miner_factor'
  | 'court_chirurgeon'
  | 'wandering_bard_peddler';

export interface MarketSnapshot {
  regime: MarketRegime;
  day: number;
  reagentBuyPrices: Record<ReagentId, number>;
  reagentSellBackPrices: Record<ReagentId, number>;
  effectDemandMultipliers: Record<PotionEffectTag, number>;
  overheadCoalParchmentCrowns: number;
}

export interface EnvoyOffer {
  id: string;
  archetype: EnvoyArchetypeId;
  name: string;
  requestedEffect: PotionEffectTag;
  desiredVessel?: PotionVessel;
  postureTell: string;
  eyeTell: string;
  priceElasticity: number;
  qualitySensitivity: number;
  maxWillingnessCrowns: number;
  fairOfferCrowns: number;
  patienceLeft: number;
}

export interface BrassScaleState {
  leftMassCrowns: number;
  rightMassCrowns: number;
  weightsOnPan: BrassWeightDenom[];
  tiltAngleRad: number;
  angularVelRadS: number;
  settled: boolean;
  balanced: boolean;
}

export interface LedgerEntry {
  id: string;
  day: number;
  timestampIso: string;
  text: string;
  deltaCrowns: number;
  kind: 'sale' | 'purchase' | 'overhead' | 'commission' | 'reset';
}

export interface MarketPotionInput {
  vessel: PotionVessel;
  purity: number;
  marblingIndex: number;
  layerCrispness: number;
  collectorBrilliance: number;
  dominantEffect: PotionEffectTag;
  baseValueCrowns: number;
  layers: Array<{ specificGravity: number }>;
  seal?: {
    color?: string;
    crest?: string;
    stamped?: boolean;
  };
}

interface ReagentMarketMeta {
  baseCostCrowns: number;
  category: ReagentCategory;
  tags: readonly PotionEffectTag[];
}

export const REAGENT_BASE_COSTS: Record<ReagentId, number> = {
  amber_honey_resin: 8,
  cinnabar_sulfur_ash: 14,
  bismuth_vitriol_salt: 12,
  glacial_alum_shard: 11,
  chalk_pearl_lime: 9,
  verdigris_moss_sap: 7,
  saffron_hearth_pollen: 10,
  cobalt_lotus_nectar: 11,
  moonveil_lichen_dew: 9,
  rose_madder_distillate: 10,
  auric_mica_suspension: 16,
  starlight_aether_oil: 18,
};

const REAGENT_MARKET_META: Record<ReagentId, ReagentMarketMeta> = {
  amber_honey_resin: { baseCostCrowns: 8, category: 'resin', tags: ['soothing_draught'] },
  cinnabar_sulfur_ash: { baseCostCrowns: 14, category: 'mineral', tags: ['fire_ward', 'burn_salve'] },
  bismuth_vitriol_salt: { baseCostCrowns: 12, category: 'crystal', tags: ['neutralizing_salve', 'fire_ward'] },
  glacial_alum_shard: { baseCostCrowns: 11, category: 'crystal', tags: ['burn_salve', 'neutralizing_salve'] },
  chalk_pearl_lime: { baseCostCrowns: 9, category: 'mineral', tags: ['neutralizing_salve'] },
  verdigris_moss_sap: { baseCostCrowns: 7, category: 'botanical', tags: ['burn_salve', 'soothing_draught'] },
  saffron_hearth_pollen: { baseCostCrowns: 10, category: 'botanical', tags: ['hearth_tonic', 'fire_ward'] },
  cobalt_lotus_nectar: { baseCostCrowns: 11, category: 'botanical', tags: ['galaxy_elixir', 'soothing_draught'] },
  moonveil_lichen_dew: { baseCostCrowns: 9, category: 'botanical', tags: ['galaxy_elixir', 'burn_salve'] },
  rose_madder_distillate: { baseCostCrowns: 10, category: 'botanical', tags: ['hearth_tonic', 'soothing_draught'] },
  auric_mica_suspension: { baseCostCrowns: 16, category: 'mica', tags: ['galaxy_elixir'] },
  starlight_aether_oil: { baseCostCrowns: 18, category: 'oil', tags: ['galaxy_elixir', 'hearth_tonic'] },
};

export const ALL_MARKET_REGIMES: readonly MarketRegime[] = [
  'calm',
  'dragon_siege',
  'bumper_harvest',
  'glacial_snap',
  'starfall_conclave',
] as const;

export const ALL_POTION_EFFECTS: readonly PotionEffectTag[] = [
  'fire_ward',
  'burn_salve',
  'hearth_tonic',
  'galaxy_elixir',
  'neutralizing_salve',
  'soothing_draught',
] as const;

const MIN_FESTIVAL_MODIFIER = 0.5;
const MAX_FESTIVAL_MODIFIER = 2.5;
const MAX_SELLBACK_RATIO = 0.65;

const REGIME_REAGENT_BUY_MULTIPLIERS: Record<MarketRegime, Partial<Record<ReagentId, number>>> = {
  calm: {},
  dragon_siege: {
    cinnabar_sulfur_ash: 1.55,
    bismuth_vitriol_salt: 1.5,
    glacial_alum_shard: 1.15,
    amber_honey_resin: 1.1,
  },
  bumper_harvest: {
    verdigris_moss_sap: 0.6,
    saffron_hearth_pollen: 0.6,
    cobalt_lotus_nectar: 0.6,
    moonveil_lichen_dew: 0.6,
    rose_madder_distillate: 0.6,
  },
  glacial_snap: {
    saffron_hearth_pollen: 1.3,
    rose_madder_distillate: 1.2,
    amber_honey_resin: 1.15,
    glacial_alum_shard: 0.85,
  },
  starfall_conclave: {
    auric_mica_suspension: 1.45,
    starlight_aether_oil: 1.45,
    cobalt_lotus_nectar: 1.2,
    moonveil_lichen_dew: 1.2,
  },
};

const REGIME_EFFECT_DEMAND_MULTIPLIERS: Record<MarketRegime, Record<PotionEffectTag, number>> = {
  calm: {
    fire_ward: 1.0,
    burn_salve: 1.0,
    hearth_tonic: 1.0,
    galaxy_elixir: 1.0,
    neutralizing_salve: 1.0,
    soothing_draught: 1.0,
  },
  dragon_siege: {
    fire_ward: 1.85,
    burn_salve: 1.85,
    hearth_tonic: 0.9,
    galaxy_elixir: 0.85,
    neutralizing_salve: 1.15,
    soothing_draught: 1.05,
  },
  bumper_harvest: {
    fire_ward: 0.95,
    burn_salve: 1.0,
    hearth_tonic: 1.0,
    galaxy_elixir: 1.05,
    neutralizing_salve: 1.15,
    soothing_draught: 1.2,
  },
  glacial_snap: {
    fire_ward: 1.05,
    burn_salve: 1.1,
    hearth_tonic: 1.75,
    galaxy_elixir: 1.0,
    neutralizing_salve: 0.95,
    soothing_draught: 1.2,
  },
  starfall_conclave: {
    fire_ward: 0.95,
    burn_salve: 0.95,
    hearth_tonic: 1.05,
    galaxy_elixir: 2.1,
    neutralizing_salve: 1.0,
    soothing_draught: 1.1,
  },
};

const REGIME_OVERHEAD_SURCHARGE: Record<MarketRegime, number> = {
  calm: 0,
  dragon_siege: 3,
  bumper_harvest: -1,
  glacial_snap: 4,
  starfall_conclave: 2,
};

const VESSEL_CRAFT_MULTIPLIERS: Record<PotionVessel, number> = {
  carafe: 1.0,
  teardrop: 1.04,
  crescent: 1.08,
  prism: 1.12,
};

export function roundHalfCrown(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 2) / 2;
}

export function floorHalfCrown(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value * 2 + 1e-9) / 2;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function hashSeedToUint32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Murmur3/splitmix finalizer for strong bit dispersion across adjacent day indices.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function getSafeRegime(regime: MarketRegime): MarketRegime {
  return ALL_MARKET_REGIMES.includes(regime) ? regime : 'calm';
}

function getSafeFestivalModifier(raw?: number): number {
  if (raw === undefined || !Number.isFinite(raw)) return 1.0;
  return Math.max(MIN_FESTIVAL_MODIFIER, Math.min(MAX_FESTIVAL_MODIFIER, raw));
}

function computeRawBuyPrice(
  reagentId: ReagentId,
  regime: MarketRegime,
  festivalMod: number
): number {
  const base = REAGENT_BASE_COSTS[reagentId];
  const regimeMult = REGIME_REAGENT_BUY_MULTIPLIERS[regime][reagentId] ?? 1.0;
  return Math.max(1.0, roundHalfCrown(base * regimeMult * festivalMod));
}

/**
 * Lowest possible buy price for a reagent across every market regime and the
 * maximum allowed festival discount, used to guarantee zero cross-shock arbitrage.
 */
export function getMinPossibleBuyPrice(reagentId: ReagentId): number {
  let minBuy = Infinity;
  for (const regime of ALL_MARKET_REGIMES) {
    const candidate = computeRawBuyPrice(reagentId, regime, MIN_FESTIVAL_MODIFIER);
    if (candidate < minBuy) minBuy = candidate;
  }
  return minBuy;
}

export function getCrossShockSellCap(reagentId: ReagentId): number {
  const minBuy = getMinPossibleBuyPrice(reagentId);
  return Math.max(0.5, floorHalfCrown(minBuy - 0.5));
}

export function computeMarketSnapshot(
  regime: MarketRegime,
  day: number,
  festivalModifiers?: Partial<Record<ReagentId, number>>
): MarketSnapshot {
  const safeRegime = getSafeRegime(regime);
  const safeDay = Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1;

  const reagentBuyPrices = {} as Record<ReagentId, number>;
  const reagentSellBackPrices = {} as Record<ReagentId, number>;

  for (const id of CANONICAL_REAGENT_ORDER) {
    const festMod = getSafeFestivalModifier(festivalModifiers?.[id]);
    const buyPrice = computeRawBuyPrice(id, safeRegime, festMod);
    const sameTurnCap = floorHalfCrown(MAX_SELLBACK_RATIO * buyPrice);
    const crossShockCap = getCrossShockSellCap(id);
    const sellPrice = Math.max(0.5, Math.min(sameTurnCap, crossShockCap));

    reagentBuyPrices[id] = buyPrice;
    reagentSellBackPrices[id] = sellPrice;
  }

  const baseDemand = REGIME_EFFECT_DEMAND_MULTIPLIERS[safeRegime];
  const effectDemandMultipliers = {} as Record<PotionEffectTag, number>;
  for (const effect of ALL_POTION_EFFECTS) {
    effectDemandMultipliers[effect] = baseDemand[effect];
  }

  const dayDriftOverhead = Math.min(14, Math.floor((safeDay - 1) / 3));
  const overheadCoalParchmentCrowns = Math.max(
    8,
    roundHalfCrown(10 + dayDriftOverhead + REGIME_OVERHEAD_SURCHARGE[safeRegime])
  );

  return {
    regime: safeRegime,
    day: safeDay,
    reagentBuyPrices,
    reagentSellBackPrices,
    effectDemandMultipliers,
    overheadCoalParchmentCrowns,
  };
}

/**
 * Estimates the economic hedge value gained by refining raw reagent units in the
 * kinetic cellar (quintessences / catalyst salts) under a given market regime.
 */
export function computeCellarHedgeYield(
  baseReagentId: ReagentId,
  regime: MarketRegime,
  units: number
): number {
  if (!Number.isFinite(units) || units <= 0) return 0;
  const meta = REAGENT_MARKET_META[baseReagentId];
  if (!meta) return 0;

  const safeRegime = getSafeRegime(regime);
  const demandTable = REGIME_EFFECT_DEMAND_MULTIPLIERS[safeRegime];

  let bestDemand = 1.0;
  for (const tag of meta.tags) {
    if (demandTable[tag] > bestDemand) {
      bestDemand = demandTable[tag];
    }
  }

  // Botanicals & resins benefit strongly from gentle cellar quintessence extraction;
  // crystals & minerals gain precision purity as catalyst salts.
  const processEfficiency =
    meta.category === 'botanical'
      ? 1.32
      : meta.category === 'resin' || meta.category === 'oil'
        ? 1.25
        : 1.18;

  const harvestPreservationBonus =
    safeRegime === 'bumper_harvest' && meta.category === 'botanical' ? 1.1 : 1.0;

  const perUnitCrownValue =
    meta.baseCostCrowns * processEfficiency * bestDemand * harvestPreservationBonus;

  return roundHalfCrown(perUnitCrownValue * units);
}

export function pickDailyMarketRegime(
  dateSeed: string,
  day: number,
  prevRegime?: MarketRegime
): MarketRegime {
  const safeSeed = typeof dateSeed === 'string' ? dateSeed : '';
  const safeDay = Number.isFinite(day) ? Math.floor(day) : 1;
  const bucket = hashSeedToUint32(`${safeSeed}::day::${safeDay}`) % 100;

  let candidate: MarketRegime;
  if (bucket < 28) candidate = 'calm';
  else if (bucket < 46) candidate = 'dragon_siege';
  else if (bucket < 64) candidate = 'bumper_harvest';
  else if (bucket < 82) candidate = 'glacial_snap';
  else candidate = 'starfall_conclave';

  if (prevRegime !== undefined && candidate === prevRegime) {
    const alternates = ALL_MARKET_REGIMES.filter((r) => r !== prevRegime);
    const altHash = hashSeedToUint32(`${safeSeed}::day::${safeDay}::alt::${prevRegime}`);
    return alternates[altHash % alternates.length];
  }

  return candidate;
}

/**
 * Shared valuation core used by both market appraisal and NPC envoy generation.
 */
export function estimatePotionMarketValue(
  potion: MarketPotionInput,
  snapshot: MarketSnapshot
): number {
  const baseValue = Number.isFinite(potion.baseValueCrowns)
    ? Math.max(1, potion.baseValueCrowns)
    : 12;

  const demandMult = snapshot.effectDemandMultipliers[potion.dominantEffect] ?? 1.0;
  const purity = clamp01(potion.purity);
  const crispness = clamp01(potion.layerCrispness);
  const marbling = clamp01(potion.marblingIndex);
  const brilliance = clamp01(potion.collectorBrilliance);
  const vesselMult = VESSEL_CRAFT_MULTIPLIERS[potion.vessel] ?? 1.0;

  const layers = Array.isArray(potion.layers) ? potion.layers : [];
  const layerCountBonus = 1 + 0.05 * Math.min(4, Math.max(0, layers.length - 1));

  // Verify bottom-to-top descending specific gravity stratification bonus.
  let stratified = layers.length >= 2;
  for (let i = 1; i < layers.length; i++) {
    if (layers[i].specificGravity > layers[i - 1].specificGravity + 1e-4) {
      stratified = false;
      break;
    }
  }
  const stratificationMult = stratified ? 1.06 : 1.0;

  const purityMult = 0.7 + 0.5 * purity;
  const craftMult = 1 + 0.14 * Math.max(crispness, marbling);
  const brillianceBonus =
    snapshot.regime === 'starfall_conclave' && potion.dominantEffect === 'galaxy_elixir'
      ? 1 + 0.35 * brilliance
      : 1 + 0.22 * brilliance;
  const sealBonus = potion.seal?.stamped ? 1.06 : 1.0;

  const rawValuation =
    baseValue *
    demandMult *
    purityMult *
    craftMult *
    layerCountBonus *
    stratificationMult *
    brillianceBonus *
    vesselMult *
    sealBonus;

  return Math.max(1, roundHalfCrown(rawValuation));
}
