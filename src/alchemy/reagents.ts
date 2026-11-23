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
  'amber_honey_resin',       // 0
  'cinnabar_sulfur_ash',     // 1
  'bismuth_vitriol_salt',    // 2
  'glacial_alum_shard',      // 3
  'chalk_pearl_lime',        // 4
  'verdigris_moss_sap',      // 5
  'saffron_hearth_pollen',   // 6
  'cobalt_lotus_nectar',     // 7
  'moonveil_lichen_dew',     // 8
  'rose_madder_distillate',  // 9
  'auric_mica_suspension',   // 10
  'starlight_aether_oil',    // 11
] as const;

export type PrepForm =
  | 'raw'
  | 'ground_crystal'
  | 'sliced_botanical'
  | 'pipette_drops'
  | 'cellar_quintessence'
  | 'catalyst_salt';

export type PotionVessel = 'prism' | 'teardrop' | 'crescent' | 'carafe';
export type GameMode = 'apprentice' | 'grandmaster';

export type PotionEffectTag =
  | 'fire_ward'
  | 'burn_salve'
  | 'hearth_tonic'
  | 'galaxy_elixir'
  | 'neutralizing_salve'
  | 'soothing_draught';

export interface ReagentSpec {
  id: ReagentId;
  index: number;
  name: string;
  category: 'botanical' | 'mineral' | 'crystal' | 'resin' | 'mica' | 'oil';
  specificGravity: number;   // [0.82, 1.55]
  baseViscosity: number;     // [1.1, 15.5]
  phShift: number;           // [-2.4, +2.8]
  enthalpyDeltaC: number;    // [-26, +28]
  hardness: number;          // [0.1, 1.0] for mortar fracture pitch
  preferredPrep: PrepForm;
  baseColorRgb: [number, number, number]; // normalized [0..1]
  micaIntensity: number;     // [0..1]
  baseCostCrowns: number;
  tags: PotionEffectTag[];
}

export interface DensityLayer {
  reagentId: ReagentId;
  prepForm: PrepForm;
  specificGravity: number;
  volumeMl: number;          // positive conserved ml
  viscosity: number;
  colorRgb: [number, number, number];
  micaIntensity: number;
  interfaceSharpness: number; // [0..1], 1 = razor-crisp horizon, 0 = marbled/blended
}

export interface CauldronFluidState {
  temperatureC: number;      // [15, 115]
  ph: number;                // [1.5, 12.5], neutral = 7.0
  totalVolumeMl: number;     // sum of layers
  meanViscosity: number;
  angularVelocityRadS: number; // ladle omega
  shearCritRadS: number;     // threshold above which suminagashi marbling folds layers
  marblingIndex: number;     // [0..1]
  layerCrispness: number;    // [0..1]
  purity: number;            // [0..1]
  collectorBrilliance: number; // [0..1]
  boilOverPenalty: number;   // [0..1]
  dominantEffect: PotionEffectTag;
  layers: DensityLayer[];    // ordered bottom (highest rho) to top (lowest rho)
  phIndicatorRgb: [number, number, number];
}

export interface WaxSealSpec {
  color: 'crimson' | 'verdigris' | 'gold' | 'indigo';
  crest: 'phoenix' | 'alembic' | 'crescent' | 'scales';
  stamped: boolean;
}

export interface CraftedPotion {
  id: string;
  name: string;
  vessel: PotionVessel;
  seal: WaxSealSpec;
  layers: DensityLayer[];
  purity: number;
  marblingIndex: number;
  layerCrispness: number;
  collectorBrilliance: number;
  ph: number;
  peakTempC: number;
  dominantEffect: PotionEffectTag;
  baseValueCrowns: number;
  createdAtDay: number;
}

export interface FestivalCommissionSpec {
  id: string;
  tier: 'apprentice' | 'journeyman' | 'grandmaster';
  title: string;
  description: string;
  requiredEffect: PotionEffectTag;
  minLayers: number;
  minLayerCrispness: number;
  minPurity: number;
  targetPh?: [number, number];
  minPeakTempC?: number;
  rewardCrowns: number;
}

export type CommissionRegime =
  | 'calm'
  | 'dragon_siege'
  | 'bumper_harvest'
  | 'glacial_snap'
  | 'starfall_conclave';

export interface ProceduralCommissionOptions {
  regime: CommissionRegime;
  day: number;
  completedIds: readonly string[];
  seed: string;
  count?: number;
}

export const REAGENT_CATALOG: Record<ReagentId, ReagentSpec> = {
  amber_honey_resin: {
    id: 'amber_honey_resin',
    index: 0,
    name: 'Amber Honey Resin',
    category: 'resin',
    specificGravity: 1.42,
    baseViscosity: 15.5,
    phShift: -0.6,
    enthalpyDeltaC: 4,
    hardness: 0.25,
    preferredPrep: 'raw',
    baseColorRgb: [0.85, 0.56, 0.14],
    micaIntensity: 0.15,
    baseCostCrowns: 8,
    tags: ['soothing_draught'],
  },
  cinnabar_sulfur_ash: {
    id: 'cinnabar_sulfur_ash',
    index: 1,
    name: 'Cinnabar Sulfur Ash',
    category: 'mineral',
    specificGravity: 1.55,
    baseViscosity: 4.2,
    phShift: -1.8,
    enthalpyDeltaC: 28,
    hardness: 0.72,
    preferredPrep: 'ground_crystal',
    baseColorRgb: [0.86, 0.24, 0.14],
    micaIntensity: 0.2,
    baseCostCrowns: 14,
    tags: ['fire_ward', 'burn_salve'],
  },
  bismuth_vitriol_salt: {
    id: 'bismuth_vitriol_salt',
    index: 2,
    name: 'Bismuth Vitriol Salt',
    category: 'crystal',
    specificGravity: 1.48,
    baseViscosity: 3.0,
    phShift: -2.4,
    enthalpyDeltaC: 16,
    hardness: 0.88,
    preferredPrep: 'ground_crystal',
    baseColorRgb: [0.34, 0.62, 0.74],
    micaIntensity: 0.45,
    baseCostCrowns: 12,
    tags: ['neutralizing_salve', 'fire_ward'],
  },
  glacial_alum_shard: {
    id: 'glacial_alum_shard',
    index: 3,
    name: 'Glacial Alum Shard',
    category: 'crystal',
    specificGravity: 1.34,
    baseViscosity: 2.4,
    phShift: 1.9,
    enthalpyDeltaC: -26,
    hardness: 0.94,
    preferredPrep: 'ground_crystal',
    baseColorRgb: [0.68, 0.89, 0.96],
    micaIntensity: 0.35,
    baseCostCrowns: 11,
    tags: ['burn_salve', 'neutralizing_salve'],
  },
  chalk_pearl_lime: {
    id: 'chalk_pearl_lime',
    index: 4,
    name: 'Chalk Pearl Lime',
    category: 'mineral',
    specificGravity: 1.26,
    baseViscosity: 5.0,
    phShift: 2.8,
    enthalpyDeltaC: -8,
    hardness: 0.65,
    preferredPrep: 'ground_crystal',
    baseColorRgb: [0.92, 0.9, 0.84],
    micaIntensity: 0.3,
    baseCostCrowns: 9,
    tags: ['neutralizing_salve'],
  },
  verdigris_moss_sap: {
    id: 'verdigris_moss_sap',
    index: 5,
    name: 'Verdigris Moss Sap',
    category: 'botanical',
    specificGravity: 1.14,
    baseViscosity: 6.8,
    phShift: -0.9,
    enthalpyDeltaC: -5,
    hardness: 0.2,
    preferredPrep: 'sliced_botanical',
    baseColorRgb: [0.16, 0.62, 0.46],
    micaIntensity: 0.1,
    baseCostCrowns: 7,
    tags: ['burn_salve', 'soothing_draught'],
  },
  saffron_hearth_pollen: {
    id: 'saffron_hearth_pollen',
    index: 6,
    name: 'Saffron Hearth Pollen',
    category: 'botanical',
    specificGravity: 1.08,
    baseViscosity: 3.6,
    phShift: 0.4,
    enthalpyDeltaC: 22,
    hardness: 0.3,
    preferredPrep: 'sliced_botanical',
    baseColorRgb: [0.95, 0.66, 0.12],
    micaIntensity: 0.25,
    baseCostCrowns: 10,
    tags: ['hearth_tonic', 'fire_ward'],
  },
  cobalt_lotus_nectar: {
    id: 'cobalt_lotus_nectar',
    index: 7,
    name: 'Cobalt Lotus Nectar',
    category: 'botanical',
    specificGravity: 1.02,
    baseViscosity: 4.4,
    phShift: 1.1,
    enthalpyDeltaC: -12,
    hardness: 0.18,
    preferredPrep: 'pipette_drops',
    baseColorRgb: [0.18, 0.42, 0.86],
    micaIntensity: 0.2,
    baseCostCrowns: 11,
    tags: ['galaxy_elixir', 'soothing_draught'],
  },
  moonveil_lichen_dew: {
    id: 'moonveil_lichen_dew',
    index: 8,
    name: 'Moonveil Lichen Dew',
    category: 'botanical',
    specificGravity: 0.96,
    baseViscosity: 1.8,
    phShift: -0.3,
    enthalpyDeltaC: -15,
    hardness: 0.15,
    preferredPrep: 'pipette_drops',
    baseColorRgb: [0.58, 0.84, 0.78],
    micaIntensity: 0.4,
    baseCostCrowns: 9,
    tags: ['galaxy_elixir', 'burn_salve'],
  },
  rose_madder_distillate: {
    id: 'rose_madder_distillate',
    index: 9,
    name: 'Rose Madder Distillate',
    category: 'botanical',
    specificGravity: 0.92,
    baseViscosity: 2.1,
    phShift: -1.4,
    enthalpyDeltaC: 6,
    hardness: 0.22,
    preferredPrep: 'sliced_botanical',
    baseColorRgb: [0.78, 0.2, 0.36],
    micaIntensity: 0.2,
    baseCostCrowns: 10,
    tags: ['hearth_tonic', 'soothing_draught'],
  },
  auric_mica_suspension: {
    id: 'auric_mica_suspension',
    index: 10,
    name: 'Auric Mica Suspension',
    category: 'mica',
    specificGravity: 0.88,
    baseViscosity: 2.9,
    phShift: 0.0,
    enthalpyDeltaC: 2,
    hardness: 0.55,
    preferredPrep: 'pipette_drops',
    baseColorRgb: [0.96, 0.82, 0.32],
    micaIntensity: 0.95,
    baseCostCrowns: 16,
    tags: ['galaxy_elixir'],
  },
  starlight_aether_oil: {
    id: 'starlight_aether_oil',
    index: 11,
    name: 'Starlight Aether Oil',
    category: 'oil',
    specificGravity: 0.82,
    baseViscosity: 1.1,
    phShift: 0.8,
    enthalpyDeltaC: -18,
    hardness: 0.12,
    preferredPrep: 'pipette_drops',
    baseColorRgb: [0.46, 0.32, 0.88],
    micaIntensity: 0.75,
    baseCostCrowns: 18,
    tags: ['galaxy_elixir', 'hearth_tonic'],
  },
};

