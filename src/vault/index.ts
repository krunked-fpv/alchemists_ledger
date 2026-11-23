export const COOKIE_VAULT_NAME = 'krunked-cookie-vault-v1' as const;
export const PRIMARY_LS_KEY = 'alchemists_ledger_primary_v1' as const;
export const IDB_NAME = 'alchemists_ledger_idb' as const;
export const IDB_STORE = 'ledger_slots_v1' as const;
export const COOKIE_MAX_BYTES = 3900 as const;

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

export type HouseholdSlotId = 1 | 2 | 3;
export type GameMode = 'apprentice' | 'grandmaster';
export type PotionVessel = 'prism' | 'teardrop' | 'crescent' | 'carafe';
export type MarketRegime =
  | 'calm'
  | 'dragon_siege'
  | 'bumper_harvest'
  | 'glacial_snap'
  | 'starfall_conclave';

export type PolyrhythmRatio = '3:4' | '4:5' | '5:6';

export type CellarApparatusType =
  | 'boiling_retort'
  | 'graham_condenser'
  | 'copper_siphon'
  | 'drip_alembic';

export type PotionEffectTag =
  | 'fire_ward'
  | 'burn_salve'
  | 'hearth_tonic'
  | 'galaxy_elixir'
  | 'neutralizing_salve'
  | 'soothing_draught';

export interface DensityLayer {
  reagentId: ReagentId;
  prepForm: PrepForm;
  specificGravity: number;
  volumeMl: number;
  viscosity: number;
  colorRgb: [number, number, number];
  micaIntensity: number;
  interfaceSharpness: number;
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

export interface CellarNode {
  id: string;
  type: CellarApparatusType;
  x: number;
  y: number;
  inputReagent?: ReagentId;
  active: boolean;
  cyclePhase: number;
}

export interface CellarPipeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  ratio: PolyrhythmRatio;
  dropletProgress: number;
}

export interface CellarPipeGraph {
  nodes: CellarNode[];
  edges: CellarPipeEdge[];
  quintessences: Partial<Record<ReagentId, number>>;
  catalystSalts: Partial<Record<ReagentId, number>>;
}

export interface LedgerEntry {
  id: string;
  day: number;
  timestampIso: string;
  text: string;
  deltaCrowns: number;
  kind: 'sale' | 'purchase' | 'overhead' | 'commission' | 'reset';
}

export interface HouseholdSlotState {
  slotId: HouseholdSlotId;
  label: string;
  mode: GameMode;
  day: number;
  dateSeed: string;
  crowns: number;
  reputation: number;
  regime: MarketRegime;
  unlockedVessels: PotionVessel[];
  reagentStock: Record<ReagentId, number>;
  shelfPotions: CraftedPotion[];
  cellarGraph: CellarPipeGraph;
  completedCommissionIds: string[];
  ledgerEntries: LedgerEntry[];
  updatedAtIso: string;
}

export interface LedgerSaveStateV1 {
  schemaVersion: 1;
  activeSlot: HouseholdSlotId;
  slots: Record<HouseholdSlotId, HouseholdSlotState>;
  audioMuted: boolean;
  audioVolume: number;
}

export interface CookieSlotDigestV1 {
  s: HouseholdSlotId;
  m: 0 | 1;
  d: number;
  ds: string;
  c: number;
  r: number;
  rg: number;
  uv: number;
  stk: number[];
  pot: Array<[number, number, number, number, number, number]>;
  cel: Array<[number, number, number]>;
  qnt: number[];
  cmp: number;
  lbl?: string;
  potL?: Array<Array<[number, number, number]>>;
  celE?: Array<[number, number, number]>;
  celP?: Array<[number, number]>;
  cmpIds?: string[];
}

export interface CookieVaultDigestV1 {
  v: 1;
  active: HouseholdSlotId;
  slots: CookieSlotDigestV1[];
  am?: 0 | 1;
  av?: number;
}

export interface VaultManagerOptions {
  storage?: Storage;
  cookieTarget?: { cookie: string };
  useIdb?: boolean;
}

export interface VaultBootResult {
  state: LedgerSaveStateV1;
  healedFrom: 'primary' | 'idb' | 'cookie' | 'fresh';
}

export interface VaultAuditResult {
  healed: boolean;
  source: 'primary' | 'idb' | 'cookie' | 'none';
  state?: LedgerSaveStateV1;
}

const SLOT_IDS: readonly HouseholdSlotId[] = [1, 2, 3] as const;

const VESSEL_ORDER: readonly PotionVessel[] = [
  'prism',
  'teardrop',
  'crescent',
  'carafe',
] as const;

const REGIME_ORDER: readonly MarketRegime[] = [
  'calm',
  'dragon_siege',
  'bumper_harvest',
  'glacial_snap',
  'starfall_conclave',
] as const;

const PREP_ORDER: readonly PrepForm[] = [
  'raw',
  'ground_crystal',
  'sliced_botanical',
  'pipette_drops',
  'cellar_quintessence',
  'catalyst_salt',
] as const;

const SEAL_COLOR_ORDER: readonly WaxSealSpec['color'][] = [
  'crimson',
  'verdigris',
  'gold',
  'indigo',
] as const;

const SEAL_CREST_ORDER: readonly WaxSealSpec['crest'][] = [
  'phoenix',
  'alembic',
  'crescent',
  'scales',
] as const;

const EFFECT_ORDER: readonly PotionEffectTag[] = [
  'fire_ward',
  'burn_salve',
  'hearth_tonic',
  'galaxy_elixir',
  'neutralizing_salve',
  'soothing_draught',
] as const;

const APPARATUS_ORDER: readonly CellarApparatusType[] = [
  'boiling_retort',
  'graham_condenser',
  'copper_siphon',
  'drip_alembic',
] as const;

const RATIO_ORDER: readonly PolyrhythmRatio[] = ['3:4', '4:5', '5:6'] as const;

const DEFAULT_SLOT_LABELS: Record<HouseholdSlotId, string> = {
  1: 'Crimson Seal I',
  2: 'Verdigris Seal II',
  3: 'Indigo Seal III',
};

const EFFECT_DISPLAY_NAMES: Record<PotionEffectTag, string> = {
  fire_ward: 'Fire Ward',
  burn_salve: 'Burn Salve',
  hearth_tonic: 'Hearth Tonic',
  galaxy_elixir: 'Galaxy Elixir',
  neutralizing_salve: 'Neutralizing Salve',
  soothing_draught: 'Soothing Draught',
};

const VESSEL_DISPLAY_NAMES: Record<PotionVessel, string> = {
  prism: 'Prism',
  teardrop: 'Teardrop',
  crescent: 'Crescent',
  carafe: 'Carafe',
};

const EFFECT_FALLBACK_REAGENT: Record<PotionEffectTag, ReagentId> = {
  fire_ward: 'cinnabar_sulfur_ash',
  burn_salve: 'verdigris_moss_sap',
  hearth_tonic: 'saffron_hearth_pollen',
  galaxy_elixir: 'starlight_aether_oil',
  neutralizing_salve: 'bismuth_vitriol_salt',
  soothing_draught: 'amber_honey_resin',
};

interface ReagentDigestMeta {
  specificGravity: number;
  baseViscosity: number;
  baseColorRgb: [number, number, number];
  micaIntensity: number;
  preferredPrep: PrepForm;
}

