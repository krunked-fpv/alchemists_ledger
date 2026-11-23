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
      const topSpec = REAGENT_CATALOG[state.layers[state.layers.length - 1].reagentId];
      const prefix = state.marblingIndex >= 0.35 ? 'Marbled' : state.layerCrispness >= 0.8 ? 'Layered' : 'Brewed';
      name = `${prefix} ${topSpec.name.split(' ')[0]} ${effectTitle}`;

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