const MIN_TEMP_C = 15;
const MAX_TEMP_C = 115;
const BOIL_OVER_THRESHOLD_C = 98;
const MIN_PH = 1.5;
const MAX_PH = 12.5;
const NEUTRAL_PH = 7.0;
const REFERENCE_DOSE_ML = 25;

const EFFECT_ORDER: readonly PotionEffectTag[] = [
  'fire_ward',
  'burn_salve',
  'hearth_tonic',
  'galaxy_elixir',
  'neutralizing_salve',
  'soothing_draught',
];

const EFFECT_TITLES: Record<PotionEffectTag, string> = {
  fire_ward: 'Fire Ward',
  burn_salve: 'Burn Salve',
  hearth_tonic: 'Hearth Tonic',
  galaxy_elixir: 'Galaxy Elixir',
  neutralizing_salve: 'Neutralizing Salve',
  soothing_draught: 'Soothing Draught',
};

const VESSEL_MULTIPLIERS: Record<PotionVessel, number> = {
  prism: 1.0,
  teardrop: 1.1,
  crescent: 1.2,
  carafe: 1.3,
};

const REAGENT_STRATA_NOUNS: Record<ReagentId, { primary: string; secondary: string }> = {
  amber_honey_resin: { primary: 'Amber', secondary: 'Honey-Resin' },
  cinnabar_sulfur_ash: { primary: 'Cinnabar', secondary: 'Sulfur-Ash' },
  bismuth_vitriol_salt: { primary: 'Bismuth', secondary: 'Vitriol' },
  glacial_alum_shard: { primary: 'Glacial Alum', secondary: 'Alum-Shard' },
  chalk_pearl_lime: { primary: 'Pearl-Lime', secondary: 'Chalk-Lime' },
  verdigris_moss_sap: { primary: 'Verdigris', secondary: 'Moss-Sap' },
  saffron_hearth_pollen: { primary: 'Saffron', secondary: 'Hearth-Pollen' },
  cobalt_lotus_nectar: { primary: 'Cobalt Lotus', secondary: 'Lotus-Nectar' },
  moonveil_lichen_dew: { primary: 'Moonveil', secondary: 'Lichen-Dew' },
  rose_madder_distillate: { primary: 'Rose Madder', secondary: 'Madder-Dew' },
  auric_mica_suspension: { primary: 'Auric Mica', secondary: 'Gold-Mica' },
  starlight_aether_oil: { primary: 'Starlight', secondary: 'Aether-Oil' },
};

const WAX_COLOR_FLAIRS: Record<WaxSealSpec['color'], string> = {
  crimson: 'Crimson',
  verdigris: 'Verdigris',
  gold: 'Gilt',
  indigo: 'Indigo',
};

const CREST_FLAIRS: Record<WaxSealSpec['crest'], string> = {
  phoenix: 'Phoenix',
  alembic: 'Alembic',
  crescent: 'Lunar',
  scales: 'Scales',
};

const VESSEL_FLAIRS: Record<PotionVessel, string> = {
  prism: 'Prism',
  teardrop: 'Teardrop',
  crescent: 'Crescent',
  carafe: 'Carafe',
};

const PH_ANCHOR_STOPS: ReadonlyArray<{ ph: number; rgb: [number, number, number] }> = [
  { ph: 1.5, rgb: [0.88, 0.12, 0.22] },   // crimson acid
  { ph: 3.5, rgb: [0.78, 0.18, 0.44] },   // rose-magenta
  { ph: 5.5, rgb: [0.55, 0.24, 0.68] },   // plum
  { ph: 7.0, rgb: [0.42, 0.28, 0.78] },   // royal violet neutral
  { ph: 8.5, rgb: [0.18, 0.56, 0.64] },   // teal transition
  { ph: 10.0, rgb: [0.14, 0.72, 0.42] },  // emerald alkali
  { ph: 12.5, rgb: [0.88, 0.68, 0.16] },  // amber strong alkali
];

interface InternalLayer extends DensityLayer {
  prepQuality: number;
}