const REAGENT_DIGEST_META: Record<ReagentId, ReagentDigestMeta> = {
  amber_honey_resin: {
    specificGravity: 1.42,
    baseViscosity: 15.5,
    baseColorRgb: [0.85, 0.56, 0.14],
    micaIntensity: 0.15,
    preferredPrep: 'raw',
  },
  cinnabar_sulfur_ash: {
    specificGravity: 1.55,
    baseViscosity: 4.2,
    baseColorRgb: [0.86, 0.24, 0.14],
    micaIntensity: 0.2,
    preferredPrep: 'ground_crystal',
  },
  bismuth_vitriol_salt: {
    specificGravity: 1.48,
    baseViscosity: 3.0,
    baseColorRgb: [0.34, 0.62, 0.74],
    micaIntensity: 0.45,
    preferredPrep: 'ground_crystal',
  },
  glacial_alum_shard: {
    specificGravity: 1.34,
    baseViscosity: 2.4,
    baseColorRgb: [0.68, 0.89, 0.96],
    micaIntensity: 0.35,
    preferredPrep: 'ground_crystal',
  },
  chalk_pearl_lime: {
    specificGravity: 1.26,
    baseViscosity: 5.0,
    baseColorRgb: [0.92, 0.9, 0.84],
    micaIntensity: 0.3,
    preferredPrep: 'ground_crystal',
  },
  verdigris_moss_sap: {
    specificGravity: 1.14,
    baseViscosity: 6.8,
    baseColorRgb: [0.16, 0.62, 0.46],
    micaIntensity: 0.1,
    preferredPrep: 'sliced_botanical',
  },
  saffron_hearth_pollen: {
    specificGravity: 1.08,
    baseViscosity: 3.6,
    baseColorRgb: [0.95, 0.66, 0.12],
    micaIntensity: 0.25,
    preferredPrep: 'sliced_botanical',
  },
  cobalt_lotus_nectar: {
    specificGravity: 1.02,
    baseViscosity: 4.4,
    baseColorRgb: [0.18, 0.42, 0.86],
    micaIntensity: 0.2,
    preferredPrep: 'pipette_drops',
  },
  moonveil_lichen_dew: {
    specificGravity: 0.96,
    baseViscosity: 1.8,
    baseColorRgb: [0.58, 0.84, 0.78],
    micaIntensity: 0.4,
    preferredPrep: 'pipette_drops',
  },
  rose_madder_distillate: {
    specificGravity: 0.92,
    baseViscosity: 2.1,
    baseColorRgb: [0.78, 0.2, 0.36],
    micaIntensity: 0.2,
    preferredPrep: 'sliced_botanical',
  },
  auric_mica_suspension: {
    specificGravity: 0.88,
    baseViscosity: 2.9,
    baseColorRgb: [0.96, 0.82, 0.32],
    micaIntensity: 0.95,
    preferredPrep: 'pipette_drops',
  },
  starlight_aether_oil: {
    specificGravity: 0.82,
    baseViscosity: 1.1,
    baseColorRgb: [0.46, 0.32, 0.88],
    micaIntensity: 0.75,
    preferredPrep: 'pipette_drops',
  },
};

const REAGENT_INDEX_MAP: Record<ReagentId, number> = Object.fromEntries(
  CANONICAL_REAGENT_ORDER.map((id, idx) => [id, idx])
) as Record<ReagentId, number>;

const DATE_SEED_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CRC32_HEX_REGEX = /^[0-9a-f]{8}$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;
const COOKIE_SOFT_BUDGET = COOKIE_MAX_BYTES - COOKIE_VAULT_NAME.length - 1; // 3876 bytes
const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const B64URL_LOOKUP: Int16Array = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64URL_ALPHABET.length; i++) {
    table[B64URL_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER_FATAL = new TextDecoder('utf-8', { fatal: true });

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isValidDateSeed(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_SEED_REGEX.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function getTodayUtcDateSeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateSeed(dateSeed?: string): string {
  return isValidDateSeed(dateSeed) ? dateSeed : getTodayUtcDateSeed();
}

function isReagentId(value: unknown): value is ReagentId {
  return typeof value === 'string' && value in REAGENT_INDEX_MAP;
}

function isHouseholdSlotId(value: unknown): value is HouseholdSlotId {
  return value === 1 || value === 2 || value === 3;
}

function isGameMode(value: unknown): value is GameMode {
  return value === 'apprentice' || value === 'grandmaster';
}

function isPotionVessel(value: unknown): value is PotionVessel {
  return typeof value === 'string' && (VESSEL_ORDER as readonly string[]).includes(value);
}

function isMarketRegime(value: unknown): value is MarketRegime {
  return typeof value === 'string' && (REGIME_ORDER as readonly string[]).includes(value);
}

function isPrepForm(value: unknown): value is PrepForm {
  return typeof value === 'string' && (PREP_ORDER as readonly string[]).includes(value);
}

function isPotionEffectTag(value: unknown): value is PotionEffectTag {
  return typeof value === 'string' && (EFFECT_ORDER as readonly string[]).includes(value);
}

function isCellarApparatus(value: unknown): value is CellarApparatusType {
  return typeof value === 'string' && (APPARATUS_ORDER as readonly string[]).includes(value);
}

function isPolyrhythmRatio(value: unknown): value is PolyrhythmRatio {
  return typeof value === 'string' && (RATIO_ORDER as readonly string[]).includes(value);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;

    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (has1) {
      out += B64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    }
    if (has2) {
      out += B64URL_ALPHABET[b2 & 0x3f];
    }
  }
  return out;
}

function decodeBase64Url(encoded: string): Uint8Array | null {
  if (!BASE64URL_REGEX.test(encoded) || encoded.length % 4 === 1) {
    return null;
  }
  const fullGroups = Math.floor(encoded.length / 4);
  const rem = encoded.length % 4;
  const outLen = fullGroups * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
  const out = new Uint8Array(outLen);

  let o = 0;
  for (let i = 0; i < encoded.length; i += 4) {
    const c0 = B64URL_LOOKUP[encoded.charCodeAt(i)];
    const c1 = B64URL_LOOKUP[encoded.charCodeAt(i + 1)];
    const c2 = i + 2 < encoded.length ? B64URL_LOOKUP[encoded.charCodeAt(i + 2)] : 0;
    const c3 = i + 3 < encoded.length ? B64URL_LOOKUP[encoded.charCodeAt(i + 3)] : 0;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      return null;
    }
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (i + 2 < encoded.length) {
      out[o++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    }
    if (i + 3 < encoded.length) {
      out[o++] = ((c2 & 0x03) << 6) | c3;
    }
  }
  return out;
}

/**
 * Computes standard IEEE 802.3 CRC32 over UTF-8 input bytes as a lowercase 8-hex string.
 */
export function computeCrc32Hex(input: string): string {
  const bytes = TEXT_ENCODER.encode(input);
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function createStarterStock(): Record<ReagentId, number> {
  return {
    amber_honey_resin: 5,
    cinnabar_sulfur_ash: 3,
    bismuth_vitriol_salt: 3,
    glacial_alum_shard: 3,
    chalk_pearl_lime: 4,
    verdigris_moss_sap: 4,
    saffron_hearth_pollen: 3,
    cobalt_lotus_nectar: 2,
    moonveil_lichen_dew: 2,
    rose_madder_distillate: 2,
    auric_mica_suspension: 1,
    starlight_aether_oil: 1,
  };
}

/**
 * Creates an independent, initialized HouseholdSlotState for slot 1, 2, or 3.
 */
export function createDefaultSlotState(
  slotId: HouseholdSlotId,
  mode: GameMode = 'apprentice',
  dateSeed?: string
): HouseholdSlotState {
  if (!isHouseholdSlotId(slotId)) {
    throw new Error(`Invalid HouseholdSlotId: ${String(slotId)}`);
  }
  const safeMode: GameMode = isGameMode(mode) ? mode : 'apprentice';
  const safeSeed = normalizeDateSeed(dateSeed);
  return {
    slotId,
    label: DEFAULT_SLOT_LABELS[slotId],
    mode: safeMode,
    day: 1,
    dateSeed: safeSeed,
    crowns: safeMode === 'grandmaster' ? 120 : 180,
    reputation: 10,
    regime: 'calm',
    unlockedVessels:
      safeMode === 'grandmaster'
        ? ['prism', 'teardrop', 'crescent', 'carafe']
        : ['prism', 'teardrop'],
    reagentStock: createStarterStock(),
    shelfPotions: [],
    cellarGraph: {
      nodes: [],
      edges: [],
      quintessences: {},
      catalystSalts: {},
    },
    completedCommissionIds: [],
    ledgerEntries: [],
    updatedAtIso: `${safeSeed}T06:00:00.000Z`,
  };
}

/**
 * Creates a complete LedgerSaveStateV1 containing all 3 independent household slots.
 */
export function createDefaultLedgerState(dateSeed?: string): LedgerSaveStateV1 {
  const safeSeed = normalizeDateSeed(dateSeed);
  return {
    schemaVersion: 1,
    activeSlot: 1,
    slots: {
      1: createDefaultSlotState(1, 'apprentice', safeSeed),
      2: createDefaultSlotState(2, 'apprentice', safeSeed),
      3: createDefaultSlotState(3, 'apprentice', safeSeed),
    },
    audioMuted: false,
    audioVolume: 0.75,
  };
}

function cloneDensityLayer(layer: DensityLayer): DensityLayer {
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

function clonePotion(potion: CraftedPotion): CraftedPotion {
  return {
    id: potion.id,
    name: potion.name,
    vessel: potion.vessel,
    seal: {
      color: potion.seal.color,
      crest: potion.seal.crest,
      stamped: potion.seal.stamped,
    },
    layers: potion.layers.map(cloneDensityLayer),
    purity: potion.purity,
    marblingIndex: potion.marblingIndex,
    layerCrispness: potion.layerCrispness,
    collectorBrilliance: potion.collectorBrilliance,
    ph: potion.ph,
    peakTempC: potion.peakTempC,
    dominantEffect: potion.dominantEffect,
    baseValueCrowns: potion.baseValueCrowns,
    createdAtDay: potion.createdAtDay,
  };
}

function cloneReagentCounts(
  source: Partial<Record<ReagentId, number>>
): Partial<Record<ReagentId, number>> {
  const out: Partial<Record<ReagentId, number>> = {};
  for (const id of CANONICAL_REAGENT_ORDER) {
    const val = source[id];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      out[id] = Math.round(val);
    }
  }
  return out;
}

function cloneSlotState(slot: HouseholdSlotState): HouseholdSlotState {
  const stock = {} as Record<ReagentId, number>;
  for (const id of CANONICAL_REAGENT_ORDER) {
    const val = slot.reagentStock[id];
    stock[id] = typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : 0;
  }
  return {
    slotId: slot.slotId,
    label: slot.label,
    mode: slot.mode,
    day: slot.day,
    dateSeed: slot.dateSeed,
    crowns: slot.crowns,
    reputation: slot.reputation,
    regime: slot.regime,
    unlockedVessels: [...slot.unlockedVessels],
    reagentStock: stock,
    shelfPotions: slot.shelfPotions.map(clonePotion),
    cellarGraph: {
      nodes: slot.cellarGraph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        ...(n.inputReagent !== undefined ? { inputReagent: n.inputReagent } : {}),
        active: n.active,
        cyclePhase: n.cyclePhase,
      })),
      edges: slot.cellarGraph.edges.map((e) => ({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        ratio: e.ratio,
        dropletProgress: e.dropletProgress,
      })),
      quintessences: cloneReagentCounts(slot.cellarGraph.quintessences),
      catalystSalts: cloneReagentCounts(slot.cellarGraph.catalystSalts),
    },
    completedCommissionIds: [...slot.completedCommissionIds],
    ledgerEntries: slot.ledgerEntries.map((entry) => ({
      id: entry.id,
      day: entry.day,
      timestampIso: entry.timestampIso,
      text: entry.text,
      deltaCrowns: entry.deltaCrowns,
      kind: entry.kind,
    })),
    updatedAtIso: slot.updatedAtIso,
  };
}

