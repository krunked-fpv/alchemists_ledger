# Alchemists Ledger — Frozen Technical Specification (`SPEC.md`)

All specialists MUST implement these exact constants, type definitions, uniform contracts, and exported interfaces verbatim.

---

## 1. Global Constants

```ts
export const PWA_CACHE_VERSION = 'alchemists-ledger-v1' as const;
export const COOKIE_VAULT_NAME = 'krunked-cookie-vault-v1' as const;
export const PRIMARY_LS_KEY = 'alchemists_ledger_primary_v1' as const;
export const IDB_NAME = 'alchemists_ledger_idb' as const;
export const IDB_STORE = 'ledger_slots_v1' as const;
export const COOKIE_MAX_BYTES = 3900 as const;
```

---

## 2. Canonical Domain Primitives & 12-Reagent Table

```ts
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

export type MarketRegime =
  | 'calm'
  | 'dragon_siege'
  | 'bumper_harvest'
  | 'glacial_snap'
  | 'starfall_conclave';

export type GameMode = 'apprentice' | 'grandmaster';
export type HouseholdSlotId = 1 | 2 | 3;
export type BrassWeightDenom = 50 | 25 | 10 | 5 | 1 | 0.5;
export type PolyrhythmRatio = '3:4' | '4:5' | '5:6';

export type CellarApparatusType =
  | 'boiling_retort'
  | 'graham_condenser'
  | 'copper_siphon'
  | 'drip_alembic';

export type EnvoyArchetypeId =
  | 'singed_warden'
  | 'guild_loupe_connoisseur'
  | 'rain_soaked_herbalist'
  | 'frostbitten_courier'
  | 'starfall_astronomer'
  | 'iron_miner_factor'
  | 'court_chirurgeon'
  | 'wandering_bard_peddler';

export type PotionEffectTag =
  | 'fire_ward'
  | 'burn_salve'
  | 'hearth_tonic'
  | 'galaxy_elixir'
  | 'neutralizing_salve'
  | 'soothing_draught';
```

### Canonical Reagent Physical Properties

| Index | ID | Category | Specific Gravity ($\rho$) | Base Viscosity ($\mu$) | $\Delta\text{pH}$ | $\Delta H$ (C) | Base Cost (Crowns) |
|---:|---|---|---:|---:|---:|---:|---:|
| 0 | `amber_honey_resin` | `resin` | 1.42 | 15.5 | -0.6 | +4 | 8 |
| 1 | `cinnabar_sulfur_ash` | `mineral` | 1.55 | 4.2 | -1.8 | +28 | 14 |
| 2 | `bismuth_vitriol_salt` | `crystal` | 1.48 | 3.0 | -2.4 | +16 | 12 |
| 3 | `glacial_alum_shard` | `crystal` | 1.34 | 2.4 | +1.9 | -26 | 11 |
| 4 | `chalk_pearl_lime` | `mineral` | 1.26 | 5.0 | +2.8 | -8 | 9 |
| 5 | `verdigris_moss_sap` | `botanical` | 1.14 | 6.8 | -0.9 | -5 | 7 |
| 6 | `saffron_hearth_pollen` | `botanical` | 1.08 | 3.6 | +0.4 | +22 | 10 |
| 7 | `cobalt_lotus_nectar` | `botanical` | 1.02 | 4.4 | +1.1 | -12 | 11 |
| 8 | `moonveil_lichen_dew` | `botanical` | 0.96 | 1.8 | -0.3 | -15 | 9 |
| 9 | `rose_madder_distillate` | `botanical` | 0.92 | 2.1 | -1.4 | +6 | 10 |
| 10 | `auric_mica_suspension` | `mica` | 0.88 | 2.9 | 0.0 | +2 | 16 |
| 11 | `starlight_aether_oil` | `oil` | 0.82 | 1.1 | +0.8 | -18 | 18 |

---

## 3. Alchemy, Fluid, & Vessel Contracts

```ts
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
```