interface PrepMetrics {
  quality: number;
  sharpness: number;
  enthalpyScale: number;
  phScale: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function computePrepMetrics(spec: ReagentSpec, prepForm: PrepForm): PrepMetrics {
  if (prepForm === 'cellar_quintessence') {
    return { quality: 1.0, sharpness: 1.0, enthalpyScale: 1.15, phScale: 1.15 };
  }
  if (prepForm === 'catalyst_salt') {
    return { quality: 1.0, sharpness: 1.0, enthalpyScale: 0.9, phScale: 1.0 };
  }
  if (prepForm === spec.preferredPrep) {
    return { quality: 0.96, sharpness: 0.96, enthalpyScale: 1.0, phScale: 1.0 };
  }
  if (prepForm === 'raw') {
    return { quality: 0.72, sharpness: 0.82, enthalpyScale: 0.9, phScale: 0.9 };
  }
  return { quality: 0.84, sharpness: 0.88, enthalpyScale: 0.95, phScale: 0.95 };
}

function cloneLayer(layer: DensityLayer): DensityLayer {
  return {
    reagentId: layer.reagentId,
    prepForm: layer.prepForm,
    specificGravity: layer.specificGravity,
    volumeMl: layer.volumeMl,
    viscosity: layer.viscosity,
    colorRgb: [layer.colorRgb[0], layer.colorRgb[1], layer.colorRgb[2]],
    micaIntensity: layer.micaIntensity,
    interfaceSharpness: layer.interfaceSharpness,
  };
}

function selectCraftStructureDescriptor(
  state: CauldronFluidState,
  vessel: PotionVessel,
  meanMica: number
): string {
  if (state.marblingIndex >= 0.35) {
    return 'Suminagashi';
  }
  if (state.marblingIndex >= 0.12 || state.meanViscosity >= 8.0) {
    return 'Velvet';
  }
  if (meanMica >= 0.55) {
    return 'Opalescent';
  }
  if (vessel === 'prism' && state.layerCrispness >= 0.72 && state.layers.length >= 2) {
    return 'Prismatic';
  }
  const hasCrystal = state.layers.some(
    (layer) => REAGENT_CATALOG[layer.reagentId].category === 'crystal'
  );
  if (hasCrystal && state.layerCrispness >= 0.7) {
    return 'Crystalline';
  }
  if (meanMica >= 0.38) {
    return 'Opalescent';
  }
  if (state.layers.length >= 3 && state.layerCrispness >= 0.7) {
    return 'Stratified';
  }
  return 'Laminar';
}

function selectThermalPhAccent(
  state: CauldronFluidState,
  peakTempC: number,
  meanMica: number
): string {
  const thermal =
    peakTempC >= 54 || state.temperatureC >= 50
      ? 'Sun-Tempered'
      : state.temperatureC <= 20
        ? 'Rime-Cooled'
        : '';

  const phOrMica =
    state.ph <= 5.5
      ? 'Vitriolic'
      : state.ph >= 8.0
        ? 'Alkali-Balanced'
        : meanMica >= 0.48
          ? 'Mica-Gilt'
          : '';

  if (thermal && phOrMica) {
    return `${thermal} ${phOrMica}`;
  }
  if (thermal || phOrMica) {
    return thermal || phOrMica;
  }
  if (meanMica >= 0.45) {
    return 'Mica-Gilt';
  }
  if (state.ph < 6.5) {
    return 'Vitriolic';
  }
  if (state.ph > 7.4) {
    return 'Alkali-Balanced';
  }
  return peakTempC >= 28 ? 'Sun-Tempered' : 'Rime-Cooled';
}

function formatStrataReagentNouns(layers: readonly DensityLayer[]): string {
  const ranked = [...layers].sort((a, b) => {
    if (Math.abs(b.volumeMl - a.volumeMl) > 1e-6) {
      return b.volumeMl - a.volumeMl;
    }
    return b.specificGravity - a.specificGravity;
  });

  if (ranked.length === 1) {
    return REAGENT_STRATA_NOUNS[ranked[0].reagentId].primary;
  }

  const headNouns = ranked
    .slice(0, Math.min(3, ranked.length - 1))
    .map((layer) => REAGENT_STRATA_NOUNS[layer.reagentId].primary);
  const secondaryNoun = REAGENT_STRATA_NOUNS[ranked[ranked.length - 1].reagentId].secondary;
  return `${headNouns.join(', ')} & ${secondaryNoun}`;
}

function formatCrestVesselFlair(vessel: PotionVessel, seal: WaxSealSpec): string {
  const waxColor = WAX_COLOR_FLAIRS[seal.color];
  const vesselFlair = VESSEL_FLAIRS[vessel];
  if (!seal.stamped) {
    return `(Unsealed ${waxColor} ${vesselFlair})`;
  }
  const crestFlair = CREST_FLAIRS[seal.crest];
  return `(${waxColor} ${crestFlair} ${vesselFlair})`;
}

/**
 * Builds a multi-dimensional evocative apothecary potion name combining craft structure,
 * thermal/pH/mica accent, ranked primary+secondary strata reagent nouns, effect title,
 * and wax-crest/vessel flair.
 */
function buildPotionName(
  state: CauldronFluidState,
  peakTempC: number,
  vessel: PotionVessel,
  seal: WaxSealSpec
): string {
  const effectTitle = EFFECT_TITLES[state.dominantEffect];
  if (state.layers.length === 0) {
    return `Empty ${effectTitle} Vessel`;
  }

  let weightedMica = 0;
  for (const layer of state.layers) {
    weightedMica += layer.micaIntensity * layer.volumeMl;
  }
  const meanMica = state.totalVolumeMl > 0 ? weightedMica / state.totalVolumeMl : 0;

  const structure = selectCraftStructureDescriptor(state, vessel, meanMica);
  const accent = selectThermalPhAccent(state, peakTempC, meanMica);
  const strataNouns = formatStrataReagentNouns(state.layers);
  const flair = formatCrestVesselFlair(vessel, seal);

  return `${structure} ${accent} ${strataNouns} ${effectTitle} ${flair}`;
}

/**
 * Computes a smooth anthocyanin pH indicator RGB color across pH [1.5..12.5]:
 * crimson acid -> violet neutral -> emerald/amber alkali.
 */
export function getPhIndicatorRgb(ph: number): [number, number, number] {
  const safePh = clamp(finiteOr(ph, NEUTRAL_PH), MIN_PH, MAX_PH);

  for (let i = 0; i < PH_ANCHOR_STOPS.length - 1; i++) {
    const lo = PH_ANCHOR_STOPS[i];
    const hi = PH_ANCHOR_STOPS[i + 1];
    if (safePh <= hi.ph) {
      const s = smoothstep01((safePh - lo.ph) / (hi.ph - lo.ph));
      return [
        lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * s,
        lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * s,
        lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * s,
      ];
    }
  }

  const last = PH_ANCHOR_STOPS[PH_ANCHOR_STOPS.length - 1].rgb;
  return [last[0], last[1], last[2]];
}

/**
 * Computes the critical ladle angular velocity (rad/s) above which shear overcomes
 * viscous damping and folds density horizons into Suminagashi marbling ribbons.
 */
export function computeEffectiveShearCrit(meanViscosity: number, tempC: number): number {
  const safeVisc = clamp(finiteOr(meanViscosity, 4.0), 0.5, 25.0);
  const safeTemp = clamp(finiteOr(tempC, 22.0), MIN_TEMP_C, MAX_TEMP_C);
  const thermalThinning = 1 + 0.012 * Math.max(0, safeTemp - MIN_TEMP_C);
  const effectiveViscosity = safeVisc / thermalThinning;
  return clamp(1.5 + 0.48 * effectiveViscosity, 1.2, 18.0);
}

/**
 * Evaluates whether a crafted potion satisfies a guild festival commission
 * and computes its quality bonus multiplier.
 */
export function evaluateCommission(
  potion: CraftedPotion,
  commission: FestivalCommissionSpec
): { satisfied: boolean; bonusMultiplier: number; reason: string } {
  const failures: string[] = [];

  if (potion.dominantEffect !== commission.requiredEffect) {
    failures.push(
      `Effect mismatch: expected ${commission.requiredEffect}, got ${potion.dominantEffect}`
    );
  }
  if (potion.layers.length < commission.minLayers) {
    failures.push(
      `Layer count ${potion.layers.length} below required ${commission.minLayers}`
    );
  }
  if (potion.layerCrispness < commission.minLayerCrispness) {
    failures.push(
      `Layer crispness ${potion.layerCrispness.toFixed(2)} below required ${commission.minLayerCrispness.toFixed(2)}`
    );
  }
  if (potion.purity < commission.minPurity) {
    failures.push(
      `Purity ${potion.purity.toFixed(2)} below required ${commission.minPurity.toFixed(2)}`
    );
  }
  if (commission.targetPh) {
    const [minPh, maxPh] = commission.targetPh;
    if (potion.ph < minPh || potion.ph > maxPh) {
      failures.push(
        `pH ${potion.ph.toFixed(2)} outside target range [${minPh.toFixed(2)}, ${maxPh.toFixed(2)}]`
      );
    }
  }
  if (commission.minPeakTempC !== undefined && potion.peakTempC < commission.minPeakTempC) {
    failures.push(
      `Peak temperature ${potion.peakTempC.toFixed(1)}C below required ${commission.minPeakTempC.toFixed(1)}C`
    );
  }

  if (failures.length > 0) {
    return {
      satisfied: false,
      bonusMultiplier: 0,
      reason: failures.join('; '),
    };
  }

  const purityMargin = Math.max(0, potion.purity - commission.minPurity);
  const sealBonus = potion.seal.stamped ? 0.1 : 0;
  const bonusMultiplier = Number(
    clamp(1.0 + 0.25 * purityMargin + 0.25 * potion.collectorBrilliance + sealBonus, 1.0, 1.6).toFixed(3)
  );

  return {
    satisfied: true,
    bonusMultiplier,
    reason: `Satisfied ${commission.title} (${commission.tier}) specifications`,
  };
}

/**
 * Deterministic STEM fluid & reaction cauldron simulator modeling specific-gravity
 * layer sorting, volume conservation, enthalpy dynamics, pH shifts, and ladle shear thresholds.
 */
export class CauldronSimulator {
  private mode: GameMode;
  private ambientTempC = 22;
  private temperatureC = 22;
  private peakTempC = 22;
  private ph = NEUTRAL_PH;
  private angularVelocityRadS = 0;
  private marblingIndex = 0;
  private boilOverPenalty = 0;
  private layers: InternalLayer[] = [];
  private potionSeq = 0;