function cloneLedgerState(state: LedgerSaveStateV1): LedgerSaveStateV1 {
  return {
    schemaVersion: 1,
    activeSlot: state.activeSlot,
    slots: {
      1: cloneSlotState(state.slots[1]),
      2: cloneSlotState(state.slots[2]),
      3: cloneSlotState(state.slots[3]),
    },
    audioMuted: state.audioMuted,
    audioVolume: state.audioVolume,
  };
}

function validateDensityLayer(raw: unknown): DensityLayer | null {
  if (!isPlainRecord(raw)) return null;
  if (!isReagentId(raw.reagentId) || !isPrepForm(raw.prepForm)) return null;
  if (
    typeof raw.specificGravity !== 'number' ||
    !Number.isFinite(raw.specificGravity) ||
    typeof raw.volumeMl !== 'number' ||
    !Number.isFinite(raw.volumeMl) ||
    raw.volumeMl < 0 ||
    typeof raw.viscosity !== 'number' ||
    !Number.isFinite(raw.viscosity) ||
    typeof raw.micaIntensity !== 'number' ||
    !Number.isFinite(raw.micaIntensity) ||
    typeof raw.interfaceSharpness !== 'number' ||
    !Number.isFinite(raw.interfaceSharpness)
  ) {
    return null;
  }
  if (!Array.isArray(raw.colorRgb) || raw.colorRgb.length !== 3) return null;
  const rgb: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c = raw.colorRgb[i];
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) {
      return null;
    }
    rgb[i] = c;
  }
  return {
    reagentId: raw.reagentId,
    prepForm: raw.prepForm,
    specificGravity: raw.specificGravity,
    volumeMl: raw.volumeMl,
    viscosity: raw.viscosity,
    colorRgb: rgb,
    micaIntensity: clamp(raw.micaIntensity, 0, 1),
    interfaceSharpness: clamp(raw.interfaceSharpness, 0, 1),
  };
}

function validateWaxSeal(raw: unknown): WaxSealSpec | null {
  if (!isPlainRecord(raw)) return null;
  if (
    typeof raw.color !== 'string' ||
    !(SEAL_COLOR_ORDER as readonly string[]).includes(raw.color)
  ) {
    return null;
  }
  if (
    typeof raw.crest !== 'string' ||
    !(SEAL_CREST_ORDER as readonly string[]).includes(raw.crest)
  ) {
    return null;
  }
  if (typeof raw.stamped !== 'boolean') return null;
  return {
    color: raw.color as WaxSealSpec['color'],
    crest: raw.crest as WaxSealSpec['crest'],
    stamped: raw.stamped,
  };
}

function validateCraftedPotion(raw: unknown): CraftedPotion | null {
  if (!isPlainRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  if (!isPotionVessel(raw.vessel) || !isPotionEffectTag(raw.dominantEffect)) return null;
  const seal = validateWaxSeal(raw.seal);
  if (!seal) return null;
  if (!Array.isArray(raw.layers)) return null;
  const layers: DensityLayer[] = [];
  for (const item of raw.layers) {
    const parsed = validateDensityLayer(item);
    if (!parsed) return null;
    layers.push(parsed);
  }
  if (
    typeof raw.purity !== 'number' ||
    !Number.isFinite(raw.purity) ||
    typeof raw.marblingIndex !== 'number' ||
    !Number.isFinite(raw.marblingIndex) ||
    typeof raw.layerCrispness !== 'number' ||
    !Number.isFinite(raw.layerCrispness) ||
    typeof raw.collectorBrilliance !== 'number' ||
    !Number.isFinite(raw.collectorBrilliance) ||
    typeof raw.ph !== 'number' ||
    !Number.isFinite(raw.ph) ||
    typeof raw.peakTempC !== 'number' ||
    !Number.isFinite(raw.peakTempC) ||
    typeof raw.baseValueCrowns !== 'number' ||
    !Number.isFinite(raw.baseValueCrowns) ||
    raw.baseValueCrowns < 0 ||
    typeof raw.createdAtDay !== 'number' ||
    !Number.isFinite(raw.createdAtDay) ||
    raw.createdAtDay < 1
  ) {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    vessel: raw.vessel,
    seal,
    layers,
    purity: clamp(raw.purity, 0, 1),
    marblingIndex: clamp(raw.marblingIndex, 0, 1),
    layerCrispness: clamp(raw.layerCrispness, 0, 1),
    collectorBrilliance: clamp(raw.collectorBrilliance, 0, 1),
    ph: clamp(raw.ph, 0, 14),
    peakTempC: raw.peakTempC,
    dominantEffect: raw.dominantEffect,
    baseValueCrowns: raw.baseValueCrowns,
    createdAtDay: Math.floor(raw.createdAtDay),
  };
}

function validateCellarGraph(raw: unknown): CellarPipeGraph | null {
  if (!isPlainRecord(raw)) return null;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  if (!isPlainRecord(raw.quintessences) || !isPlainRecord(raw.catalystSalts)) return null;

  const nodes: CellarNode[] = [];
  for (const n of raw.nodes) {
    if (!isPlainRecord(n)) return null;
    if (
      typeof n.id !== 'string' ||
      !isCellarApparatus(n.type) ||
      typeof n.x !== 'number' ||
      !Number.isFinite(n.x) ||
      typeof n.y !== 'number' ||
      !Number.isFinite(n.y) ||
      typeof n.active !== 'boolean' ||
      typeof n.cyclePhase !== 'number' ||
      !Number.isFinite(n.cyclePhase)
    ) {
      return null;
    }
    if (n.inputReagent !== undefined && !isReagentId(n.inputReagent)) {
      return null;
    }
    nodes.push({
      id: n.id,
      type: n.type,
      x: n.x,
      y: n.y,
      ...(n.inputReagent !== undefined ? { inputReagent: n.inputReagent } : {}),
      active: n.active,
      cyclePhase: n.cyclePhase,
    });
  }

  const edges: CellarPipeEdge[] = [];
  for (const e of raw.edges) {
    if (!isPlainRecord(e)) return null;
    if (
      typeof e.id !== 'string' ||
      typeof e.fromNodeId !== 'string' ||
      typeof e.toNodeId !== 'string' ||
      !isPolyrhythmRatio(e.ratio) ||
      typeof e.dropletProgress !== 'number' ||
      !Number.isFinite(e.dropletProgress)
    ) {
      return null;
    }
    edges.push({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      ratio: e.ratio,
      dropletProgress: e.dropletProgress,
    });
  }

  const parseReagentCountMap = (
    src: Record<string, unknown>
  ): Partial<Record<ReagentId, number>> | null => {
    const out: Partial<Record<ReagentId, number>> = {};
    for (const [k, v] of Object.entries(src)) {
      if (!isReagentId(k)) return null;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
      if (v > 0) out[k] = Math.round(v);
    }
    return out;
  };

  const quintessences = parseReagentCountMap(raw.quintessences);
  const catalystSalts = parseReagentCountMap(raw.catalystSalts);
  if (!quintessences || !catalystSalts) return null;

  return { nodes, edges, quintessences, catalystSalts };
}

function validateLedgerEntries(raw: unknown): LedgerEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const validKinds = new Set(['sale', 'purchase', 'overhead', 'commission', 'reset']);
  const out: LedgerEntry[] = [];
  for (const item of raw) {
    if (!isPlainRecord(item)) return null;
    if (
      typeof item.id !== 'string' ||
      typeof item.day !== 'number' ||
      !Number.isFinite(item.day) ||
      typeof item.timestampIso !== 'string' ||
      typeof item.text !== 'string' ||
      typeof item.deltaCrowns !== 'number' ||
      !Number.isFinite(item.deltaCrowns) ||
      typeof item.kind !== 'string' ||
      !validKinds.has(item.kind)
    ) {
      return null;
    }
    out.push({
      id: item.id,
      day: Math.floor(item.day),
      timestampIso: item.timestampIso,
      text: item.text,
      deltaCrowns: item.deltaCrowns,
      kind: item.kind as LedgerEntry['kind'],
    });
  }
  return out;
}