### `src/alchemy/index.ts` Exported Surface
- `REAGENT_CATALOG: Record<ReagentId, ReagentSpec>`
- `getPhIndicatorRgb(ph: number): [number, number, number]`
- `computeEffectiveShearCrit(meanViscosity: number, tempC: number): number`
- `class CauldronSimulator`:
  - `constructor(mode?: GameMode)`
  - `setMode(mode: GameMode): void`
  - `reset(ambientTempC?: number): void`
  - `addReagent(reagentId: ReagentId, prepForm: PrepForm, volumeMl?: number): CauldronFluidState`
  - `pumpBellows(impulse?: number): CauldronFluidState`
  - `applyLadleStir(angularVelocityRadS: number, dtSec: number): CauldronFluidState`
  - `stepCooling(dtSec: number): CauldronFluidState`
  - `getState(): CauldronFluidState`
  - `decantToPotion(vessel: PotionVessel, seal: WaxSealSpec, day: number, id?: string): CraftedPotion`
- `evaluateCommission(potion: CraftedPotion, commission: FestivalCommissionSpec): { satisfied: boolean; bonusMultiplier: number; reason: string }`
- `generateProceduralCommissions(opts: { regime: MarketRegime; day: number; completedIds: readonly string[]; seed: string; count?: number }): FestivalCommissionSpec[]`

---

## 4. Shader Uniform & Renderer Contract (`shaders/*.glsl` & `src/render/**`)

```ts
export interface CauldronShaderUniforms {
  u_time: number;
  u_dt: number;                 // clamped [1/240, 1/20]
  u_resolution: [number, number];
  u_pointerPos: [number, number]; // normalized [0..1]
  u_pointerVel: [number, number]; // clamped [-8, 8]
  u_ladleOmega: number;
  u_viscosity: number;          // clamped [0.5, 25.0]
  u_temperature: number;        // normalized [0..1] over [15C..115C]
  u_marbling: number;           // [0..1]
  u_layerCrispness: number;     // [0..1]
  u_micaAmount: number;         // [0..1]
  u_rippleOrigin: [number, number];
  u_ripplePhase: number;        // [0..1]
  u_layerColors: [number, number, number][]; // up to 4 RGB triplets
  u_layerDensities: number[];   // up to 4 normalized heights
}

export interface CauldronLayerVisual {
  colorRgb: [number, number, number];
  specificGravity: number;
  volumeFraction: number;
  micaIntensity: number;
  sharpness: number;
}
```

### Required GLSL Uniforms
- `shaders/cauldron_core.glsl`: Declares and uses `u_time`, `u_dt`, `u_resolution`, `u_pointerPos`, `u_pointerVel`, `u_ladleOmega`, `u_viscosity`, `u_temperature`, `u_marbling`, `u_layerCrispness`, `u_micaAmount`, `u_rippleOrigin`, `u_ripplePhase`, `u_layerColors[4]`, `u_layerDensities[4]`, `u_prevState` (ping-pong sampler), plus multi-pass orchestration uniforms `u_pass`, `u_fboEncoded`, `u_hasWarpTex`, `u_warpTex`, `u_simTex`, and `u_phRgb` with vorticity confinement + Jacobi pressure projection + NaN/Inf safe clamping.
- `shaders/glass_caustics.glsl`: Declares `u_time`, `u_resolution`, `u_vesselType` (`0=prism, 1=teardrop, 2=crescent, 3=carafe`), `u_pourProgress`, `u_waxStamped`, `u_waxColor`, `u_layerColors[4]`, `u_layerDensities[4]`, plus seal/fluid state uniforms `u_corked`, `u_waxPoured`, `u_layerCrispness`, and `u_marbling`.
- `shaders/stained_glass_weather.glsl`: Declares `u_time`, `u_resolution`, `u_regimeIndex` (`0=calm, 1=dragon_siege, 2=bumper_harvest, 3=glacial_snap, 4=starfall_conclave`), `u_sunAngle`.