  constructor(mode: GameMode = 'apprentice') {
    this.mode = mode;
    this.reset(22);
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
  }

  reset(ambientTempC = 22): void {
    const safeAmbient = clamp(finiteOr(ambientTempC, 22), MIN_TEMP_C, MAX_TEMP_C);
    this.ambientTempC = safeAmbient;
    this.temperatureC = safeAmbient;
    this.peakTempC = safeAmbient;
    this.ph = NEUTRAL_PH;
    this.angularVelocityRadS = 0;
    this.marblingIndex = 0;
    this.boilOverPenalty = 0;
    this.layers = [];
  }

  addReagent(reagentId: ReagentId, prepForm: PrepForm, volumeMl = REFERENCE_DOSE_ML): CauldronFluidState {
    const spec = REAGENT_CATALOG[reagentId];
    if (!Number.isFinite(volumeMl) || volumeMl <= 0) {
      return this.getState();
    }

    const addedMl = volumeMl;
    const prevVol = this.computeTotalVolume();
    const metrics = computePrepMetrics(spec, prepForm);
    const thermalDamping = 1 / (1 + 0.002 * prevVol);
    const doseFactor = addedMl / REFERENCE_DOSE_ML;

    const deltaTemp = spec.enthalpyDeltaC * doseFactor * metrics.enthalpyScale * thermalDamping;
    const deltaPh = spec.phShift * doseFactor * metrics.phScale * thermalDamping;

    this.temperatureC = clamp(this.temperatureC + deltaTemp, MIN_TEMP_C, MAX_TEMP_C);
    this.peakTempC = Math.max(this.peakTempC, this.temperatureC);
    this.ph = clamp(this.ph + deltaPh, MIN_PH, MAX_PH);

    const existing = this.layers.find((layer) => layer.reagentId === reagentId);
    if (existing) {
      const combinedMl = existing.volumeMl + addedMl;
      const wPrev = existing.volumeMl / combinedMl;
      const wNew = addedMl / combinedMl;
      existing.volumeMl = combinedMl;
      existing.viscosity = existing.viscosity * wPrev + spec.baseViscosity * wNew;
      existing.interfaceSharpness = existing.interfaceSharpness * wPrev + metrics.sharpness * wNew;
      existing.prepQuality = existing.prepQuality * wPrev + metrics.quality * wNew;
      existing.colorRgb = [
        existing.colorRgb[0] * wPrev + spec.baseColorRgb[0] * wNew,
        existing.colorRgb[1] * wPrev + spec.baseColorRgb[1] * wNew,
        existing.colorRgb[2] * wPrev + spec.baseColorRgb[2] * wNew,
      ];
      if (prepForm === 'cellar_quintessence' || prepForm === 'catalyst_salt') {
        existing.prepForm = prepForm;
      }
    } else {
      this.layers.push({
        reagentId,
        prepForm,
        specificGravity: spec.specificGravity,
        volumeMl: addedMl,
        viscosity: spec.baseViscosity,
        colorRgb: [spec.baseColorRgb[0], spec.baseColorRgb[1], spec.baseColorRgb[2]],
        micaIntensity: spec.micaIntensity,
        interfaceSharpness: metrics.sharpness,
        prepQuality: metrics.quality,
      });
    }

    this.sortLayersBySpecificGravity();
    this.evaluateThermalRunaway();
    return this.getState();
  }

  pumpBellows(impulse = 1.0): CauldronFluidState {
    const safeImpulse = clamp(finiteOr(impulse, 1.0), 0, 5);
    if (safeImpulse <= 0) {
      return this.getState();
    }

    const totalVol = this.computeTotalVolume();
    const massFactor = 1 / (1 + 0.0015 * totalVol);
    this.temperatureC = clamp(this.temperatureC + 14 * safeImpulse * massFactor, MIN_TEMP_C, MAX_TEMP_C);
    this.peakTempC = Math.max(this.peakTempC, this.temperatureC);

    this.evaluateThermalRunaway();
    return this.getState();
  }

  applyLadleStir(angularVelocityRadS: number, dtSec: number): CauldronFluidState {
    const safeOmega = clamp(finiteOr(angularVelocityRadS, 0), -50, 50);
    const safeDt = clamp(finiteOr(dtSec, 0), 0, 10);
    this.angularVelocityRadS = safeOmega;

    if (safeDt <= 0 || this.layers.length === 0) {
      return this.getState();
    }

    const absOmega = Math.abs(safeOmega);
    const shearCrit = computeEffectiveShearCrit(this.computeMeanViscosity(), this.temperatureC);

    if (absOmega <= shearCrit) {
      // Gentle laminar stirring maintains crisp specific-gravity horizons.
      const gentleRatio = absOmega / Math.max(0.1, shearCrit);
      const slightMotion = clamp(gentleRatio * 0.015 * safeDt, 0, 0.03);
      this.marblingIndex = clamp(this.marblingIndex + slightMotion * (1 - this.marblingIndex), 0, 0.08);
    } else {
      // Supercritical shear folds interfaces into Suminagashi marbling ribbons.
      const excessRatio = (absOmega - shearCrit) / Math.max(0.5, shearCrit);
      const foldProgress = 1 - Math.exp(-0.75 * excessRatio * safeDt);
      this.marblingIndex = clamp(this.marblingIndex + (1 - this.marblingIndex) * foldProgress, 0, 1);

      const sharpnessLoss = clamp(0.65 * foldProgress, 0, 0.85);
      for (const layer of this.layers) {
        layer.interfaceSharpness = clamp(layer.interfaceSharpness * (1 - sharpnessLoss), 0.05, 1);
      }
    }

    return this.getState();
  }

  stepCooling(dtSec: number): CauldronFluidState {
    const safeDt = clamp(finiteOr(dtSec, 0), 0, 3600);
    if (safeDt <= 0) {
      return this.getState();
    }

    const coolingRate = 0.08;
    this.temperatureC = clamp(
      this.ambientTempC + (this.temperatureC - this.ambientTempC) * Math.exp(-coolingRate * safeDt),
      MIN_TEMP_C,
      MAX_TEMP_C
    );

    const meanVisc = this.computeMeanViscosity();
    this.angularVelocityRadS *= Math.exp(-0.5 * meanVisc * safeDt);
    if (Math.abs(this.angularVelocityRadS) < 1e-4) {
      this.angularVelocityRadS = 0;
    }

    return this.getState();
  }