function validateSlotState(raw: unknown, expectedSlotId: HouseholdSlotId): HouseholdSlotState | null {
  if (!isPlainRecord(raw)) return null;
  if (raw.slotId !== expectedSlotId) return null;
  if (typeof raw.label !== 'string') return null;
  if (!isGameMode(raw.mode)) return null;
  if (
    typeof raw.day !== 'number' ||
    !Number.isInteger(raw.day) ||
    raw.day < 1 ||
    !isValidDateSeed(raw.dateSeed)
  ) {
    return null;
  }
  if (
    typeof raw.crowns !== 'number' ||
    !Number.isFinite(raw.crowns) ||
    raw.crowns < 0 ||
    typeof raw.reputation !== 'number' ||
    !Number.isFinite(raw.reputation) ||
    !isMarketRegime(raw.regime) ||
    typeof raw.updatedAtIso !== 'string'
  ) {
    return null;
  }
  if (!Array.isArray(raw.unlockedVessels)) return null;
  const unlockedSet = new Set<PotionVessel>();
  for (const v of raw.unlockedVessels) {
    if (!isPotionVessel(v)) return null;
    unlockedSet.add(v);
  }
  if (!isPlainRecord(raw.reagentStock)) return null;
  const reagentStock = {} as Record<ReagentId, number>;
  for (const id of CANONICAL_REAGENT_ORDER) {
    const val = raw.reagentStock[id];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      return null;
    }
    reagentStock[id] = val;
  }
  if (!Array.isArray(raw.shelfPotions)) return null;
  const shelfPotions: CraftedPotion[] = [];
  for (const p of raw.shelfPotions) {
    const validated = validateCraftedPotion(p);
    if (!validated) return null;
    shelfPotions.push(validated);
  }
  const cellarGraph = validateCellarGraph(raw.cellarGraph);
  if (!cellarGraph) return null;

  if (!Array.isArray(raw.completedCommissionIds)) return null;
  const completedCommissionIds: string[] = [];
  for (const c of raw.completedCommissionIds) {
    if (typeof c !== 'string') return null;
    completedCommissionIds.push(c);
  }

  const ledgerEntries = validateLedgerEntries(raw.ledgerEntries);
  if (!ledgerEntries) return null;

  return {
    slotId: expectedSlotId,
    label: raw.label,
    mode: raw.mode,
    day: raw.day,
    dateSeed: raw.dateSeed,
    crowns: raw.crowns,
    reputation: raw.reputation,
    regime: raw.regime,
    unlockedVessels: Array.from(unlockedSet),
    reagentStock,
    shelfPotions,
    cellarGraph,
    completedCommissionIds,
    ledgerEntries,
    updatedAtIso: raw.updatedAtIso,
  };
}

function validateAndNormalizeLedgerState(raw: unknown): LedgerSaveStateV1 | null {
  if (!isPlainRecord(raw)) return null;
  if (raw.schemaVersion !== 1) return null;
  if (!isHouseholdSlotId(raw.activeSlot)) return null;
  if (
    typeof raw.audioMuted !== 'boolean' ||
    typeof raw.audioVolume !== 'number' ||
    !Number.isFinite(raw.audioVolume) ||
    raw.audioVolume < 0 ||
    raw.audioVolume > 1
  ) {
    return null;
  }
  if (!isPlainRecord(raw.slots)) return null;

  const s1 = validateSlotState(raw.slots['1'] ?? raw.slots[1], 1);
  const s2 = validateSlotState(raw.slots['2'] ?? raw.slots[2], 2);
  const s3 = validateSlotState(raw.slots['3'] ?? raw.slots[3], 3);
  if (!s1 || !s2 || !s3) return null;

  return {
    schemaVersion: 1,
    activeSlot: raw.activeSlot,
    slots: { 1: s1, 2: s2, 3: s3 },
    audioMuted: raw.audioMuted,
    audioVolume: raw.audioVolume,
  };
}

function encodeCommissionMask(ids: readonly string[]): number {
  let mask = 0;
  for (const id of ids) {
    if (id.includes('apprentice')) {
      mask |= 1;
    } else if (id.includes('journeyman')) {
      mask |= 2;
    } else if (id.includes('grandmaster')) {
      mask |= 4;
    }
    const bit = 3 + (parseInt(computeCrc32Hex(id), 16) % 27);
    mask |= 1 << bit;
  }
  return mask >>> 0;
}

function packQuintessencesAndSalts(
  graph: CellarPipeGraph,
  cap: number
): number[] {
  const packed = new Array<number>(12).fill(0);
  let anyNonZero = false;
  for (let i = 0; i < CANONICAL_REAGENT_ORDER.length; i++) {
    const id = CANONICAL_REAGENT_ORDER[i];
    const q = clamp(Math.round(graph.quintessences[id] ?? 0), 0, cap);
    const s = clamp(Math.round(graph.catalystSalts[id] ?? 0), 0, cap);
    const combined = q + s * 1000;
    packed[i] = combined;
    if (combined !== 0) anyNonZero = true;
  }
  return anyNonZero ? packed : [];
}

function encodeSealIndex(seal: WaxSealSpec): number {
  const colorIdx = Math.max(0, SEAL_COLOR_ORDER.indexOf(seal.color));
  const crestIdx = Math.max(0, SEAL_CREST_ORDER.indexOf(seal.crest));
  return colorIdx | (crestIdx << 2) | (seal.stamped ? 16 : 0);
}

function decodeSealIndex(sealIdx: number): WaxSealSpec {
  return {
    color: SEAL_COLOR_ORDER[sealIdx & 0b11],
    crest: SEAL_CREST_ORDER[(sealIdx >> 2) & 0b11],
    stamped: Boolean((sealIdx >> 4) & 1),
  };
}

interface DigestBuildOptions {
  maxPotions: number;
  maxCellarNodes: number;
  includeLabels: boolean;
  includeCellarPos: boolean;
  includeCellarEdges: boolean;
  includeCommissionIds: boolean;
  includePotionLayers: boolean;
  maxStock: number;
  maxQnt: number;
}