### `src/render/index.ts` & `src/render/fluid_cpu_ref.ts` Exported Surface
- `stepFluidSolverCpuRef(params: { dt: number; pointerVel: [number, number]; ladleOmega: number; viscosity: number; temperatureC: number; grid?: Float32Array }): { maxVelocity: number; vorticityPeak: number; hasNaN: boolean; grid: Float32Array }`
- `compileCheckHeadless(): { cauldronShaderValid: boolean; causticsShaderValid: boolean; weatherShaderValid: boolean; uniformsVerified: string[] }`
- `class ApothecaryRenderer`:
  - `constructor(opts: { cauldronCanvas: HTMLCanvasElement; decantCanvas?: HTMLCanvasElement; windowCanvas?: HTMLCanvasElement })`
  - `getBackend(): 'webgl2' | 'canvas2d'`
  - `updateCauldronState(state: { layers: CauldronLayerVisual[]; temperatureC: number; viscosity: number; marblingIndex: number; layerCrispness: number; phRgb: [number, number, number] }): void`
  - `setLadleMotion(nx: number, ny: number, vx: number, vy: number, omegaRadS: number): void`
  - `triggerDropletRipple(nx: number, ny: number): void`
  - `triggerCelebrationBurst(intensity?: number): void`
  - `updateDecantView(opts: { vessel: PotionVessel; pourProgress: number; corked: boolean; waxColor: WaxSealSpec['color']; waxPoured: boolean; waxStamped: boolean; layers: CauldronLayerVisual[] }): void`
  - `updateWeather(regime: MarketRegime): void`
  - `start(): void`
  - `stop(): void`
  - `renderFrame(nowMs: number): void`
  - `dispose(): void`

---

## 5. Kinetic Cellar Glasswork Contracts (`src/cellar/index.ts`)

```ts
export interface CellarNode {
  id: string;
  type: CellarApparatusType;
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
  inputReagent?: ReagentId;
  active: boolean;
  cyclePhase: number; // [0..1]
}

export interface CellarPipeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  ratio: PolyrhythmRatio;
  dropletProgress: number; // [0..1]
}

export interface CellarPipeGraph {
  nodes: CellarNode[];
  edges: CellarPipeEdge[];
  quintessences: Partial<Record<ReagentId, number>>;
  catalystSalts: Partial<Record<ReagentId, number>>;
}

export interface DistillationTickEvent {
  type: 'cellar_drip';
  edgeId: string;
  ratio: PolyrhythmRatio;
  midiNote: number;
  producedItem?: { kind: 'cellar_quintessence' | 'catalyst_salt'; reagentId: ReagentId; units: number };
}
```

### `src/cellar/index.ts` Exported Surface
- `evalCubicBezier(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number]`
- `class CellarAutomationEngine`:
  - `constructor(initialGraph?: CellarPipeGraph)`
  - `getGraph(): CellarPipeGraph`
  - `loadGraph(graph: CellarPipeGraph): void`
  - `addNode(type: CellarApparatusType, x: number, y: number, inputReagent?: ReagentId): CellarNode`
  - `connectNodes(fromNodeId: string, toNodeId: string, ratio?: PolyrhythmRatio): CellarPipeEdge | null`
  - `removeNode(nodeId: string): void`
  - `setNodeReagent(nodeId: string, reagentId: ReagentId): void`
  - `tick(dtSec: number, consumeBotanical?: (reagentId: ReagentId) => boolean): DistillationTickEvent[]`
  - `consumeRefined(kind: 'cellar_quintessence' | 'catalyst_salt', reagentId: ReagentId): boolean`

---

## 6. Audio Physics Bus & Procedural ASMR Engine (`src/audio/index.ts`)

```ts
export type AudioPhysicsBusEvent =
  | { type: 'mortar_grind'; hardness: number; speed: number }
  | { type: 'herb_slice'; wetness: number }
  | { type: 'pipette_drop'; viscosity: number; pitchOffset?: number }
  | { type: 'ladle_swirl'; angularSpeed: number; viscosity: number }
  | { type: 'bellows_pump'; intensity: number }
  | { type: 'cauldron_simmer'; temperatureC: number; viscosity: number }
  | { type: 'glass_clink'; vessel: PotionVessel; momentum: number }
  | { type: 'cork_pop' }
  | { type: 'wax_sizzle'; phase: 'pour' | 'stamp' }
  | { type: 'scale_weight_clink'; denom: BrassWeightDenom; momentum: number }
  | { type: 'quill_scratch'; intensity: number }
  | { type: 'cellar_drip'; midiNote: number; ratio: PolyrhythmRatio }
  | { type: 'weather_ambience'; regime: MarketRegime }
  | { type: 'station_transition'; fromIndex: number; toIndex: number; toCellar: boolean }
  | { type: 'celebration_fanfare'; kind: 'seal_masterwork' | 'bargain_struck' | 'commission_fulfilled' | 'dawn_chime' | 'cellar_harvest'; intensity?: number };
```