  getState(): CauldronFluidState {
    const totalVolumeMl = this.computeTotalVolume();
    const meanViscosity = this.computeMeanViscosity();
    const shearCritRadS = computeEffectiveShearCrit(meanViscosity, this.temperatureC);
    const layerCrispness = this.computeLayerCrispness(totalVolumeMl);
    const purity = this.computePurity(totalVolumeMl);
    const collectorBrilliance = this.computeCollectorBrilliance(totalVolumeMl, layerCrispness, purity);

    return {
      temperatureC: this.temperatureC,
      ph: this.ph,
      totalVolumeMl,
      meanViscosity,
      angularVelocityRadS: this.angularVelocityRadS,
      shearCritRadS,
      marblingIndex: this.marblingIndex,
      layerCrispness,
      purity,
      collectorBrilliance,
      boilOverPenalty: this.boilOverPenalty,
      dominantEffect: this.computeDominantEffect(),
      layers: this.layers.map((layer) => cloneLayer(layer)),
      phIndicatorRgb: getPhIndicatorRgb(this.ph),
    };
  }

  decantToPotion(vessel: PotionVessel, seal: WaxSealSpec, day: number, id?: string): CraftedPotion {
    const state = this.getState();
    const potionId = id ?? `potion-${day}-${++this.potionSeq}`;
    const effectTitle = EFFECT_TITLES[state.dominantEffect];

    let name = `Empty ${effectTitle} Vessel`;
    let baseValueCrowns = 1;

    if (state.layers.length > 0) {
      name = buildPotionName(state, this.peakTempC, vessel, seal);

      let reagentValue = 0;
      for (const layer of state.layers) {
        const spec = REAGENT_CATALOG[layer.reagentId];
        reagentValue += spec.baseCostCrowns * (layer.volumeMl / REFERENCE_DOSE_ML);
      }

      const qualityScale = 0.65 + 0.75 * state.purity + 0.45 * state.collectorBrilliance;
      const vesselScale = VESSEL_MULTIPLIERS[vessel];
      const sealScale = seal.stamped ? 1.1 : 1.0;
      baseValueCrowns = Math.max(1, Math.round(reagentValue * qualityScale * vesselScale * sealScale));
    }

    return {
      id: potionId,
      name,
      vessel,
      seal: { color: seal.color, crest: seal.crest, stamped: seal.stamped },
      layers: state.layers.map((layer) => cloneLayer(layer)),
      purity: state.purity,
      marblingIndex: state.marblingIndex,
      layerCrispness: state.layerCrispness,
      collectorBrilliance: state.collectorBrilliance,
      ph: state.ph,
      peakTempC: this.peakTempC,
      dominantEffect: state.dominantEffect,
      baseValueCrowns,
      createdAtDay: day,
    };
  }

  private sortLayersBySpecificGravity(): void {
    this.layers.sort((a, b) => {
      if (b.specificGravity !== a.specificGravity) {
        return b.specificGravity - a.specificGravity;
      }
      return REAGENT_CATALOG[a.reagentId].index - REAGENT_CATALOG[b.reagentId].index;
    });
  }

  private evaluateThermalRunaway(): void {
    if (this.temperatureC <= BOIL_OVER_THRESHOLD_C) {
      return;
    }

    const excess = this.temperatureC - BOIL_OVER_THRESHOLD_C;
    if (this.mode === 'apprentice') {
      // Apprentice safety collar vents steam without penalizing potion purity or triggering boil-over.
      return;
    }

    // Grandmaster exothermic runaway incurs immediate boil-over degradation and disturbs layers.
    const severity = clamp(0.18 + (excess / (MAX_TEMP_C - BOIL_OVER_THRESHOLD_C)) * 0.65, 0, 1);
    this.boilOverPenalty = clamp(Math.max(this.boilOverPenalty, severity), 0, 1);
    this.marblingIndex = clamp(this.marblingIndex + severity * 0.25, 0, 1);
    for (const layer of this.layers) {
      layer.interfaceSharpness = clamp(layer.interfaceSharpness * (1 - severity * 0.45), 0.05, 1);
    }
  }

  private computeTotalVolume(): number {
    let total = 0;
    for (const layer of this.layers) {
      total += layer.volumeMl;
    }
    return total;
  }

  private computeMeanViscosity(): number {
    const total = this.computeTotalVolume();
    if (total <= 0) {
      return 1.0;
    }
    let weighted = 0;
    for (const layer of this.layers) {
      weighted += layer.viscosity * layer.volumeMl;
    }
    return clamp(weighted / total, 0.5, 25.0);
  }

  private computeLayerCrispness(totalVolumeMl: number): number {
    if (totalVolumeMl <= 0 || this.layers.length === 0) {
      return 1.0;
    }
    let weightedSharpness = 0;
    for (const layer of this.layers) {
      weightedSharpness += layer.interfaceSharpness * layer.volumeMl;
    }
    const baseSharpness = weightedSharpness / totalVolumeMl;
    const shearBlur = 1 - this.marblingIndex * 0.72;
    const boilBlur = 1 - this.boilOverPenalty * 0.55;
    return clamp(baseSharpness * shearBlur * boilBlur, 0, 1);
  }

  private computePurity(totalVolumeMl: number): number {
    if (totalVolumeMl <= 0 || this.layers.length === 0) {
      return 1.0;
    }
    let weightedPrep = 0;
    for (const layer of this.layers) {
      weightedPrep += layer.prepQuality * layer.volumeMl;
    }
    const basePrepPurity = weightedPrep / totalVolumeMl;
    const boilLoss = this.boilOverPenalty * 0.65;
    const overStirPenalty =
      this.mode === 'grandmaster' && this.marblingIndex > 0.9
        ? (this.marblingIndex - 0.9) * 1.5
        : 0;
    return clamp(basePrepPurity - boilLoss - overStirPenalty, 0, 1);
  }

  private computeCollectorBrilliance(
    totalVolumeMl: number,
    layerCrispness: number,
    purity: number
  ): number {
    if (totalVolumeMl <= 0 || this.layers.length === 0) {
      return 0;
    }

    let weightedMica = 0;
    for (const layer of this.layers) {
      weightedMica += layer.micaIntensity * layer.volumeMl;
    }
    const meanMica = weightedMica / totalVolumeMl;
    const layerRichness = Math.min(1, this.layers.length / 4);
    const marblingAesthetic = 0.85 * Math.sin(Math.PI * Math.min(1, this.marblingIndex));
    const opticalClarity = Math.max(layerCrispness, marblingAesthetic);

    const raw =
      purity * 0.35 +
      layerRichness * 0.25 +
      opticalClarity * 0.25 +
      meanMica * 0.15 -
      this.boilOverPenalty * 0.5;
    return clamp(raw, 0, 1);
  }