function buildCookieDigestObject(
  state: LedgerSaveStateV1,
  opts: DigestBuildOptions
): CookieVaultDigestV1 {
  const slotDigests: CookieSlotDigestV1[] = SLOT_IDS.map((slotId) => {
    const slot = state.slots[slotId];

    let uv = 0;
    for (let i = 0; i < VESSEL_ORDER.length; i++) {
      if (slot.unlockedVessels.includes(VESSEL_ORDER[i])) {
        uv |= 1 << i;
      }
    }

    const stk = CANONICAL_REAGENT_ORDER.map((id) =>
      clamp(Math.round(slot.reagentStock[id] ?? 0), 0, opts.maxStock)
    );

    const keptPotions =
      opts.maxPotions > 0 ? slot.shelfPotions.slice(-opts.maxPotions) : [];
    const pot: CookieSlotDigestV1['pot'] = keptPotions.map((p) => [
      Math.max(0, VESSEL_ORDER.indexOf(p.vessel)),
      encodeSealIndex(p.seal),
      Math.max(0, EFFECT_ORDER.indexOf(p.dominantEffect)),
      clamp(Math.round(p.purity * 100), 0, 100),
      clamp(Math.round(p.layerCrispness * 100), 0, 100),
      clamp(Math.round(Math.max(0, p.baseValueCrowns) * 2), 0, 10_000_000),
    ]);

    const keptNodes =
      opts.maxCellarNodes > 0
        ? slot.cellarGraph.nodes.slice(0, opts.maxCellarNodes)
        : [];
    const nodeIdxById = new Map<string, number>();
    keptNodes.forEach((n, idx) => nodeIdxById.set(n.id, idx));

    const cel: CookieSlotDigestV1['cel'] = keptNodes.map((node) => {
      const appIdx = Math.max(0, APPARATUS_ORDER.indexOf(node.type));
      const regIdx =
        node.inputReagent !== undefined ? REAGENT_INDEX_MAP[node.inputReagent] : -1;
      const assocEdge = slot.cellarGraph.edges.find(
        (e) => e.fromNodeId === node.id || e.toNodeId === node.id
      );
      const ratioIdx = assocEdge ? Math.max(0, RATIO_ORDER.indexOf(assocEdge.ratio)) : 0;
      return [appIdx, regIdx, ratioIdx];
    });

    const entry: CookieSlotDigestV1 = {
      s: slotId,
      m: slot.mode === 'grandmaster' ? 1 : 0,
      d: Math.max(1, Math.floor(slot.day)),
      ds: normalizeDateSeed(slot.dateSeed),
      c: clamp(Math.round(Math.max(0, slot.crowns) * 2), 0, 100_000_000),
      r: clamp(Math.round(slot.reputation * 10) / 10, -10_000, 1_000_000),
      rg: Math.max(0, REGIME_ORDER.indexOf(slot.regime)),
      uv,
      stk,
      pot,
      cel,
      qnt: packQuintessencesAndSalts(slot.cellarGraph, opts.maxQnt),
      cmp: encodeCommissionMask(slot.completedCommissionIds),
    };

    if (opts.includeLabels && slot.label && slot.label !== DEFAULT_SLOT_LABELS[slotId]) {
      entry.lbl = slot.label.slice(0, 24);
    }

    if (opts.includePotionLayers && keptPotions.length > 0) {
      entry.potL = keptPotions.map((p) =>
        p.layers.slice(0, 4).map((layer) => [
          REAGENT_INDEX_MAP[layer.reagentId],
          Math.max(0, PREP_ORDER.indexOf(layer.prepForm)),
          clamp(Math.round(layer.volumeMl), 0, 9999),
        ])
      );
    }

    if (opts.includeCellarPos && keptNodes.length > 0) {
      entry.celP = keptNodes.map((n) => [
        clamp(Math.round(n.x * 100), 0, 100),
        clamp(Math.round(n.y * 100), 0, 100),
      ]);
    }

    if (opts.includeCellarEdges && keptNodes.length > 0) {
      const compactEdges: Array<[number, number, number]> = [];
      for (const e of slot.cellarGraph.edges) {
        const fromIdx = nodeIdxById.get(e.fromNodeId);
        const toIdx = nodeIdxById.get(e.toNodeId);
        if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx) {
          compactEdges.push([fromIdx, toIdx, Math.max(0, RATIO_ORDER.indexOf(e.ratio))]);
          if (compactEdges.length >= 8) break;
        }
      }
      entry.celE = compactEdges;
    }

    if (opts.includeCommissionIds && slot.completedCommissionIds.length > 0) {
      entry.cmpIds = slot.completedCommissionIds.slice(-6).map((id) => id.slice(0, 64));
    }

    return entry;
  });

  return {
    v: 1,
    active: state.activeSlot,
    slots: slotDigests,
    am: state.audioMuted ? 1 : 0,
    av: clamp(Math.round(state.audioVolume * 100), 0, 100),
  };
}

function serializeDigestPacket(digest: CookieVaultDigestV1): string {
  const json = JSON.stringify(digest);
  const b64 = encodeBase64Url(TEXT_ENCODER.encode(json));
  const crc = computeCrc32Hex(b64);
  return `v1.${crc}.${b64}`;
}

function coerceStateForDigest(state: LedgerSaveStateV1): LedgerSaveStateV1 {
  const validated = validateAndNormalizeLedgerState(state);
  if (validated) return validated;

  const fallback = createDefaultLedgerState();
  const safeActive = isHouseholdSlotId(state?.activeSlot) ? state.activeSlot : 1;
  return {
    schemaVersion: 1,
    activeSlot: safeActive,
    slots: {
      1: validateSlotState(state?.slots?.[1], 1) ?? fallback.slots[1],
      2: validateSlotState(state?.slots?.[2], 2) ?? fallback.slots[2],
      3: validateSlotState(state?.slots?.[3], 3) ?? fallback.slots[3],
    },
    audioMuted: Boolean(state?.audioMuted),
    audioVolume:
      typeof state?.audioVolume === 'number' && Number.isFinite(state.audioVolume)
        ? clamp(state.audioVolume, 0, 1)
        : 0.75,
  };
}

/**
 * Encodes LedgerSaveStateV1 into `v1.<crc32hex>.<base64url>` strictly <= 3900 bytes,
 * gracefully trimming oldest non-essential details when inventory or logs are maxed.
 */
export function encodeCookieVaultDigest(state: LedgerSaveStateV1): string {
  const normalized = coerceStateForDigest(state);

  const tiers: DigestBuildOptions[] = [
    {
      maxPotions: 6,
      maxCellarNodes: 6,
      includeLabels: true,
      includeCellarPos: true,
      includeCellarEdges: true,
      includeCommissionIds: true,
      includePotionLayers: true,
      maxStock: 99999,
      maxQnt: 999,
    },
    {
      maxPotions: 6,
      maxCellarNodes: 6,
      includeLabels: false,
      includeCellarPos: false,
      includeCellarEdges: true,
      includeCommissionIds: true,
      includePotionLayers: true,
      maxStock: 9999,
      maxQnt: 999,
    },
    {
      maxPotions: 6,
      maxCellarNodes: 6,
      includeLabels: false,
      includeCellarPos: false,
      includeCellarEdges: false,
      includeCommissionIds: false,
      includePotionLayers: true,
      maxStock: 999,
      maxQnt: 999,
    },
    {
      maxPotions: 6,
      maxCellarNodes: 6,
      includeLabels: false,
      includeCellarPos: false,
      includeCellarEdges: false,
      includeCommissionIds: false,
      includePotionLayers: false,
      maxStock: 999,
      maxQnt: 999,
    },
    {
      maxPotions: 3,
      maxCellarNodes: 6,
      includeLabels: false,
      includeCellarPos: false,
      includeCellarEdges: false,
      includeCommissionIds: false,
      includePotionLayers: false,
      maxStock: 999,
      maxQnt: 999,
    },
    {
      maxPotions: 1,
      maxCellarNodes: 3,
      includeLabels: false,
      includeCellarPos: false,
      includeCellarEdges: false,
      includeCommissionIds: false,
      includePotionLayers: false,
      maxStock: 999,
      maxQnt: 99,
    },
    {
      maxPotions: 0,
      maxCellarNodes: 0,
      includeLabels: false,
      includeCellarPos: false,
      includeCellarEdges: false,
      includeCommissionIds: false,
      includePotionLayers: false,
      maxStock: 999,
      maxQnt: 0,
    },
  ];

  let lastCandidate = '';
  for (const tier of tiers) {
    const packet = serializeDigestPacket(buildCookieDigestObject(normalized, tier));
    lastCandidate = packet;
    if (packet.length <= COOKIE_SOFT_BUDGET) {
      return packet;
    }
  }
  return lastCandidate.length <= COOKIE_MAX_BYTES
    ? lastCandidate
    : serializeDigestPacket(
        buildCookieDigestObject(createDefaultLedgerState(), tiers[tiers.length - 1])
      );
}