### `src/audio/index.ts` Exported Surface
- `class AudioPhysicsBus`:
  - `on(listener: (event: AudioPhysicsBusEvent) => void): () => void`
  - `emit(event: AudioPhysicsBusEvent): void`
  - `clear(): void`
- `export const globalAudioBus: AudioPhysicsBus`
- `synthesizeKarplusStrongBuffer(sampleRate: number, freqHz: number, durationSec: number, damping?: number): Float32Array`
- `class ProceduralAsmrAudioEngine`:
  - `constructor(bus?: AudioPhysicsBus, contextFactory?: () => AudioContext)`
  - `unlock(): Promise<boolean>`
  - `isUnlocked(): boolean`
  - `setMuted(muted: boolean): void`
  - `isMuted(): boolean`
  - `setMasterVolume(level: number): void` // [0..1]
  - `getMasterVolume(): number`
  - `setWeatherRegime(regime: MarketRegime): void`
  - `getActiveNodeCount(): number`
  - `dispose(): void`

---

## 7. Dynamic Market Roguelike, Envoys & Balance Scales (`simulation/*.ts`)

```ts
export interface MarketSnapshot {
  regime: MarketRegime;
  day: number;
  reagentBuyPrices: Record<ReagentId, number>;
  reagentSellBackPrices: Record<ReagentId, number>; // strictly <= 0.65 * buyPrice (anti-arbitrage)
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
  priceElasticity: number;     // lower = less sensitive to high markup
  qualitySensitivity: number;  // higher = demands high purity/marbling
  maxWillingnessCrowns: number;
  fairOfferCrowns: number;
  patienceLeft: number;        // [1..4]
}

export interface BrassScaleState {
  leftMassCrowns: number;      // potion valuation weight
  rightMassCrowns: number;     // placed brass counterweights
  weightsOnPan: BrassWeightDenom[];
  tiltAngleRad: number;
  angularVelRadS: number;
  settled: boolean;
  balanced: boolean;           // |left - right| <= tolerance
}

export interface LedgerEntry {
  id: string;
  day: number;
  timestampIso: string;
  text: string;
  deltaCrowns: number;
  kind: 'sale' | 'purchase' | 'overhead' | 'commission' | 'reset';
}
```

### `simulation/market_shocks.ts` Exported Surface
- `computeMarketSnapshot(regime: MarketRegime, day: number, festivalModifiers?: Partial<Record<ReagentId, number>>): MarketSnapshot`
- `computeCellarHedgeYield(baseReagentId: ReagentId, regime: MarketRegime, units: number): number`
- `pickDailyMarketRegime(dateSeed: string, day: number, prevRegime?: MarketRegime): MarketRegime`

### `simulation/npc_envoys.ts` Exported Surface
- `ENVOY_ARCHETYPES: Record<EnvoyArchetypeId, { title: string; postureTell: string; eyeTell: string; preferredEffects: PotionEffectTag[]; priceElasticity: number; qualitySensitivity: number }>`
- `generateEnvoyForPotion(potion: CraftedPotion | null, snapshot: MarketSnapshot, seedStr: string, recentNames?: readonly string[]): EnvoyOffer`
- `class BrassBalanceScale`:
  - `constructor(leftMassCrowns?: number)`
  - `setLeftMass(crowns: number): void`
  - `addWeight(denom: BrassWeightDenom): BrassScaleState`
  - `removeWeight(index: number): BrassScaleState`
  - `clearWeights(): BrassScaleState`
  - `step(dtSec: number): BrassScaleState`
  - `getState(): BrassScaleState`

### `simulation/haggling_matrix.ts` Exported Surface
- `appraisePotionForMarket(potion: CraftedPotion, snapshot: MarketSnapshot): number`
- `evaluateBargainProposal(offer: EnvoyOffer, potion: CraftedPotion, scaleCounterweightCrowns: number, snapshot: MarketSnapshot): { outcome: 'accepted' | 'counter' | 'walked'; finalCrowns: number; envoyReaction: string; nextOffer: EnvoyOffer }`
- `canSellBackRawReagent(reagentId: ReagentId, quantity: number, snapshot: MarketSnapshot): { revenueCrowns: number; netArbitrageCheck: number }`
- `applyEndOfDaySolvency(crowns: number, mode: GameMode, snapshot: MarketSnapshot): { nextCrowns: number; insolvent: boolean; overheadPaid: number }`