  private computeDominantEffect(): PotionEffectTag {
    if (this.layers.length === 0) {
      return 'soothing_draught';
    }

    const scores: Record<PotionEffectTag, number> = {
      fire_ward: 0,
      burn_salve: 0,
      hearth_tonic: 0,
      galaxy_elixir: 0,
      neutralizing_salve: 0,
      soothing_draught: 0,
    };

    for (const layer of this.layers) {
      const spec = REAGENT_CATALOG[layer.reagentId];
      const layerStrength = layer.volumeMl * (0.7 + 0.3 * layer.prepQuality);
      for (let i = 0; i < spec.tags.length; i++) {
        const tag = spec.tags[i];
        const tagWeight = i === 0 ? 1.0 : 0.85;
        scores[tag] += layerStrength * tagWeight;
      }
    }

    let bestTag: PotionEffectTag = 'soothing_draught';
    let bestScore = -1;
    for (const tag of EFFECT_ORDER) {
      if (scores[tag] > bestScore) {
        bestScore = scores[tag];
        bestTag = tag;
      }
    }
    return bestTag;
  }
}

const ALL_COMMISSION_REGIMES: readonly CommissionRegime[] = [
  'calm',
  'dragon_siege',
  'bumper_harvest',
  'glacial_snap',
  'starfall_conclave',
];

const TIER_ORDER: readonly FestivalCommissionSpec['tier'][] = [
  'apprentice',
  'journeyman',
  'grandmaster',
];

interface CommissionFamilySeed {
  effect: PotionEffectTag;
  slug: string;
  alignedRegimes: readonly CommissionRegime[];
  phCenter: number;
  reagentCue: string;
  titles: readonly [string, string, string];
}

interface ProceduralCommissionEntry {
  spec: FestivalCommissionSpec;
  slug: string;
  alignedRegimes: readonly CommissionRegime[];
}

const COMMISSION_FAMILIES: readonly CommissionFamilySeed[] = [
  // fire_ward (6 families -> 18 trials)
  {
    effect: 'fire_ward',
    slug: 'cinnabar-bastion',
    alignedRegimes: ['dragon_siege', 'calm'],
    phCenter: 3.25,
    reagentCue: 'cinnabar ash and bismuth vitriol',
    titles: ['Squire Cinnabar Ward', 'Bastion-Gate Fire Ward', 'Imperial Drakefire Ward'],
  },
  {
    effect: 'fire_ward',
    slug: 'saffron-bulwark',
    alignedRegimes: ['dragon_siege', 'glacial_snap'],
    phCenter: 5.35,
    reagentCue: 'cinnabar sulfur and saffron pollen',
    titles: ['Kindled Saffron Screen', 'Hearth-Wrought Flame Bulwark', 'Solar Pyre Ward'],
  },
  {
    effect: 'fire_ward',
    slug: 'chalk-buffered-aegis',
    alignedRegimes: ['dragon_siege', 'calm'],
    phCenter: 7.3,
    reagentCue: 'lime-buffered cinnabar and hearth pollen',
    titles: ['Lime-Tempered Hearth Shield', 'Garrison Cinder Aegis', 'Citadel Crucible Ward'],
  },
  {
    effect: 'fire_ward',
    slug: 'vitriol-mantle',
    alignedRegimes: ['dragon_siege'],
    phCenter: 3.0,
    reagentCue: 'vitriol salt and red sulfur ash',
    titles: ['Vitriol Spark Mantle', 'Red-Ash Rampart Ward', 'Archmage Salamander Mantle'],
  },
  {
    effect: 'fire_ward',
    slug: 'mica-ember-screen',
    alignedRegimes: ['dragon_siege', 'starfall_conclave'],
    phCenter: 5.8,
    reagentCue: 'cinnabar, saffron, and suspended mica',
    titles: ['Gilt-Fleck Ember Screen', 'Prismatic Ember Ward', 'Astral Forge-Guard Aegis'],
  },
  {
    effect: 'fire_ward',
    slug: 'lime-quarry-ward',
    alignedRegimes: ['dragon_siege', 'bumper_harvest'],
    phCenter: 8.05,
    reagentCue: 'cinnabar, saffron, and pearl lime',
    titles: ['Quarry-Lime Smoke Ward', 'Kiln-Master Flame Shield', 'Sovereign Siege Ward'],
  },

  // burn_salve (6 families -> 18 trials)
  {
    effect: 'burn_salve',
    slug: 'alum-moss-poultice',
    alignedRegimes: ['dragon_siege', 'bumper_harvest'],
    phCenter: 8.0,
    reagentCue: 'glacial alum and verdigris moss sap',
    titles: ['Moss-Coolant Poultice', 'Warden Alum-Moss Salve', 'Grand Apothecary Burn Balm'],
  },
  {
    effect: 'burn_salve',
    slug: 'glacial-soothe-balm',
    alignedRegimes: ['dragon_siege', 'glacial_snap'],
    phCenter: 9.0,
    reagentCue: 'glacial alum shard with pearl lime',
    titles: ['Rime-Shard Relief Balm', 'Alkali Frost-Mend Salve', 'Glacier-Heart Burn Unguent'],
  },
  {
    effect: 'burn_salve',
    slug: 'verdigris-lichen-cream',
    alignedRegimes: ['bumper_harvest', 'calm'],
    phCenter: 5.6,
    reagentCue: 'verdigris moss and moonveil lichen',
    titles: ['Verdigris Canopy Cream', 'Herbalist Soothe-Lichen Salve', 'Emerald Dew Burn Restore'],
  },
  {
    effect: 'burn_salve',
    slug: 'quenched-cinnabar-unguent',
    alignedRegimes: ['dragon_siege'],
    phCenter: 4.4,
    reagentCue: 'quenched cinnabar, moss sap, and moonveil',
    titles: ['Quenched Ash Ointment', 'Scorched-Banner Burn Salve', 'Phoenix-Ash Healing Unguent'],
  },
  {
    effect: 'burn_salve',
    slug: 'moonveil-frost-salve',
    alignedRegimes: ['glacial_snap', 'starfall_conclave'],
    phCenter: 7.7,
    reagentCue: 'glacial alum, moonveil dew, and moss sap',
    titles: ['Moonveil Cool Draught-Salve', 'Twilight Rime Burn Salve', 'Aurora Frost-Silk Unguent'],
  },
  {
    effect: 'burn_salve',
    slug: 'drake-ash-liniment',
    alignedRegimes: ['dragon_siege', 'calm'],
    phCenter: 6.5,
    reagentCue: 'alum-quenched cinnabar and moss sap',
    titles: ['Field-Medic Ash Liniment', 'Forge-Coolant Burn Salve', 'Dragonscale Mender Liniment'],
  },

  // hearth_tonic (6 families -> 18 trials)
  {
    effect: 'hearth_tonic',
    slug: 'saffron-madder-cordial',
    alignedRegimes: ['glacial_snap', 'calm'],
    phCenter: 6.3,
    reagentCue: 'saffron pollen and rose madder distillate',
    titles: ['Winter-Watch Saffron Tonic', 'Madder-Ember Hearth Cordial', 'Sovereign Hearthfire Tonic'],
  },
  {
    effect: 'hearth_tonic',
    slug: 'solstice-hearth-reserve',
    alignedRegimes: ['glacial_snap', 'starfall_conclave'],
    phCenter: 6.5,
    reagentCue: 'saffron, rose madder, and starlight aether',
    titles: ['Solstice Lantern Draught', 'Frost-Ferry Hearth Tonic', 'Solstice Crown-Hearth Reserve'],
  },
  {
    effect: 'hearth_tonic',
    slug: 'crimson-rose-infusion',
    alignedRegimes: ['glacial_snap', 'bumper_harvest'],
    phCenter: 4.8,
    reagentCue: 'rose madder distillate and saffron pollen',
    titles: ['Steeped Rose-Pollen Cup', 'Crimson Hearth Infusion', 'Ruby Crucible Warmth Tonic'],
  },
  {
    effect: 'hearth_tonic',
    slug: 'astral-ember-nectar',
    alignedRegimes: ['starfall_conclave', 'glacial_snap'],
    phCenter: 8.4,
    reagentCue: 'saffron pollen, starlight oil, and pearl lime',
    titles: ['Star-Warmth Nectar', 'Twilight Conclave Hearth Tonic', 'Celestial Kiln-Pulse Reserve'],
  },
  {
    effect: 'hearth_tonic',
    slug: 'amber-pollen-brew',
    alignedRegimes: ['glacial_snap', 'bumper_harvest'],
    phCenter: 5.6,
    reagentCue: 'amber resin, saffron, and rose madder',
    titles: ['Honey-Pollen Morning Brew', 'Amber-Vein Hearth Tonic', 'Golden Comb Winter Elixir'],
  },
  {
    effect: 'hearth_tonic',
    slug: 'gilded-hearth-elixir',
    alignedRegimes: ['starfall_conclave', 'calm'],
    phCenter: 7.2,
    reagentCue: 'saffron, madder distillate, and starlight',
    titles: ['Gilt-Spiced Warming Phial', 'Auric Hearthlight Tonic', 'Sun-Throne Hearth Elixir'],
  },

  // galaxy_elixir (6 families -> 18 trials)
  {
    effect: 'galaxy_elixir',
    slug: 'celestial-strata-draft',
    alignedRegimes: ['starfall_conclave', 'calm'],
    phCenter: 8.6,
    reagentCue: 'cobalt lotus, auric mica, and starlight oil',
    titles: ['Starlight Novice Draft', 'Obsidian Sky-Strata Elixir', 'Conclave Zenith Galaxy Elixir'],
  },
  {
    effect: 'galaxy_elixir',
    slug: 'moonveil-aurora-vial',
    alignedRegimes: ['starfall_conclave', 'bumper_harvest'],
    phCenter: 7.7,
    reagentCue: 'cobalt lotus, moonveil dew, and auric mica',
    titles: ['Moonveil Dew Phial', 'Aurora Horizon Elixir', 'Boreal Crown Galaxy Elixir'],
  },
  {
    effect: 'galaxy_elixir',
    slug: 'crimson-comet-tincture',
    alignedRegimes: ['starfall_conclave', 'glacial_snap'],
    phCenter: 5.7,
    reagentCue: 'moonveil, auric mica, and rose madder',
    titles: ['Red-Comet Tincture', 'Nebula-Rose Star Elixir', 'Supernova Prism Elixir'],
  },
  {
    effect: 'galaxy_elixir',
    slug: 'high-conclave-alkali',
    alignedRegimes: ['starfall_conclave'],
    phCenter: 10.1,
    reagentCue: 'cobalt lotus, starlight oil, and pearl lime',
    titles: ['Lotus-Alkali Sky Phial', 'Astronomer Alkali Elixir', 'High Conclave Sovereign Vial'],
  },
  {
    effect: 'galaxy_elixir',
    slug: 'nebula-lotus-phial',
    alignedRegimes: ['starfall_conclave', 'calm'],
    phCenter: 7.0,
    reagentCue: 'moonveil lichen, auric mica, and starlight',
    titles: ['Lichen-Mist Stargaze Brew', 'Cobalt Nebula Elixir', 'Astral Lattice Masterwork'],
  },
  {
    effect: 'galaxy_elixir',
    slug: 'gilded-zenith-ampoule',
    alignedRegimes: ['starfall_conclave', 'calm'],
    phCenter: 5.1,
    reagentCue: 'auric mica, moonveil dew, and bismuth salt',
    titles: ['Mica-Dust Night Ampoule', 'Gilded Comet-Tail Elixir', 'Aether-Crown Galaxy Ampoule'],
  },

  // neutralizing_salve (6 families -> 18 trials)
  {
    effect: 'neutralizing_salve',
    slug: 'bismuth-lime-buffer',
    alignedRegimes: ['calm', 'bumper_harvest'],
    phCenter: 7.3,
    reagentCue: 'bismuth vitriol and chalk pearl lime',
    titles: ['Apprentice Litmus Buffer', 'Scales-Guild Lime Salve', 'Equilibrium Master Buffer'],
  },
  {
    effect: 'neutralizing_salve',
    slug: 'acid-quench-unguent',
    alignedRegimes: ['dragon_siege', 'calm'],
    phCenter: 5.0,
    reagentCue: 'bismuth vitriol tempered with pearl lime',
    titles: ['Vitriol Taming Paste', 'Mine-Fume Neutralizer', 'Deep-Shaft Acid Quencher'],
  },
  {
    effect: 'neutralizing_salve',
    slug: 'pearl-alum-alkali',
    alignedRegimes: ['bumper_harvest', 'calm'],
    phCenter: 9.4,
    reagentCue: 'chalk pearl lime and glacial alum shard',
    titles: ['Chalk-Alum Wash', 'Alkali Stone-Wash Salve', 'White-Pearl Neutralizing Balm'],
  },
  {
    effect: 'neutralizing_salve',
    slug: 'vitriol-ash-neutralizer',
    alignedRegimes: ['dragon_siege', 'bumper_harvest'],
    phCenter: 6.1,
    reagentCue: 'bismuth salt, pearl lime, and glacial alum',
    titles: ['Ash-Salt Balance Salve', 'Crucible-Cleanse Neutralizer', 'Royal Assay Scales Salve'],
  },
  {
    effect: 'neutralizing_salve',
    slug: 'lime-crystal-salve',
    alignedRegimes: ['bumper_harvest', 'starfall_conclave'],
    phCenter: 9.8,
    reagentCue: 'chalk pearl lime, glacial alum, and bismuth',
    titles: ['Pearl-Crystal Tincture', 'Alkali-Horizon Salve', 'Crystalline Caustic Counter'],
  },
  {
    effect: 'neutralizing_salve',
    slug: 'apothecary-scales-balm',
    alignedRegimes: ['calm', 'dragon_siege'],
    phCenter: 7.0,
    reagentCue: 'calibrated bismuth vitriol and pearl lime',
    titles: ['Plum-Violet Test Salve', 'Twin-Pan Equilibrium Balm', 'Exact-Neutral Guild Standard'],
  },

  // soothing_draught (6 families -> 18 trials)
  {
    effect: 'soothing_draught',
    slug: 'amber-lotus-draft',
    alignedRegimes: ['calm', 'bumper_harvest'],
    phCenter: 7.4,
    reagentCue: 'amber honey resin and cobalt lotus nectar',
    titles: ['Amber-Lotus Nightcap', 'Velvet Sleep Draught', 'Archon Repose Soothing Draft'],
  },
  {
    effect: 'soothing_draught',
    slug: 'moss-honey-syrup',
    alignedRegimes: ['bumper_harvest', 'glacial_snap'],
    phCenter: 5.5,
    reagentCue: 'amber honey resin and verdigris moss sap',
    titles: ['Honey-Moss Syrup', 'Orchard Quietude Draught', 'Verdant Velvet Somnolence'],
  },
  {
    effect: 'soothing_draught',
    slug: 'velvet-rose-cordial',
    alignedRegimes: ['glacial_snap', 'bumper_harvest'],
    phCenter: 4.4,
    reagentCue: 'amber resin, moss sap, and rose madder',
    titles: ['Rose-Honey Calming Cup', 'Crimson Velvet Draught', 'Nectar-of-Rest Grand Cordial'],
  },
  {
    effect: 'soothing_draught',
    slug: 'lotus-honey-emulsion',
    alignedRegimes: ['bumper_harvest', 'glacial_snap'],
    phCenter: 8.6,
    reagentCue: 'amber resin, cobalt lotus, and pearl lime',
    titles: ['Sweet-Lotus Emulsion', 'Lotus-Amber Peace Vial', 'Moonlit Pavilion Emulsion'],
  },
  {
    effect: 'soothing_draught',
    slug: 'slumber-botanical-nectar',
    alignedRegimes: ['calm', 'bumper_harvest'],
    phCenter: 6.4,
    reagentCue: 'amber honey, verdigris sap, and cobalt lotus',
    titles: ['Meadow-Sap Nectar', 'Botanical Stillness Draught', 'Sanctuary Four-Herb Quietude'],
  },
  {
    effect: 'soothing_draught',
    slug: 'nightshade-balm-draught',
    alignedRegimes: ['starfall_conclave', 'calm'],
    phCenter: 7.7,
    reagentCue: 'amber honey, cobalt lotus, and starlight oil',
    titles: ['Dusk-Aether Calming Vial', 'Starlit Velvet Draught', 'Astral Repose Soothing Draft'],
  },
];

function hashSeedUint32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashHex6(input: string): string {
  return hashSeedUint32(input).toString(16).padStart(8, '0').slice(0, 6);
}

function roundTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRomanNumeral(n: number): string {
  const numerals: ReadonlyArray<readonly [number, string]> = [
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rem = Math.max(1, Math.floor(n));
  let out = '';
  for (const [val, sym] of numerals) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out;
}

function buildProceduralCommissionCatalog(): readonly ProceduralCommissionEntry[] {
  const entries: ProceduralCommissionEntry[] = [];

  for (let familyIdx = 0; familyIdx < COMMISSION_FAMILIES.length; familyIdx++) {
    const family = COMMISSION_FAMILIES[familyIdx];
    for (let tierIdx = 0; tierIdx < TIER_ORDER.length; tierIdx++) {
      const tier = TIER_ORDER[tierIdx];
      const minLayers =
        tierIdx === 0 ? 2 : tierIdx === 1 ? 3 : familyIdx % 2 === 0 ? 4 : 3;
      const minLayerCrispness =
        tierIdx === 0
          ? roundTwoDecimals(0.55 + (familyIdx % 5) * 0.03)
          : tierIdx === 1
            ? roundTwoDecimals(0.68 + (familyIdx % 5) * 0.02)
            : roundTwoDecimals(0.79 + (familyIdx % 4) * 0.02);
      const minPurity =
        tierIdx === 0
          ? roundTwoDecimals(0.68 + (familyIdx % 4) * 0.02)
          : tierIdx === 1
            ? roundTwoDecimals(0.76 + (familyIdx % 4) * 0.02)
            : roundTwoDecimals(0.84 + (familyIdx % 3) * 0.02);
      const minPeakTempC =
        tierIdx === 0
          ? 45 + (familyIdx % 5) * 2
          : tierIdx === 1
            ? 56 + (familyIdx % 6) * 2
            : 68 + (familyIdx % 6) * 2;
      const phHalfWidth = tierIdx === 0 ? 1.5 : tierIdx === 1 ? 1.1 : 0.85;
      const phLow = roundTwoDecimals(clamp(family.phCenter - phHalfWidth, 2.2, 10.2));
      const phHigh = roundTwoDecimals(clamp(family.phCenter + phHalfWidth, 3.2, 11.2));
      const rewardCrowns =
        tierIdx === 0
          ? 46 + (familyIdx % 6) * 4
          : tierIdx === 1
            ? 92 + (familyIdx % 6) * 7
            : 172 + (familyIdx % 6) * 12 + (minLayers === 4 ? 14 : 0);

      const id = `proc-${tier}-${family.slug}-${hashHex6(`${tier}:${family.slug}:${family.effect}`)}`;
      const description =
        `Brew ${minLayers}+ crisp strata of ${family.reagentCue} past ${minPeakTempC} C ` +
        `within pH ${phLow.toFixed(1)}-${phHigh.toFixed(1)}.`;

      entries.push({
        slug: family.slug,
        alignedRegimes: family.alignedRegimes,
        spec: {
          id,
          tier,
          title: family.titles[tierIdx],
          description,
          requiredEffect: family.effect,
          minLayers,
          minLayerCrispness,
          minPurity,
          targetPh: [phLow, phHigh],
          minPeakTempC,
          rewardCrowns,
        },
      });
    }
  }

  return entries;
}

const PROCEDURAL_COMMISSION_CATALOG: readonly ProceduralCommissionEntry[] =
  buildProceduralCommissionCatalog();

function cloneCommissionSpec(spec: FestivalCommissionSpec): FestivalCommissionSpec {
  return {
    ...spec,
    targetPh: spec.targetPh ? [spec.targetPh[0], spec.targetPh[1]] : undefined,
  };
}

function buildWaveCommission(
  base: ProceduralCommissionEntry,
  wave: number
): FestivalCommissionSpec {
  const waveTag = `w${wave}`;
  const hash = hashHex6(`${base.spec.id}:${waveTag}`);
  return {
    ...cloneCommissionSpec(base.spec),
    id: `proc-${base.spec.tier}-${base.slug}-${waveTag}-${hash}`,
    title: `${base.spec.title} (${toRomanNumeral(wave + 1)} Charter)`,
  };
}

function pickFromPool(
  pool: readonly ProceduralCommissionEntry[],
  tier: FestivalCommissionSpec['tier'],
  safeRegime: CommissionRegime,
  completedSet: ReadonlySet<string>,
  pickedIds: ReadonlySet<string>,
  pickedTitles: ReadonlySet<string>,
  usedEffects: ReadonlySet<PotionEffectTag>
): FestivalCommissionSpec | null {
  const tierPool = pool.filter((entry) => entry.spec.tier === tier);

  const passes = [
    (entry: ProceduralCommissionEntry) =>
      entry.alignedRegimes.includes(safeRegime) && !usedEffects.has(entry.spec.requiredEffect),
    (entry: ProceduralCommissionEntry) => entry.alignedRegimes.includes(safeRegime),
    (entry: ProceduralCommissionEntry) => !usedEffects.has(entry.spec.requiredEffect),
    () => true,
  ];

  for (const predicate of passes) {
    for (const entry of tierPool) {
      if (
        !completedSet.has(entry.spec.id) &&
        !pickedIds.has(entry.spec.id) &&
        !pickedTitles.has(entry.spec.title) &&
        predicate(entry)
      ) {
        return cloneCommissionSpec(entry.spec);
      }
    }
  }

  // Endless deterministic charter waves if all base trials for this tier were already completed.
  for (let wave = 1; wave <= 64; wave++) {
    for (const entry of tierPool) {
      const candidate = buildWaveCommission(entry, wave);
      if (
        !completedSet.has(candidate.id) &&
        !pickedIds.has(candidate.id) &&
        !pickedTitles.has(candidate.title)
      ) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Generates deterministic, non-repeating, chemically solvable guild commissions from a
 * 108-trial catalog across all 6 PotionEffectTags and 5 MarketRegimes.
 */
export function generateProceduralCommissions(
  opts: ProceduralCommissionOptions
): FestivalCommissionSpec[] {
  const safeRegime: CommissionRegime = ALL_COMMISSION_REGIMES.includes(opts.regime)
    ? opts.regime
    : 'calm';
  const safeDay = Math.max(1, Math.floor(finiteOr(opts.day, 1)));
  const safeSeed = typeof opts.seed === 'string' && opts.seed.length > 0 ? opts.seed : 'guild-default';
  const rawCount = opts.count === undefined ? 3 : Math.floor(finiteOr(opts.count, 3));
  const count = Math.max(0, rawCount);

  if (count === 0) {
    return [];
  }

  const completedSet = new Set<string>(opts.completedIds ?? []);

  const rankedPool = [...PROCEDURAL_COMMISSION_CATALOG].sort((a, b) => {
    const aAligned = a.alignedRegimes.includes(safeRegime) ? 0 : 1;
    const bAligned = b.alignedRegimes.includes(safeRegime) ? 0 : 1;
    if (aAligned !== bAligned) {
      return aAligned - bAligned;
    }
    const aHash = hashSeedUint32(`${safeSeed}:${safeDay}:${safeRegime}:${a.spec.id}`);
    const bHash = hashSeedUint32(`${safeSeed}:${safeDay}:${safeRegime}:${b.spec.id}`);
    if (aHash !== bHash) {
      return aHash - bHash;
    }
    return a.spec.id < b.spec.id ? -1 : a.spec.id > b.spec.id ? 1 : 0;
  });

  const tierSequence: FestivalCommissionSpec['tier'][] = [];
  if (count === 3) {
    tierSequence.push('apprentice', 'journeyman', 'grandmaster');
  } else {
    const startOffset =
      (safeDay + completedSet.size + hashSeedUint32(`${safeSeed}:${safeRegime}`)) % TIER_ORDER.length;
    for (let i = 0; i < count; i++) {
      tierSequence.push(TIER_ORDER[(startOffset + i) % TIER_ORDER.length]);
    }
  }

  const picked: FestivalCommissionSpec[] = [];
  const pickedIds = new Set<string>();
  const pickedTitles = new Set<string>();
  const usedEffects = new Set<PotionEffectTag>();

  for (const tier of tierSequence) {
    const chosen = pickFromPool(
      rankedPool,
      tier,
      safeRegime,
      completedSet,
      pickedIds,
      pickedTitles,
      usedEffects
    );
    if (chosen) {
      picked.push(chosen);
      pickedIds.add(chosen.id);
      pickedTitles.add(chosen.title);
      usedEffects.add(chosen.requiredEffect);
    }
  }

  return picked;
}