function reconstructSlotFromDigest(
  d: CookieSlotDigestV1
): HouseholdSlotState | null {
  if (!isPlainRecord(d)) return null;
  if (!isHouseholdSlotId(d.s)) return null;
  if (d.m !== 0 && d.m !== 1) return null;
  if (typeof d.d !== 'number' || !Number.isInteger(d.d) || d.d < 1 || d.d > 1_000_000) {
    return null;
  }
  if (!isValidDateSeed(d.ds)) return null;
  if (typeof d.c !== 'number' || !Number.isInteger(d.c) || d.c < 0 || d.c > 100_000_000) {
    return null;
  }
  if (typeof d.r !== 'number' || !Number.isFinite(d.r) || d.r < -10_000 || d.r > 1_000_000) {
    return null;
  }
  if (typeof d.rg !== 'number' || !Number.isInteger(d.rg) || d.rg < 0 || d.rg >= REGIME_ORDER.length) {
    return null;
  }
  if (typeof d.uv !== 'number' || !Number.isInteger(d.uv) || d.uv < 0 || d.uv > 15) {
    return null;
  }
  if (!Array.isArray(d.stk) || d.stk.length !== 12) return null;

  const reagentStock = {} as Record<ReagentId, number>;
  for (let i = 0; i < 12; i++) {
    const count = d.stk[i];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 999_999) {
      return null;
    }
    reagentStock[CANONICAL_REAGENT_ORDER[i]] = count;
  }

  const unlockedVessels: PotionVessel[] = [];
  for (let i = 0; i < VESSEL_ORDER.length; i++) {
    if ((d.uv & (1 << i)) !== 0) {
      unlockedVessels.push(VESSEL_ORDER[i]);
    }
  }
  if (unlockedVessels.length === 0) {
    unlockedVessels.push('prism');
  }

  if (!Array.isArray(d.pot) || d.pot.length > 6) return null;
  if (d.potL !== undefined && (!Array.isArray(d.potL) || d.potL.length !== d.pot.length)) {
    return null;
  }

  const shelfPotions: CraftedPotion[] = [];
  for (let i = 0; i < d.pot.length; i++) {
    const tuple = d.pot[i];
    if (!Array.isArray(tuple) || tuple.length !== 6) return null;
    const [vesselIdx, sealIdx, effectIdx, purityPct, crispPct, valueX2] = tuple;
    if (
      !Number.isInteger(vesselIdx) ||
      vesselIdx < 0 ||
      vesselIdx >= VESSEL_ORDER.length ||
      !Number.isInteger(sealIdx) ||
      sealIdx < 0 ||
      sealIdx > 31 ||
      !Number.isInteger(effectIdx) ||
      effectIdx < 0 ||
      effectIdx >= EFFECT_ORDER.length ||
      !Number.isInteger(purityPct) ||
      purityPct < 0 ||
      purityPct > 100 ||
      !Number.isInteger(crispPct) ||
      crispPct < 0 ||
      crispPct > 100 ||
      !Number.isInteger(valueX2) ||
      valueX2 < 0 ||
      valueX2 > 10_000_000
    ) {
      return null;
    }

    const vessel = VESSEL_ORDER[vesselIdx];
    const dominantEffect = EFFECT_ORDER[effectIdx];
    const crispness = crispPct / 100;
    const purity = purityPct / 100;

    let layers: DensityLayer[] = [];
    if (d.potL && Array.isArray(d.potL[i])) {
      for (const layerTuple of d.potL[i]) {
        if (!Array.isArray(layerTuple) || layerTuple.length !== 3) return null;
        const [regIdx, prepIdx, volMl] = layerTuple;
        if (
          !Number.isInteger(regIdx) ||
          regIdx < 0 ||
          regIdx >= CANONICAL_REAGENT_ORDER.length ||
          !Number.isInteger(prepIdx) ||
          prepIdx < 0 ||
          prepIdx >= PREP_ORDER.length ||
          !Number.isInteger(volMl) ||
          volMl < 0 ||
          volMl > 99_999
        ) {
          return null;
        }
        const reagentId = CANONICAL_REAGENT_ORDER[regIdx];
        const meta = REAGENT_DIGEST_META[reagentId];
        layers.push({
          reagentId,
          prepForm: PREP_ORDER[prepIdx],
          specificGravity: meta.specificGravity,
          volumeMl: Math.max(1, volMl),
          viscosity: meta.baseViscosity,
          colorRgb: [...meta.baseColorRgb],
          micaIntensity: meta.micaIntensity,
          interfaceSharpness: crispness,
        });
      }
    }

    if (layers.length === 0) {
      const fallbackReagent = EFFECT_FALLBACK_REAGENT[dominantEffect];
      const meta = REAGENT_DIGEST_META[fallbackReagent];
      layers = [
        {
          reagentId: fallbackReagent,
          prepForm: meta.preferredPrep,
          specificGravity: meta.specificGravity,
          volumeMl: 25,
          viscosity: meta.baseViscosity,
          colorRgb: [...meta.baseColorRgb],
          micaIntensity: meta.micaIntensity,
          interfaceSharpness: crispness,
        },
      ];
    }

    shelfPotions.push({
      id: `cookie-s${d.s}-p${i + 1}`,
      name: `${EFFECT_DISPLAY_NAMES[dominantEffect]} ${VESSEL_DISPLAY_NAMES[vessel]}`,
      vessel,
      seal: decodeSealIndex(sealIdx),
      layers,
      purity,
      marblingIndex: Math.round((1 - crispness) * 100) / 100,
      layerCrispness: crispness,
      collectorBrilliance: Math.round(clamp(purity * 0.6 + crispness * 0.4, 0, 1) * 100) / 100,
      ph: 7.0,
      peakTempC: 68,
      dominantEffect,
      baseValueCrowns: valueX2 / 2,
      createdAtDay: d.d,
    });
  }

  if (!Array.isArray(d.cel) || d.cel.length > 6) return null;
  if (d.celP !== undefined && (!Array.isArray(d.celP) || d.celP.length !== d.cel.length)) {
    return null;
  }

  const cellarNodes: CellarNode[] = [];
  for (let i = 0; i < d.cel.length; i++) {
    const tuple = d.cel[i];
    if (!Array.isArray(tuple) || tuple.length !== 3) return null;
    const [appIdx, regIdx, ratioIdx] = tuple;
    if (
      !Number.isInteger(appIdx) ||
      appIdx < 0 ||
      appIdx >= APPARATUS_ORDER.length ||
      !Number.isInteger(regIdx) ||
      regIdx < -1 ||
      regIdx >= CANONICAL_REAGENT_ORDER.length ||
      !Number.isInteger(ratioIdx) ||
      ratioIdx < 0 ||
      ratioIdx >= RATIO_ORDER.length
    ) {
      return null;
    }

    let x = (i + 1) / (d.cel.length + 1);
    let y = 0.5;
    if (d.celP) {
      const pos = d.celP[i];
      if (
        !Array.isArray(pos) ||
        pos.length !== 2 ||
        !Number.isInteger(pos[0]) ||
        !Number.isInteger(pos[1]) ||
        pos[0] < 0 ||
        pos[0] > 100 ||
        pos[1] < 0 ||
        pos[1] > 100
      ) {
        return null;
      }
      x = pos[0] / 100;
      y = pos[1] / 100;
    }

    cellarNodes.push({
      id: `cellar-node-${i + 1}`,
      type: APPARATUS_ORDER[appIdx],
      x,
      y,
      ...(regIdx >= 0 ? { inputReagent: CANONICAL_REAGENT_ORDER[regIdx] } : {}),
      active: true,
      cyclePhase: 0,
    });
  }

  const cellarEdges: CellarPipeEdge[] = [];
  if (d.celE !== undefined) {
    if (!Array.isArray(d.celE) || d.celE.length > 16) return null;
    for (let i = 0; i < d.celE.length; i++) {
      const edgeTuple = d.celE[i];
      if (!Array.isArray(edgeTuple) || edgeTuple.length !== 3) return null;
      const [fromIdx, toIdx, ratioIdx] = edgeTuple;
      if (
        !Number.isInteger(fromIdx) ||
        !Number.isInteger(toIdx) ||
        fromIdx < 0 ||
        fromIdx >= cellarNodes.length ||
        toIdx < 0 ||
        toIdx >= cellarNodes.length ||
        fromIdx === toIdx ||
        !Number.isInteger(ratioIdx) ||
        ratioIdx < 0 ||
        ratioIdx >= RATIO_ORDER.length
      ) {
        return null;
      }
      cellarEdges.push({
        id: `cellar-edge-${i + 1}`,
        fromNodeId: cellarNodes[fromIdx].id,
        toNodeId: cellarNodes[toIdx].id,
        ratio: RATIO_ORDER[ratioIdx],
        dropletProgress: 0,
      });
    }
  } else if (cellarNodes.length >= 2) {
    for (let i = 0; i < cellarNodes.length - 1; i++) {
      const ratioIdx = d.cel[i][2];
      cellarEdges.push({
        id: `cellar-edge-${i + 1}`,
        fromNodeId: cellarNodes[i].id,
        toNodeId: cellarNodes[i + 1].id,
        ratio: RATIO_ORDER[ratioIdx],
        dropletProgress: 0,
      });
    }
  }

  if (!Array.isArray(d.qnt) || (d.qnt.length !== 0 && d.qnt.length !== 12 && d.qnt.length !== 24)) {
    return null;
  }
  for (const val of d.qnt) {
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 999_999) {
      return null;
    }
  }
  const quintessences: Partial<Record<ReagentId, number>> = {};
  const catalystSalts: Partial<Record<ReagentId, number>> = {};
  if (d.qnt.length === 12) {
    for (let i = 0; i < 12; i++) {
      const id = CANONICAL_REAGENT_ORDER[i];
      const q = d.qnt[i] % 1000;
      const s = Math.floor(d.qnt[i] / 1000);
      if (q > 0) quintessences[id] = q;
      if (s > 0) catalystSalts[id] = s;
    }
  } else if (d.qnt.length === 24) {
    for (let i = 0; i < 12; i++) {
      const id = CANONICAL_REAGENT_ORDER[i];
      if (d.qnt[i] > 0) quintessences[id] = d.qnt[i];
      if (d.qnt[12 + i] > 0) catalystSalts[id] = d.qnt[12 + i];
    }
  }

  if (typeof d.cmp !== 'number' || !Number.isInteger(d.cmp) || d.cmp < 0 || d.cmp > 0x7fffffff) {
    return null;
  }

  let completedCommissionIds: string[] = [];
  if (d.cmpIds !== undefined) {
    if (!Array.isArray(d.cmpIds) || d.cmpIds.length > 32) return null;
    for (const item of d.cmpIds) {
      if (typeof item !== 'string') return null;
    }
    completedCommissionIds = [...d.cmpIds];
  } else if (d.cmp > 0) {
    for (let bit = 0; bit < 30; bit++) {
      if ((d.cmp & (1 << bit)) !== 0) {
        completedCommissionIds.push(`commission-bit-${bit}`);
      }
    }
  }

  if (d.lbl !== undefined && typeof d.lbl !== 'string') {
    return null;
  }

  return {
    slotId: d.s,
    label: d.lbl && d.lbl.length > 0 ? d.lbl : DEFAULT_SLOT_LABELS[d.s],
    mode: d.m === 1 ? 'grandmaster' : 'apprentice',
    day: d.d,
    dateSeed: d.ds,
    crowns: d.c / 2,
    reputation: d.r,
    regime: REGIME_ORDER[d.rg],
    unlockedVessels,
    reagentStock,
    shelfPotions,
    cellarGraph: {
      nodes: cellarNodes,
      edges: cellarEdges,
      quintessences,
      catalystSalts,
    },
    completedCommissionIds,
    ledgerEntries: [],
    updatedAtIso: `${d.ds}T06:00:00.000Z`,
  };
}