---

## 8. Shadow-Cookie Vault & Festival JSON Schemas (`src/vault/**` & `public/data/festivals.json`)

```ts
export interface HouseholdSlotState {
  slotId: HouseholdSlotId;
  label: string;
  mode: GameMode;
  day: number;
  dateSeed: string; // YYYY-MM-DD
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

export interface CookieVaultDigestV1 {
  v: 1;
  active: HouseholdSlotId;
  slots: Array<{
    s: HouseholdSlotId;
    m: 0 | 1;            // 0=apprentice, 1=grandmaster
    d: number;           // day
    ds: string;          // YYYY-MM-DD compact
    c: number;           // crowns * 2 (half-crown integer)
    r: number;           // reputation
    rg: number;          // regime index 0..4
    uv: number;          // 4-bit vessel unlock mask
    stk: number[];       // 12 integers [0..999]
    pot: Array<[number, number, number, number, number, number]>; // up to 6 compact shelf tuples [vesselIdx, sealIdx, effectIdx, purityPct, crispPct, valueX2]
    cel: Array<[number, number, number]>; // up to 6 cellar nodes [apparatusIdx, reagentIdx, ratioIdx]
    qnt: number[];       // packed quintessence/salt counts
    cmp: number;         // completed commission bitmask
    lbl?: string;        // optional trimmed household label
    potL?: Array<Array<[number, number, number]>>; // optional layer digests [reagentIdx, prepIdx, volPct]
    celE?: Array<[number, number, number]>;        // optional pipe edges [fromIdx, toIdx, ratioIdx]
    celP?: Array<[number, number]>;                // optional quantized node positions
    cmpIds?: string[];                             // optional commission IDs
  }>;
  am?: 0 | 1;            // optional audioMuted flag
  av?: number;           // optional quantized audioVolume (0..100)
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

export interface FestivalPayloadV1 {
  schemaVersion: 1;
  isoYearWeek: string;   // e.g. "2026-W48"
  festivalName: string;
  regime: MarketRegime;
  loreNote: string;
  reagentElasticityModifiers: Record<ReagentId, number>;
  envoyBiasWeights: Record<EnvoyArchetypeId, number>;
  commissions: FestivalCommissionSpec[];
}
```

### `src/vault/index.ts` Exported Surface
- `computeCrc32Hex(input: string): string`
- `encodeCookieVaultDigest(state: LedgerSaveStateV1): string` // returns `v1.<crc32hex>.<base64url>`, strictly <= 3900 bytes
- `decodeCookieVaultDigest(raw: string): LedgerSaveStateV1 | null`
- `createDefaultLedgerState(dateSeed?: string): LedgerSaveStateV1`
- `createDefaultSlotState(slotId: HouseholdSlotId, mode?: GameMode, dateSeed?: string): HouseholdSlotState`
- `class VaultManager`:
  - `constructor(opts?: { storage?: Storage; cookieTarget?: { cookie: string }; useIdb?: boolean })`
  - `boot(todayDateSeed?: string): Promise<{ state: LedgerSaveStateV1; healedFrom: 'primary' | 'idb' | 'cookie' | 'fresh' }>`
  - `save(state: LedgerSaveStateV1): Promise<{ cookieBytes: number }>`
  - `auditAndHeal(): Promise<{ healed: boolean; source: 'primary' | 'idb' | 'cookie' | 'none'; state?: LedgerSaveStateV1 }>`
  - `switchHouseholdSlot(state: LedgerSaveStateV1, slotId: HouseholdSlotId): Promise<LedgerSaveStateV1>`
  - `triggerNewDawnReset(state: LedgerSaveStateV1, nextDateSeed: string): Promise<LedgerSaveStateV1>`
  - `exportLedgerJson(state: LedgerSaveStateV1): string`
  - `importLedgerJson(rawJson: string): LedgerSaveStateV1 | null`