/**
 * Decodes and verifies a `v1.<crc32hex>.<base64url>` cookie digest.
 * Returns `null` on any prefix, CRC32, UTF-8, JSON, or bounds failure.
 */
export function decodeCookieVaultDigest(raw: string): LedgerSaveStateV1 | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > COOKIE_MAX_BYTES) {
    return null;
  }
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return null;
  }
  const [, crcHex, b64] = parts;
  if (!CRC32_HEX_REGEX.test(crcHex) || !BASE64URL_REGEX.test(b64)) {
    return null;
  }
  if (computeCrc32Hex(b64) !== crcHex) {
    return null;
  }

  const bytes = decodeBase64Url(b64);
  if (!bytes) {
    return null;
  }

  let parsed: unknown;
  try {
    const json = TEXT_DECODER_FATAL.decode(bytes);
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isPlainRecord(parsed)) return null;
  if (parsed.v !== 1 || !isHouseholdSlotId(parsed.active)) return null;
  if (!Array.isArray(parsed.slots) || parsed.slots.length !== 3) return null;

  if (parsed.am !== undefined && parsed.am !== 0 && parsed.am !== 1) return null;
  if (
    parsed.av !== undefined &&
    (typeof parsed.av !== 'number' || !Number.isInteger(parsed.av) || parsed.av < 0 || parsed.av > 100)
  ) {
    return null;
  }

  const slotsMap: Partial<Record<HouseholdSlotId, HouseholdSlotState>> = {};
  for (const rawSlot of parsed.slots) {
    const slot = reconstructSlotFromDigest(rawSlot as CookieSlotDigestV1);
    if (!slot || slotsMap[slot.slotId]) {
      return null;
    }
    slotsMap[slot.slotId] = slot;
  }

  if (!slotsMap[1] || !slotsMap[2] || !slotsMap[3]) {
    return null;
  }

  return {
    schemaVersion: 1,
    activeSlot: parsed.active,
    slots: {
      1: slotsMap[1],
      2: slotsMap[2],
      3: slotsMap[3],
    },
    audioMuted: parsed.am === 1,
    audioVolume: parsed.av !== undefined ? parsed.av / 100 : 0.75,
  };
}

function pickDeterministicRegime(dateSeed: string, day: number): MarketRegime {
  const hashHex = computeCrc32Hex(`${dateSeed}:${day}`);
  const idx = parseInt(hashHex, 16) % REGIME_ORDER.length;
  return REGIME_ORDER[idx];
}

function extractCookieValue(rawCookieString: string, cookieName: string): string | null {
  if (typeof rawCookieString !== 'string' || rawCookieString.length === 0) {
    return null;
  }
  const segments = rawCookieString.split(';');
  let found: string | null = null;
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key === cookieName) {
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!val) {
        found = null;
      } else if (val.includes('%')) {
        try {
          found = decodeURIComponent(val);
        } catch {
          found = null;
        }
      } else {
        found = val;
      }
    }
  }
  return found;
}

/**
 * Tri-store persistence manager bridging LocalStorage, IndexedDB, and the
 * `krunked-cookie-vault-v1` shadow cookie with bidirectional self-healing.
 */
export class VaultManager {
  private readonly storage: Storage | undefined;
  private readonly cookieTarget: { cookie: string } | undefined;
  private readonly useIdb: boolean;

  constructor(opts?: VaultManagerOptions) {
    this.storage =
      opts?.storage !== undefined
        ? opts.storage
        : typeof globalThis.localStorage !== 'undefined'
          ? globalThis.localStorage
          : undefined;
    this.cookieTarget =
      opts?.cookieTarget !== undefined
        ? opts.cookieTarget
        : typeof globalThis.document !== 'undefined'
          ? globalThis.document
          : undefined;
    this.useIdb = opts?.useIdb !== undefined ? opts.useIdb : true;
  }

  private getIdbFactory(): IDBFactory | undefined {
    if (!this.useIdb || typeof globalThis.indexedDB === 'undefined') {
      return undefined;
    }
    return globalThis.indexedDB;
  }

  private readLocalStorage(): LedgerSaveStateV1 | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(PRIMARY_LS_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return validateAndNormalizeLedgerState(parsed);
    } catch {
      return null;
    }
  }

  private writeLocalStorage(state: LedgerSaveStateV1): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(PRIMARY_LS_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  private readRawCookie(): string | null {
    if (!this.cookieTarget) return null;
    try {
      return extractCookieValue(this.cookieTarget.cookie, COOKIE_VAULT_NAME);
    } catch {
      return null;
    }
  }

  private readCookieState(): { state: LedgerSaveStateV1 | null; raw: string | null } {
    const raw = this.readRawCookie();
    if (!raw) return { state: null, raw: null };
    return { state: decodeCookieVaultDigest(raw), raw };
  }

  private writeCookie(state: LedgerSaveStateV1): string {
    const encoded = encodeCookieVaultDigest(state);
    if (this.cookieTarget) {
      try {
        this.cookieTarget.cookie = `${COOKIE_VAULT_NAME}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // Ignore restricted cookie contexts safely.
      }
    }
    return encoded;
  }

  private openIdb(): Promise<IDBDatabase | null> {
    const factory = this.getIdbFactory();
    if (!factory) return Promise.resolve(null);

    return new Promise((resolve) => {
      try {
        const req = factory.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
              db.createObjectStore(IDB_STORE);
            }
          } catch {
            // Store creation failure is surfaced on onerror/tx check.
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          try {
            db.onversionchange = () => {
              try {
                db.close();
              } catch {
                // Ignore close error.
              }
            };
          } catch {
            // Mock DB may not allow assigning onversionchange.
          }
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async readIdb(): Promise<LedgerSaveStateV1 | null> {
    const db = await this.openIdb();
    if (!db) return null;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (val: LedgerSaveStateV1 | null): void => {
        if (settled) return;
        settled = true;
        try {
          db.close();
        } catch {
          // Ignore close error.
        }
        resolve(val);
      };

      try {
        if (
          db.objectStoreNames &&
          typeof db.objectStoreNames.contains === 'function' &&
          !db.objectStoreNames.contains(IDB_STORE)
        ) {
          finish(null);
          return;
        }
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const getReq = store.get(PRIMARY_LS_KEY);
        getReq.onsuccess = () => {
          finish(validateAndNormalizeLedgerState(getReq.result));
        };
        getReq.onerror = () => finish(null);
        tx.onerror = () => finish(null);
        tx.onabort = () => finish(null);
      } catch {
        finish(null);
      }
    });
  }

  private async writeIdb(state: LedgerSaveStateV1): Promise<boolean> {
    const db = await this.openIdb();
    if (!db) return false;

    const payload = cloneLedgerState(state);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        try {
          db.close();
        } catch {
          // Ignore close error.
        }
        resolve(ok);
      };

      try {
        if (
          db.objectStoreNames &&
          typeof db.objectStoreNames.contains === 'function' &&
          !db.objectStoreNames.contains(IDB_STORE)
        ) {
          finish(false);
          return;
        }
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const putReq = store.put(payload, PRIMARY_LS_KEY);
        const supportsTxComplete = 'oncomplete' in tx;

        if (supportsTxComplete) {
          tx.oncomplete = () => finish(true);
          tx.onerror = () => finish(false);
          tx.onabort = () => finish(false);
          putReq.onerror = () => finish(false);
        } else {
          putReq.onsuccess = () => finish(true);
          putReq.onerror = () => finish(false);
        }
      } catch {
        finish(false);
      }
    });
  }

  /**
   * Boots the vault, performing bidirectional self-healing across LocalStorage,
   * IndexedDB, and `krunked-cookie-vault-v1`, or creating a fresh state if empty.
   */
  async boot(todayDateSeed?: string): Promise<VaultBootResult> {
    const lsState = this.readLocalStorage();
    const idbState = await this.readIdb();
    const { state: cookieState, raw: rawCookie } = this.readCookieState();

    if (lsState) {
      if (!idbState) {
        await this.writeIdb(lsState);
      }
      const expectedCookie = encodeCookieVaultDigest(lsState);
      if (!cookieState || rawCookie !== expectedCookie) {
        this.writeCookie(lsState);
      }
      return { state: cloneLedgerState(lsState), healedFrom: 'primary' };
    }

    if (idbState) {
      this.writeLocalStorage(idbState);
      const expectedCookie = encodeCookieVaultDigest(idbState);
      if (!cookieState || rawCookie !== expectedCookie) {
        this.writeCookie(idbState);
      }
      return { state: cloneLedgerState(idbState), healedFrom: 'idb' };
    }

    if (cookieState) {
      this.writeLocalStorage(cookieState);
      await this.writeIdb(cookieState);
      return { state: cloneLedgerState(cookieState), healedFrom: 'cookie' };
    }

    return {
      state: createDefaultLedgerState(todayDateSeed),
      healedFrom: 'fresh',
    };
  }

  /**
   * Persists the full LedgerSaveStateV1 to LocalStorage, IndexedDB, and the
   * compact `krunked-cookie-vault-v1` shadow cookie.
   */
  async save(state: LedgerSaveStateV1): Promise<{ cookieBytes: number }> {
    const normalized = validateAndNormalizeLedgerState(state);
    if (!normalized) {
      throw new Error('Cannot save invalid LedgerSaveStateV1');
    }
    this.writeLocalStorage(normalized);
    await this.writeIdb(normalized);
    const cookieDigest = this.writeCookie(normalized);
    return { cookieBytes: TEXT_ENCODER.encode(cookieDigest).length };
  }

  /**
   * Audits all three persistence layers and heals any missing or corrupted store
   * from the highest-authority valid store available.
   */
  async auditAndHeal(): Promise<VaultAuditResult> {
    const lsState = this.readLocalStorage();
    const idbAvailable = this.getIdbFactory() !== undefined;
    const idbState = idbAvailable ? await this.readIdb() : null;
    const { state: cookieState, raw: rawCookie } = this.readCookieState();

    if (lsState) {
      let healed = false;
      if (idbAvailable && !idbState) {
        await this.writeIdb(lsState);
        healed = true;
      }
      const expectedCookie = encodeCookieVaultDigest(lsState);
      if (!cookieState || rawCookie !== expectedCookie) {
        this.writeCookie(lsState);
        healed = true;
      }
      return {
        healed,
        source: 'primary',
        state: cloneLedgerState(lsState),
      };
    }

    if (idbState) {
      this.writeLocalStorage(idbState);
      const expectedCookie = encodeCookieVaultDigest(idbState);
      if (!cookieState || rawCookie !== expectedCookie) {
        this.writeCookie(idbState);
      }
      return {
        healed: true,
        source: 'idb',
        state: cloneLedgerState(idbState),
      };
    }

    if (cookieState) {
      this.writeLocalStorage(cookieState);
      await this.writeIdb(cookieState);
      return {
        healed: true,
        source: 'cookie',
        state: cloneLedgerState(cookieState),
      };
    }

    return {
      healed: false,
      source: 'none',
    };
  }

  /**
   * Switches the active household Wax-Seal slot (1, 2, or 3) without disturbing
   * the independent progress of the other two slots, and persists across stores.
   */
  async switchHouseholdSlot(
    state: LedgerSaveStateV1,
    slotId: HouseholdSlotId
  ): Promise<LedgerSaveStateV1> {
    if (!isHouseholdSlotId(slotId)) {
      throw new Error(`Invalid HouseholdSlotId: ${String(slotId)}`);
    }
    const next = cloneLedgerState(state);
    next.activeSlot = slotId;
    await this.save(next);
    return next;
  }

  /**
   * Executes a deterministic `YYYY-MM-DD` New Dawn Reset on the active slot.
   * Calling repeatedly with the same `nextDateSeed` is idempotent.
   */
  async triggerNewDawnReset(
    state: LedgerSaveStateV1,
    nextDateSeed: string
  ): Promise<LedgerSaveStateV1> {
    if (!isValidDateSeed(nextDateSeed)) {
      throw new Error(`Invalid YYYY-MM-DD dateSeed: ${nextDateSeed}`);
    }
    const next = cloneLedgerState(state);
    const active = next.slots[next.activeSlot];

    if (active.dateSeed === nextDateSeed) {
      await this.save(next);
      return next;
    }

    const nextDay = active.day + 1;
    const nextRegime = pickDeterministicRegime(nextDateSeed, nextDay);
    const dawnIso = `${nextDateSeed}T06:00:00.000Z`;

    active.day = nextDay;
    active.dateSeed = nextDateSeed;
    active.regime = nextRegime;
    active.updatedAtIso = dawnIso;
    active.ledgerEntries.push({
      id: `dawn-${nextDateSeed}-d${nextDay}`,
      day: nextDay,
      timestampIso: dawnIso,
      text: `New Dawn (${nextDateSeed}): market regime ${nextRegime}`,
      deltaCrowns: 0,
      kind: 'reset',
    });

    await this.save(next);
    return next;
  }

  /**
   * Exports the LedgerSaveStateV1 cleanly as a `.ledger.json` JSON string.
   */
  exportLedgerJson(state: LedgerSaveStateV1): string {
    const normalized = validateAndNormalizeLedgerState(state);
    if (!normalized) {
      throw new Error('Cannot export invalid LedgerSaveStateV1');
    }
    return JSON.stringify(normalized, null, 2);
  }

  /**
   * Validates and imports a `.ledger.json` string, returning `null` safely on
   * any malformed, truncated, or schema-invalid JSON without throwing.
   */
  importLedgerJson(rawJson: string): LedgerSaveStateV1 | null {
    if (typeof rawJson !== 'string' || rawJson.trim().length === 0) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(rawJson);
      return validateAndNormalizeLedgerState(parsed);
    } catch {
      return null;
    }
  }
}
