import {
  CANONICAL_REAGENT_ORDER,
  REAGENT_CATALOG,
  CauldronSimulator,
  getPhIndicatorRgb,
  evaluateCommission,
  type CauldronFluidState,
  type CraftedPotion,
  type FestivalCommissionSpec,
  type GameMode,
  type PotionVessel,
  type PrepForm,
  type ReagentId,
  type WaxSealSpec,
} from '../alchemy/index';
import {
  ApothecaryRenderer,
  type CauldronLayerVisual,
  type WaxColor,
} from '../render/index';
import {
  CellarAutomationEngine,
  type CellarApparatusType,
  type PolyrhythmRatio,
} from '../cellar/index';
import { globalAudioBus, ProceduralAsmrAudioEngine } from '../audio/index';
import {
  COOKIE_VAULT_NAME,
  VaultManager,
  type HouseholdSlotId,
  type HouseholdSlotState,
  type LedgerEntry,
  type LedgerSaveStateV1,
} from '../vault/index';
import {
  computeCellarHedgeYield,
  computeMarketSnapshot,
  pickDailyMarketRegime,
  roundHalfCrown,
  type MarketRegime,
  type MarketSnapshot,
} from '../../simulation/market_shocks';
import {
  BrassBalanceScale,
  ENVOY_ARCHETYPES,
  generateEnvoyForPotion,
  type BrassWeightDenom,
  type EnvoyOffer,
} from '../../simulation/npc_envoys';
import {
  appraisePotionForMarket,
  applyEndOfDaySolvency,
  evaluateBargainProposal,
} from '../../simulation/haggling_matrix';
import {
  CREST_LABELS,
  EFFECT_LABELS,
  PREP_LABELS,
  REGIME_META,
  VESSEL_LABELS,
  WAX_COLOR_HEX,
  WAX_COLOR_LABELS,
  createCraftedBottleSvg,
  createCrestGlyph,
  createVesselOutlineSvg,
  formatCrowns,
  rgbTupleToCss,
} from './bottles';
import { BrassScaleView } from './scale_view';
import { CellarCanvasView } from './cellar_canvas';

type StationId = 'prep' | 'cauldron' | 'decant' | 'shopfront' | 'cellar';
type DecantPhase = 'idle' | 'poured' | 'corked' | 'wax_poured' | 'stamped';

interface FestivalPayload {
  schemaVersion: number;
  isoYearWeek: string;
  festivalName: string;
  regime: MarketRegime;
  loreNote: string;
  reagentElasticityModifiers: Partial<Record<ReagentId, number>>;
  envoyBiasWeights?: Record<string, number>;
  commissions: FestivalCommissionSpec[];
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STATION_ORDER: readonly StationId[] = [
  'prep',
  'cauldron',
  'decant',
  'shopfront',
  'cellar',
] as const;

const STATION_LABELS: Record<StationId, { numeral: string; title: string }> = {
  prep: { numeral: 'I', title: 'Prep Board' },
  cauldron: { numeral: 'II', title: 'Cauldron' },
  decant: { numeral: 'III', title: 'Decant & Seal' },
  shopfront: { numeral: 'IV', title: 'Shopfront' },
  cellar: { numeral: 'V', title: 'Cellar Still' },
};

const VESSELS: readonly PotionVessel[] = ['prism', 'teardrop', 'crescent', 'carafe'];
const WAX_COLORS: readonly WaxColor[] = ['crimson', 'verdigris', 'gold', 'indigo'];
const CRESTS: readonly WaxSealSpec['crest'][] = ['phoenix', 'alembic', 'crescent', 'scales'];
const WEIGHT_DENOMS: readonly BrassWeightDenom[] = [50, 25, 10, 5, 1, 0.5];
const PH_REFERENCE_STOPS: readonly number[] = [1.5, 3.5, 5.5, 7.0, 8.5, 10.0, 12.5];
const CELLAR_RATIOS: readonly PolyrhythmRatio[] = ['3:4', '4:5', '5:6'];
const SLOT_IDS: readonly HouseholdSlotId[] = [1, 2, 3];

const APPARATUS_SPECS: ReadonlyArray<{ type: CellarApparatusType; label: string; hint: string }> = [
  { type: 'boiling_retort', label: '+ Boiling Retort', hint: 'Heats raw botanicals' },
  { type: 'graham_condenser', label: '+ Graham Condenser', hint: 'Distills Quintessence' },
  { type: 'copper_siphon', label: '+ Copper Siphon', hint: 'Routes polyrhythmic flow' },
  { type: 'drip_alembic', label: '+ Drip Alembic', hint: 'Precipitates Catalyst Salt' },
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function toRendererLayers(state: CauldronFluidState): CauldronLayerVisual[] {
  const total = state.totalVolumeMl > 0 ? state.totalVolumeMl : 1;
  return state.layers.map((layer) => ({
    colorRgb: [layer.colorRgb[0], layer.colorRgb[1], layer.colorRgb[2]],
    specificGravity: layer.specificGravity,
    volumeFraction: layer.volumeMl / total,
    micaIntensity: layer.micaIntensity,
    sharpness: layer.interfaceSharpness,
  }));
}

function decomposeCrownsToWeights(targetCrowns: number): BrassWeightDenom[] {
  let remainingHalf = Math.max(0, Math.round(targetCrowns * 2));
  const out: BrassWeightDenom[] = [];
  for (const denom of WEIGHT_DENOMS) {
    const denomHalf = Math.round(denom * 2);
    while (remainingHalf >= denomHalf) {
      out.push(denom);
      remainingHalf -= denomHalf;
    }
  }
  return out;
}

export class ApothecaryStudioApp {
  private readonly root: HTMLElement;
  private readonly vault: VaultManager;
  private saveState: LedgerSaveStateV1;
  private readonly audioEngine: ProceduralAsmrAudioEngine;

  private readonly cauldronSim: CauldronSimulator;
  private readonly cellarEngine: CellarAutomationEngine;
  private readonly brassScale: BrassBalanceScale;

  private renderer: ApothecaryRenderer | null = null;
  private scaleView: BrassScaleView | null = null;
  private cellarCanvasView: CellarCanvasView | null = null;

  private activeStation: StationId = 'prep';
  private selectedReagentId: ReagentId = 'amber_honey_resin';
  private selectedVessel: PotionVessel = 'prism';
  private selectedWaxColor: WaxColor = 'crimson';
  private selectedCrest: WaxSealSpec['crest'] = 'phoenix';
  private decantPhase: DecantPhase = 'idle';
  private decantPourVisual = 0;

  private selectedShelfIndex = 0;
  private envoySequence = 1;
  private activeEnvoy!: EnvoyOffer;
  private envoyReactionLine = '';
  private marketSnapshot!: MarketSnapshot;
  private festival: FestivalPayload | null = null;

  private selectedCellarNodeId: string | null = null;
  private connectSourceNodeId: string | null = null;
  private activeCellarRatio: PolyrhythmRatio = '3:4';
  private cellarBotanicalId: ReagentId = 'saffron_hearth_pollen';
  private cellarSaveCooldownMs = 0;

  private vaultDrawerOpen = false;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private installDismissed = false;

  private wetEntryTimestamps = new Map<string, number>();
  private renderedLedgerKey = '';
  private lastSyncedCauldronTemp = 22;
  private lastSyncedCauldronOmega = 0;
  private statusWhisperTimer: number | null = null;

  private rafId: number | null = null;
  private heartbeatId: number | null = null;
  private lastRafMs: number | null = null;
  private simTimeSec = 0;
  private lastLadleAudioMs = 0;
  private lastSimmerAudioMs = 0;

  private audioUnlockedAttempted = false;
  private disposed = false;

  // Cached DOM references
  private stationTabs = new Map<StationId, HTMLButtonElement>();
  private stationPanels = new Map<StationId, HTMLElement>();
  private guildMedallionBtn!: HTMLButtonElement;
  private crownTallyEl!: HTMLElement;
  private regimeSealEl!: HTMLElement;
  private dawnBellBtn!: HTMLButtonElement;
  private waxVaultBtn!: HTMLButtonElement;
  private vaultDrawerEl!: HTMLElement;
  private slotButtons = new Map<HouseholdSlotId, HTMLButtonElement>();
  private audioMuteBtn!: HTMLButtonElement;
  private audioKnobInput!: HTMLInputElement;
  private audioKnobNeedleEl!: HTMLElement;
  private installWrapEl!: HTMLElement;
  private installBtn!: HTMLButtonElement;
  private whisperEl!: HTMLElement;

  // Station I DOM
  private jarButtons = new Map<ReagentId, HTMLButtonElement>();
  private selectedReagentCardEl!: HTMLElement;
  private prepBeakerEl!: HTMLElement;
  private mortarEl!: HTMLButtonElement;
  private knifeBoardEl!: HTMLButtonElement;
  private pipetteEl!: HTMLButtonElement;
  private infuseQuintBtn!: HTMLButtonElement;
  private addSaltBtn!: HTMLButtonElement;

  // Station II DOM
  private cauldronCanvas!: HTMLCanvasElement;
  private cauldronLadleEl!: HTMLElement;
  private ladleArmEl!: HTMLElement;
  private phTilesEl!: HTMLElement;
  private emberBedEl!: HTMLElement;
  private cauldronReadoutEl!: HTMLElement;
  private gentleStirBtn!: HTMLButtonElement;
  private whipMarblingBtn!: HTMLButtonElement;
  private bellowsBtn!: HTMLButtonElement;

  // Station III DOM
  private decantCanvas!: HTMLCanvasElement;
  private vesselButtons = new Map<PotionVessel, HTMLButtonElement>();
  private waxButtons = new Map<WaxColor, HTMLButtonElement>();
  private crestButtons = new Map<WaxSealSpec['crest'], HTMLButtonElement>();
  private pourFunnelBtn!: HTMLButtonElement;
  private pressCorkBtn!: HTMLButtonElement;
  private pourWaxBtn!: HTMLButtonElement;
  private stampSignetBtn!: HTMLButtonElement;
  private shelvePotionBtn!: HTMLButtonElement;
  private decantRitualHintEl!: HTMLElement;

  // Station IV DOM
  private windowCanvas!: HTMLCanvasElement;
  private oakShelfEl!: HTMLElement;
  private envoyCardEl!: HTMLElement;
  private scaleHostEl!: HTMLElement;
  private sealBargainBtn!: HTMLButtonElement;
  private merchantTrayEl!: HTMLElement;
  private buyButtons = new Map<ReagentId, HTMLButtonElement>();
  private festivalBannerEl!: HTMLElement;
  private wetLedgerListEl!: HTMLOListElement;

  // Station V DOM
  private cellarCanvas!: HTMLCanvasElement;
  private cellarRatioSelect!: HTMLSelectElement;
  private cellarReagentSelect!: HTMLSelectElement;
  private cellarInventoryEl!: HTMLElement;
  private cellarStatusEl!: HTMLElement;

  constructor(root: HTMLElement, vault: VaultManager, initialState: LedgerSaveStateV1) {
    this.root = root;
    this.vault = vault;
    this.saveState = initialState;

    const slot = this.getActiveSlot();
    this.cauldronSim = new CauldronSimulator(slot.mode);
    this.cellarEngine = new CellarAutomationEngine(slot.cellarGraph);
    this.brassScale = new BrassBalanceScale(0);
    this.audioEngine = new ProceduralAsmrAudioEngine(globalAudioBus);
    this.audioEngine.setMuted(this.saveState.audioMuted);
    this.audioEngine.setMasterVolume(this.saveState.audioVolume);
    this.audioEngine.setWeatherRegime(slot.regime);

    this.refreshMarketAndEnvoy(false);
    this.buildWorkspaceDom();
    this.initRenderers();
    this.bindGlobalListeners();
    this.syncAllUi();
    this.startMasterLoop();
    this.startCookieHeartbeat();
    void this.loadFestivalData();
  }

  private getActiveSlot(): HouseholdSlotState {
    return this.saveState.slots[this.saveState.activeSlot];
  }

  private async persistSave(): Promise<void> {
    if (this.disposed) return;
    const slot = this.getActiveSlot();
    slot.cellarGraph = this.cellarEngine.getGraph();
    slot.updatedAtIso = new Date().toISOString();
    try {
      await this.vault.save(this.saveState);
    } catch {
      // Ignore transient storage lock while state remains in memory
    }
  }

  private unlockAudioOnce(): void {
    if (this.audioUnlockedAttempted || this.disposed) return;
    this.audioUnlockedAttempted = true;
    void this.audioEngine.unlock().then((ok) => {
      if (ok) {
        this.audioEngine.setMuted(this.saveState.audioMuted);
        this.audioEngine.setMasterVolume(this.saveState.audioVolume);
        this.audioEngine.setWeatherRegime(this.getActiveSlot().regime);
      } else {
        this.audioUnlockedAttempted = false;
      }
    });
  }

  private showWhisper(text: string): void {
    this.whisperEl.textContent = text;
    this.whisperEl.classList.add('is-visible');
    if (this.statusWhisperTimer !== null) {
      window.clearTimeout(this.statusWhisperTimer);
    }
    this.statusWhisperTimer = window.setTimeout(() => {
      this.whisperEl.classList.remove('is-visible');
    }, 3400);
  }

  private async loadFestivalData(): Promise<void> {
    try {
      const res = await fetch('./data/festivals.json');
      if (!res.ok) return;
      const data = (await res.json()) as FestivalPayload;
      if (!data || !Array.isArray(data.commissions)) return;
      this.festival = data;
      this.refreshMarketAndEnvoy(false);
      this.syncShopfrontUi();
    } catch {
      // Offline cold boot without precache gracefully continues without festival modifiers
    }
  }

  private refreshMarketAndEnvoy(clearWeights = true): void {
    const slot = this.getActiveSlot();
    this.marketSnapshot = computeMarketSnapshot(
      slot.regime,
      slot.day,
      this.festival?.reagentElasticityModifiers
    );
    if (slot.shelfPotions.length === 0) {
      this.selectedShelfIndex = 0;
    } else if (this.selectedShelfIndex >= slot.shelfPotions.length) {
      this.selectedShelfIndex = slot.shelfPotions.length - 1;
    }
    const selectedPotion = slot.shelfPotions[this.selectedShelfIndex] ?? null;
    this.activeEnvoy = generateEnvoyForPotion(
      selectedPotion,
      this.marketSnapshot,
      `${slot.dateSeed}::d${slot.day}::s${slot.slotId}::e${this.envoySequence}`
    );
    if (clearWeights) {
      this.brassScale.clearWeights();
    }
    this.brassScale.setLeftMass(selectedPotion ? this.activeEnvoy.fairOfferCrowns : 0);
  }

  private buildWorkspaceDom(): void {
    this.root.innerHTML = '';

    // 1. Top Oak & Brass Rail
    const rail = document.createElement('header');
    rail.className = 'oak-brass-rail';

    const brandGroup = document.createElement('div');
    brandGroup.className = 'rail-brand';
    brandGroup.innerHTML = `
      <span class="brand-crest" aria-hidden="true">⚗</span>
      <div class="brand-titles">
        <span class="brand-name">Alchemists Ledger</span>
        <span class="brand-sub">Apothecary Workbench</span>
      </div>
    `;

    const nav = document.createElement('nav');
    nav.className = 'station-tabs';
    nav.setAttribute('aria-label', 'Workbench Stations');
    for (const id of STATION_ORDER) {
      const meta = STATION_LABELS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brass-clasp station-tab';
      btn.dataset.testid = `station-tab-${id}`;
      btn.innerHTML = `<span class="tab-numeral">${meta.numeral}</span><span class="tab-label">${meta.title}</span>`;
      btn.addEventListener('click', () => this.switchStation(id));
      this.stationTabs.set(id, btn);
      nav.appendChild(btn);
    }

    const controls = document.createElement('div');
    controls.className = 'rail-instruments';

    this.guildMedallionBtn = document.createElement('button');
    this.guildMedallionBtn.type = 'button';
    this.guildMedallionBtn.className = 'brass-medallion';
    this.guildMedallionBtn.dataset.testid = 'guild-mode-medallion';
    this.guildMedallionBtn.addEventListener('click', () => this.toggleGuildMode());

    this.crownTallyEl = document.createElement('div');
    this.crownTallyEl.className = 'brass-tally-plaque';
    this.crownTallyEl.dataset.testid = 'crown-pouch-tally';

    this.regimeSealEl = document.createElement('div');
    this.regimeSealEl.className = 'regime-weather-seal';
    this.regimeSealEl.dataset.testid = 'regime-weather-seal';

    this.dawnBellBtn = document.createElement('button');
    this.dawnBellBtn.type = 'button';
    this.dawnBellBtn.className = 'brass-clasp dawn-bell-btn';
    this.dawnBellBtn.dataset.testid = 'dawn-bell';
    this.dawnBellBtn.innerHTML = `<span aria-hidden="true">🔔</span><span>New Dawn</span>`;
    this.dawnBellBtn.addEventListener('click', () => void this.handleNewDawnShift());

    this.waxVaultBtn = document.createElement('button');
    this.waxVaultBtn.type = 'button';
    this.waxVaultBtn.className = 'brass-clasp wax-vault-toggle';
    this.waxVaultBtn.dataset.testid = 'wax-vault-btn';
    this.waxVaultBtn.innerHTML = `<span aria-hidden="true">🜂</span><span>Wax Vault</span>`;
    this.waxVaultBtn.addEventListener('click', () => this.toggleVaultDrawer());

    const audioCluster = document.createElement('div');
    audioCluster.className = 'brass-audio-cluster';

    this.audioMuteBtn = document.createElement('button');
    this.audioMuteBtn.type = 'button';
    this.audioMuteBtn.className = 'brass-clasp audio-mute-btn';
    this.audioMuteBtn.dataset.testid = 'brass-audio-mute';
    this.audioMuteBtn.addEventListener('click', () => this.toggleAudioMute());

    const knobHousing = document.createElement('label');
    knobHousing.className = 'brass-knob-housing';
    knobHousing.title = 'Studio Acoustic Volume';
    const dialBezel = document.createElement('span');
    dialBezel.className = 'brass-knob-bezel';
    dialBezel.setAttribute('aria-hidden', 'true');
    this.audioKnobNeedleEl = document.createElement('span');
    this.audioKnobNeedleEl.className = 'brass-knob-needle';
    dialBezel.appendChild(this.audioKnobNeedleEl);

    this.audioKnobInput = document.createElement('input');
    this.audioKnobInput.type = 'range';
    this.audioKnobInput.min = '0';
    this.audioKnobInput.max = '1';
    this.audioKnobInput.step = '0.05';
    this.audioKnobInput.className = 'brass-knob-range';
    this.audioKnobInput.dataset.testid = 'brass-audio-knob';
    this.audioKnobInput.setAttribute('aria-label', 'Master Studio Volume');
    this.audioKnobInput.addEventListener('input', () => this.handleVolumeChange(false));
    this.audioKnobInput.addEventListener('change', () => this.handleVolumeChange(true));
    knobHousing.append(dialBezel, this.audioKnobInput);

    audioCluster.append(this.audioMuteBtn, knobHousing);

    // Subtle dismissible Install App brass clasp
    this.installWrapEl = document.createElement('div');
    this.installWrapEl.className = 'install-clasp-wrap';
    this.installWrapEl.hidden = true;

    this.installBtn = document.createElement('button');
    this.installBtn.type = 'button';
    this.installBtn.className = 'brass-clasp install-app-btn';
    this.installBtn.dataset.testid = 'install-app-clasp';
    this.installBtn.textContent = 'Install App';
    this.installBtn.addEventListener('click', () => void this.triggerInstallPrompt());

    const dismissInstallBtn = document.createElement('button');
    dismissInstallBtn.type = 'button';
    dismissInstallBtn.className = 'brass-clasp install-dismiss-btn';
    dismissInstallBtn.dataset.testid = 'dismiss-install-clasp';
    dismissInstallBtn.setAttribute('aria-label', 'Dismiss Install Prompt');
    dismissInstallBtn.textContent = '×';
    dismissInstallBtn.addEventListener('click', () => {
      this.installDismissed = true;
      this.installWrapEl.hidden = true;
    });
    this.installWrapEl.append(this.installBtn, dismissInstallBtn);

    controls.append(
      this.guildMedallionBtn,
      this.crownTallyEl,
      this.regimeSealEl,
      this.dawnBellBtn,
      this.waxVaultBtn,
      audioCluster,
      this.installWrapEl
    );

    rail.append(brandGroup, nav, controls);

    // 2. Wax-Seal Vault Drawer
    this.vaultDrawerEl = document.createElement('section');
    this.vaultDrawerEl.className = 'wax-vault-drawer';
    this.vaultDrawerEl.hidden = true;
    this.buildVaultDrawer();

    // 3. Whisper Toast Plaque
    this.whisperEl = document.createElement('div');
    this.whisperEl.className = 'parchment-whisper';
    this.whisperEl.setAttribute('role', 'status');
    this.whisperEl.setAttribute('aria-live', 'polite');

    // 4. Five Spatial Workbench Stations
    const stage = document.createElement('main');
    stage.className = 'studio-stage';

    const prepPanel = this.buildPrepStation();
    const cauldronPanel = this.buildCauldronStation();
    const decantPanel = this.buildDecantStation();
    const shopfrontPanel = this.buildShopfrontStation();
    const cellarPanel = this.buildCellarStation();

    this.stationPanels.set('prep', prepPanel);
    this.stationPanels.set('cauldron', cauldronPanel);
    this.stationPanels.set('decant', decantPanel);
    this.stationPanels.set('shopfront', shopfrontPanel);
    this.stationPanels.set('cellar', cellarPanel);

    stage.append(prepPanel, cauldronPanel, decantPanel, shopfrontPanel, cellarPanel);
    this.root.append(rail, this.vaultDrawerEl, this.whisperEl, stage);
  }

  private buildVaultDrawer(): void {
    const inner = document.createElement('div');
    inner.className = 'vault-drawer-inner';

    const slotsRow = document.createElement('div');
    slotsRow.className = 'vault-slots-row';

    for (const slotId of SLOT_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wax-slot-seal';
      btn.dataset.testid = `wax-slot-${slotId}`;
      btn.addEventListener('click', () => void this.handleSwitchHouseholdSlot(slotId));
      this.slotButtons.set(slotId, btn);
      slotsRow.appendChild(btn);
    }

    const syncRow = document.createElement('div');
    syncRow.className = 'vault-sync-row';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'brass-clasp';
    exportBtn.dataset.testid = 'export-ledger-btn';
    exportBtn.textContent = 'Export .ledger.json';
    exportBtn.addEventListener('click', () => this.handleExportLedger());

    const importLabel = document.createElement('label');
    importLabel.className = 'brass-clasp brass-file-clasp';
    importLabel.textContent = 'Import .ledger.json';
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,.ledger.json';
    importInput.className = 'ledger-file-input';
    importInput.dataset.testid = 'import-ledger-input';
    importInput.setAttribute('aria-label', 'Import ledger JSON seal');
    importInput.addEventListener('change', () => void this.handleImportLedger(importInput));
    importLabel.appendChild(importInput);

    syncRow.append(exportBtn, importLabel);
    inner.append(slotsRow, syncRow);
    this.vaultDrawerEl.appendChild(inner);
  }

  private buildPrepStation(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'station-panel station-prep';
    section.dataset.station = 'prep';

    const rack = document.createElement('div');
    rack.className = 'oak-apothecary-rack';
    const rackHeader = document.createElement('div');
    rackHeader.className = 'plaque-heading';
    rackHeader.innerHTML = `<h2>I. Oak Reagent Apothecary</h2><span>12 Specific-Gravity Botanicals &amp; Minerals</span>`;
    rack.appendChild(rackHeader);

    const jarsGrid = document.createElement('div');
    jarsGrid.className = 'reagent-jars-grid';

    for (const id of CANONICAL_REAGENT_ORDER) {
      const spec = REAGENT_CATALOG[id];
      const jarBtn = document.createElement('button');
      jarBtn.type = 'button';
      jarBtn.className = 'reagent-jar-btn';
      jarBtn.dataset.testid = `reagent-jar-${id}`;
      jarBtn.addEventListener('click', () => {
        this.selectedReagentId = id;
        globalAudioBus.emit({ type: 'glass_clink', vessel: 'prism', momentum: 0.25 });
        this.syncPrepUi();
      });
      this.jarButtons.set(id, jarBtn);
      jarsGrid.appendChild(jarBtn);
    }
    rack.appendChild(jarsGrid);

    // Right column: Selected reagent + 3 multi-touch ritual tools + live cauldron beaker preview
    const bench = document.createElement('div');
    bench.className = 'walnut-prep-bench';

    this.selectedReagentCardEl = document.createElement('div');
    this.selectedReagentCardEl.className = 'selected-reagent-plaque';

    const toolsGrid = document.createElement('div');
    toolsGrid.className = 'prep-ritual-tools';

    this.mortarEl = document.createElement('button');
    this.mortarEl.type = 'button';
    this.mortarEl.className = 'ritual-surface mortar-surface';
    this.mortarEl.dataset.testid = 'mortar-pestle';
    this.mortarEl.innerHTML = `
      <span class="ritual-glyph" aria-hidden="true">🥣</span>
      <span class="ritual-title">Stone Mortar &amp; Pestle</span>
      <span class="ritual-hint">Circular drag or tap to crush crystal</span>
    `;
    this.bindMortarInteractions(this.mortarEl);

    this.knifeBoardEl = document.createElement('button');
    this.knifeBoardEl.type = 'button';
    this.knifeBoardEl.className = 'ritual-surface knife-surface';
    this.knifeBoardEl.dataset.testid = 'herb-knife-board';
    this.knifeBoardEl.innerHTML = `
      <span class="ritual-glyph" aria-hidden="true">🔪</span>
      <span class="ritual-title">Herb Slicing Board</span>
      <span class="ritual-hint">Swipe blade or tap to mince botanical</span>
    `;
    this.bindKnifeInteractions(this.knifeBoardEl);

    this.pipetteEl = document.createElement('button');
    this.pipetteEl.type = 'button';
    this.pipetteEl.className = 'ritual-surface pipette-surface';
    this.pipetteEl.dataset.testid = 'squeeze-pipette';
    this.pipetteEl.innerHTML = `
      <span class="ritual-glyph" aria-hidden="true">💧</span>
      <span class="ritual-title">Squeeze Glass Pipette</span>
      <span class="ritual-hint">Press-release or tap to drop essence</span>
    `;
    this.bindPipetteInteractions(this.pipetteEl);

    toolsGrid.append(this.mortarEl, this.knifeBoardEl, this.pipetteEl);

    const refinedRow = document.createElement('div');
    refinedRow.className = 'refined-infuse-row';

    this.infuseQuintBtn = document.createElement('button');
    this.infuseQuintBtn.type = 'button';
    this.infuseQuintBtn.className = 'brass-clasp';
    this.infuseQuintBtn.addEventListener('click', () => void this.applyRefinedFromCellar('cellar_quintessence'));

    this.addSaltBtn = document.createElement('button');
    this.addSaltBtn.type = 'button';
    this.addSaltBtn.className = 'brass-clasp';
    this.addSaltBtn.addEventListener('click', () => void this.applyRefinedFromCellar('catalyst_salt'));

    refinedRow.append(this.infuseQuintBtn, this.addSaltBtn);

    this.prepBeakerEl = document.createElement('div');
    this.prepBeakerEl.className = 'prep-cauldron-preview';

    bench.append(this.selectedReagentCardEl, toolsGrid, refinedRow, this.prepBeakerEl);
    section.append(rack, bench);
    return section;
  }

  private buildCauldronStation(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'station-panel station-cauldron';
    section.dataset.station = 'cauldron';
    section.hidden = true;

    const cauldronCol = document.createElement('div');
    cauldronCol.className = 'cauldron-crucible-col';

    const canvasFrame = document.createElement('div');
    canvasFrame.className = 'cauldron-canvas-frame';

    this.cauldronCanvas = document.createElement('canvas');
    this.cauldronCanvas.className = 'cauldron-canvas';
    this.cauldronCanvas.dataset.testid = 'cauldron-canvas';
    this.bindCauldronCanvasStir(this.cauldronCanvas);
    canvasFrame.appendChild(this.cauldronCanvas);

    this.emberBedEl = document.createElement('div');
    this.emberBedEl.className = 'hearth-ember-bed';
    this.emberBedEl.innerHTML = `<span class="ember-glow"></span><span class="ember-caption">Hearth Coals</span>`;

    cauldronCol.append(canvasFrame, this.emberBedEl);

    const controlsCol = document.createElement('div');
    controlsCol.className = 'cauldron-controls-col';

    const heading = document.createElement('div');
    heading.className = 'plaque-heading';
    heading.innerHTML = `<h2>II. Hearth &amp; Suminagashi Crucible</h2><span>Buoyancy Horizons, Shear Threshold &amp; Thermal Enthalpy</span>`;

    const ladlePanel = document.createElement('div');
    ladlePanel.className = 'ladle-stir-deck';

    this.cauldronLadleEl = document.createElement('div');
    this.cauldronLadleEl.className = 'wooden-ladle-wheel';
    this.cauldronLadleEl.dataset.testid = 'cauldron-ladle';
    this.cauldronLadleEl.setAttribute('role', 'application');
    this.cauldronLadleEl.setAttribute('aria-label', 'Carved Wooden Stirring Ladle');
    this.cauldronLadleEl.innerHTML = `
      <div class="ladle-bowl">
        <div class="ladle-arm"></div>
      </div>
      <span class="ladle-caption">Circle Ladle to Stir</span>
    `;
    this.ladleArmEl = this.cauldronLadleEl.querySelector('.ladle-arm') as HTMLElement;
    this.bindLadleWheelInteractions(this.cauldronLadleEl);

    const stirButtons = document.createElement('div');
    stirButtons.className = 'stir-preset-buttons';

    this.gentleStirBtn = document.createElement('button');
    this.gentleStirBtn.type = 'button';
    this.gentleStirBtn.className = 'brass-clasp';
    this.gentleStirBtn.dataset.testid = 'gentle-stir-btn';
    this.gentleStirBtn.textContent = 'Gentle Laminar Stir';
    this.gentleStirBtn.addEventListener('click', () => this.applyPresetStir(false));

    this.whipMarblingBtn = document.createElement('button');
    this.whipMarblingBtn.type = 'button';
    this.whipMarblingBtn.className = 'brass-clasp';
    this.whipMarblingBtn.dataset.testid = 'whip-marbling-btn';
    this.whipMarblingBtn.textContent = 'Whip Suminagashi Ribbons';
    this.whipMarblingBtn.addEventListener('click', () => this.applyPresetStir(true));

    this.bellowsBtn = document.createElement('button');
    this.bellowsBtn.type = 'button';
    this.bellowsBtn.className = 'leather-bellows-btn';
    this.bellowsBtn.dataset.testid = 'hearth-bellows';
    this.bellowsBtn.innerHTML = `<span aria-hidden="true">🔥</span><span>Pump Leather Bellows (Space)</span>`;
    this.bellowsBtn.addEventListener('click', () => this.handlePumpBellows());

    const rinseBtn = document.createElement('button');
    rinseBtn.type = 'button';
    rinseBtn.className = 'brass-clasp rinse-cauldron-btn';
    rinseBtn.dataset.testid = 'rinse-cauldron-btn';
    rinseBtn.textContent = 'Rinse Crucible';
    rinseBtn.addEventListener('click', () => {
      this.cauldronSim.reset(22);
      this.decantPhase = 'idle';
      this.decantPourVisual = 0;
      this.syncCauldronUi();
      this.syncDecantUi();
      this.syncPrepUi();
      this.showWhisper('Crucible rinsed to clear spring water');
    });

    stirButtons.append(this.gentleStirBtn, this.whipMarblingBtn, this.bellowsBtn, rinseBtn);
    ladlePanel.append(this.cauldronLadleEl, stirButtons);

    this.phTilesEl = document.createElement('div');
    this.phTilesEl.className = 'ph-ceramic-rack';
    this.phTilesEl.dataset.testid = 'ph-ceramic-tiles';

    this.cauldronReadoutEl = document.createElement('div');
    this.cauldronReadoutEl.className = 'cauldron-diegetic-plaque';

    controlsCol.append(heading, ladlePanel, this.phTilesEl, this.cauldronReadoutEl);
    section.append(cauldronCol, controlsCol);
    return section;
  }

  private buildDecantStation(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'station-panel station-decant';
    section.dataset.station = 'decant';
    section.hidden = true;

    const canvasCol = document.createElement('div');
    canvasCol.className = 'decant-canvas-col';

    this.decantCanvas = document.createElement('canvas');
    this.decantCanvas.className = 'decant-canvas';
    this.decantCanvas.dataset.testid = 'decant-canvas';
    canvasCol.appendChild(this.decantCanvas);

    const benchCol = document.createElement('div');
    benchCol.className = 'decant-bench-col';

    const heading = document.createElement('div');
    heading.className = 'plaque-heading';
    heading.innerHTML = `<h2>III. Decanting &amp; 3-Beat Wax Seal</h2><span>Crystal Silhouette, Cork Vacuum &amp; Guild Signet</span>`;

    this.decantRitualHintEl = document.createElement('p');
    this.decantRitualHintEl.className = 'ritual-status-banner';

    // Vessel selection
    const vesselGroup = document.createElement('div');
    vesselGroup.className = 'decant-group';
    const vesselTitle = document.createElement('h3');
    vesselTitle.textContent = '1. Crystal Vessel Silhouette';
    const vesselGrid = document.createElement('div');
    vesselGrid.className = 'vessel-grid';

    for (const v of VESSELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vessel-choice-btn';
      btn.dataset.testid = `vessel-${v}`;
      btn.appendChild(createVesselOutlineSvg(v));
      const lbl = document.createElement('span');
      lbl.textContent = VESSEL_LABELS[v];
      btn.appendChild(lbl);
      btn.addEventListener('click', () => {
        this.selectedVessel = v;
        globalAudioBus.emit({ type: 'glass_clink', vessel: v, momentum: 0.75 });
        this.syncDecantUi();
      });
      this.vesselButtons.set(v, btn);
      vesselGrid.appendChild(btn);
    }
    vesselGroup.append(vesselTitle, vesselGrid);

    // Beat 0 & Beat 1: Brass Funnel Pour & Cork Stopper
    const pourCorkGroup = document.createElement('div');
    pourCorkGroup.className = 'decant-group decant-actions-row';

    this.pourFunnelBtn = document.createElement('button');
    this.pourFunnelBtn.type = 'button';
    this.pourFunnelBtn.className = 'brass-clasp ritual-step-btn';
    this.pourFunnelBtn.dataset.testid = 'pour-funnel-lever';
    this.pourFunnelBtn.textContent = 'Pull Brass Funnel Pour';
    this.pourFunnelBtn.addEventListener('click', () => this.handleFunnelPour());

    this.pressCorkBtn = document.createElement('button');
    this.pressCorkBtn.type = 'button';
    this.pressCorkBtn.className = 'brass-clasp ritual-step-btn';
    this.pressCorkBtn.dataset.testid = 'press-cork-btn';
    this.pressCorkBtn.textContent = 'Beat 1 · Drive Cork Stopper';
    this.pressCorkBtn.addEventListener('click', () => this.handleCorkPress());

    pourCorkGroup.append(this.pourFunnelBtn, this.pressCorkBtn);

    // Beat 2: Wax Color & Molten Pour
    const waxGroup = document.createElement('div');
    waxGroup.className = 'decant-group';
    const waxTitle = document.createElement('h3');
    waxTitle.textContent = 'Beat 2 · Sealing Wax & Molten Pour';
    const waxRow = document.createElement('div');
    waxRow.className = 'wax-choice-row';
    for (const color of WAX_COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wax-swatch-btn';
      btn.dataset.testid = `wax-color-${color}`;
      btn.innerHTML = `<span class="wax-dot" style="background:${WAX_COLOR_HEX[color]}"></span><span>${WAX_COLOR_LABELS[color]}</span>`;
      btn.addEventListener('click', () => {
        this.selectedWaxColor = color;
        this.syncDecantUi();
      });
      this.waxButtons.set(color, btn);
      waxRow.appendChild(btn);
    }
    this.pourWaxBtn = document.createElement('button');
    this.pourWaxBtn.type = 'button';
    this.pourWaxBtn.className = 'brass-clasp ritual-step-btn';
    this.pourWaxBtn.dataset.testid = 'pour-wax-btn';
    this.pourWaxBtn.textContent = 'Pour Molten Sealing Wax';
    this.pourWaxBtn.addEventListener('click', () => this.handlePourWax());
    waxGroup.append(waxTitle, waxRow, this.pourWaxBtn);

    // Beat 3: Crest & Signet Stamp + Shelve
    const crestGroup = document.createElement('div');
    crestGroup.className = 'decant-group';
    const crestTitle = document.createElement('h3');
    crestTitle.textContent = 'Beat 3 · Guild Brass Signet & Shelf';
    const crestRow = document.createElement('div');
    crestRow.className = 'crest-choice-row';
    for (const crest of CRESTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crest-choice-btn';
      btn.dataset.testid = `crest-${crest}`;
      btn.innerHTML = `<span class="crest-glyph" aria-hidden="true">${createCrestGlyph(crest)}</span><span>${CREST_LABELS[crest]}</span>`;
      btn.addEventListener('click', () => {
        this.selectedCrest = crest;
        this.syncDecantUi();
      });
      this.crestButtons.set(crest, btn);
      crestRow.appendChild(btn);
    }

    const finalActions = document.createElement('div');
    finalActions.className = 'decant-actions-row';

    this.stampSignetBtn = document.createElement('button');
    this.stampSignetBtn.type = 'button';
    this.stampSignetBtn.className = 'brass-clasp ritual-step-btn';
    this.stampSignetBtn.dataset.testid = 'stamp-signet-btn';
    this.stampSignetBtn.textContent = 'Stamp Brass Signet';
    this.stampSignetBtn.addEventListener('click', () => this.handleStampSignet());

    this.shelvePotionBtn = document.createElement('button');
    this.shelvePotionBtn.type = 'button';
    this.shelvePotionBtn.className = 'brass-clasp shelve-bottle-btn';
    this.shelvePotionBtn.dataset.testid = 'shelve-potion-btn';
    this.shelvePotionBtn.textContent = 'Place Bottle on Oak Shelf';
    this.shelvePotionBtn.addEventListener('click', () => void this.handleShelvePotion());

    finalActions.append(this.stampSignetBtn, this.shelvePotionBtn);
    crestGroup.append(crestTitle, crestRow, finalActions);

    benchCol.append(heading, this.decantRitualHintEl, vesselGroup, pourCorkGroup, waxGroup, crestGroup);
    section.append(canvasCol, benchCol);
    return section;
  }

  private buildShopfrontStation(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'station-panel station-shopfront';
    section.dataset.station = 'shopfront';
    section.hidden = true;

    // Upper left: Stained glass window + Sunlit Oak Potion Shelf + Festival Charter
    const leftCol = document.createElement('div');
    leftCol.className = 'shopfront-display-col';

    const windowCard = document.createElement('div');
    windowCard.className = 'stained-glass-frame';
    this.windowCanvas = document.createElement('canvas');
    this.windowCanvas.className = 'window-canvas';
    this.windowCanvas.dataset.testid = 'window-canvas';
    windowCard.appendChild(this.windowCanvas);

    const shelfFrame = document.createElement('div');
    shelfFrame.className = 'oak-shelf-frame';
    const shelfHeading = document.createElement('div');
    shelfHeading.className = 'plaque-heading';
    shelfHeading.innerHTML = `<h2>IV. Sunlit Oak Potion Shelf</h2><span>Tap a sealed bottle to place on the brass scale</span>`;

    this.oakShelfEl = document.createElement('div');
    this.oakShelfEl.className = 'oak-potion-shelf';
    this.oakShelfEl.dataset.testid = 'oak-potion-shelf';
    shelfFrame.append(shelfHeading, this.oakShelfEl);

    this.festivalBannerEl = document.createElement('div');
    this.festivalBannerEl.className = 'festival-charter-parchment';

    leftCol.append(windowCard, shelfFrame, this.festivalBannerEl);

    // Center: Wandering Envoy + Two-Pan Brass Balance Scale + Counterweights
    const centerCol = document.createElement('div');
    centerCol.className = 'shopfront-haggle-col';

    this.envoyCardEl = document.createElement('article');
    this.envoyCardEl.className = 'envoy-dossier-parchment';
    this.envoyCardEl.dataset.testid = 'active-envoy-card';

    this.scaleHostEl = document.createElement('div');
    this.scaleHostEl.className = 'brass-balance-scale-host';
    this.scaleHostEl.dataset.testid = 'brass-balance-scale';
    this.scaleView = new BrassScaleView(this.scaleHostEl, {
      onRemoveWeight: (idx) => {
        const st = this.brassScale.removeWeight(idx);
        globalAudioBus.emit({ type: 'scale_weight_clink', denom: 1, momentum: 0.45 });
        const selected = this.getActiveSlot().shelfPotions[this.selectedShelfIndex] ?? null;
        this.scaleView?.update(st, selected);
      },
    });

    const weightsDeck = document.createElement('div');
    weightsDeck.className = 'brass-weights-deck';

    const weightRow = document.createElement('div');
    weightRow.className = 'brass-weight-tray';
    for (const denom of WEIGHT_DENOMS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brass-weight-coin';
      btn.dataset.testid = `weight-${denom}`;
      btn.innerHTML = `<span class="coin-val">${denom}</span><span class="coin-unit">Cr</span>`;
      btn.addEventListener('click', () => {
        const st = this.brassScale.addWeight(denom);
        globalAudioBus.emit({ type: 'scale_weight_clink', denom, momentum: 0.8 });
        const selected = this.getActiveSlot().shelfPotions[this.selectedShelfIndex] ?? null;
        this.scaleView?.update(st, selected);
      });
      weightRow.appendChild(btn);
    }

    const scaleActions = document.createElement('div');
    scaleActions.className = 'scale-action-row';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'brass-clasp';
    clearBtn.dataset.testid = 'clear-weights-btn';
    clearBtn.textContent = 'Clear Pan';
    clearBtn.addEventListener('click', () => {
      const st = this.brassScale.clearWeights();
      globalAudioBus.emit({ type: 'scale_weight_clink', denom: 1, momentum: 0.3 });
      const selected = this.getActiveSlot().shelfPotions[this.selectedShelfIndex] ?? null;
      this.scaleView?.update(st, selected);
    });

    const matchBtn = document.createElement('button');
    matchBtn.type = 'button';
    matchBtn.className = 'brass-clasp';
    matchBtn.dataset.testid = 'match-pan-equilibrium-btn';
    matchBtn.textContent = 'Equilibrium Forceps';
    matchBtn.addEventListener('click', () => this.handleMatchPanEquilibrium());

    this.sealBargainBtn = document.createElement('button');
    this.sealBargainBtn.type = 'button';
    this.sealBargainBtn.className = 'brass-clasp bargain-bell-btn';
    this.sealBargainBtn.dataset.testid = 'seal-bargain-btn';
    this.sealBargainBtn.innerHTML = `<span aria-hidden="true">🛎</span><span>Strike Bargain Bell</span>`;
    this.sealBargainBtn.addEventListener('click', () => void this.handleStrikeBargainBell());

    scaleActions.append(clearBtn, matchBtn, this.sealBargainBtn);
    weightsDeck.append(weightRow, scaleActions);
    centerCol.append(this.envoyCardEl, this.scaleHostEl, weightsDeck);

    // Right: Merchant Restock Tray + Wet-Ink Cotton-Rag Ledger
    const rightCol = document.createElement('div');
    rightCol.className = 'shopfront-ledger-col';

    const merchantBlock = document.createElement('div');
    merchantBlock.className = 'merchant-restock-block';
    const merchantTitle = document.createElement('div');
    merchantTitle.className = 'plaque-heading';
    merchantTitle.innerHTML = `<h3>Merchant Botanicals &amp; Minerals</h3><span>Dynamic market restock prices</span>`;
    this.merchantTrayEl = document.createElement('div');
    this.merchantTrayEl.className = 'merchant-buy-grid';

    for (const id of CANONICAL_REAGENT_ORDER) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'merchant-buy-btn';
      btn.dataset.testid = `buy-reagent-${id}`;
      btn.addEventListener('click', () => void this.handleBuyReagent(id));
      this.buyButtons.set(id, btn);
      this.merchantTrayEl.appendChild(btn);
    }
    merchantBlock.append(merchantTitle, this.merchantTrayEl);

    const ledgerFolio = document.createElement('div');
    ledgerFolio.className = 'cotton-ledger-folio';
    ledgerFolio.dataset.testid = 'wet-ink-ledger';
    const ledgerHeading = document.createElement('div');
    ledgerHeading.className = 'ledger-folio-header';
    ledgerHeading.innerHTML = `<h3>Apothecary Cotton-Rag Ledger</h3><span>Iron-Gall Sepia Entries</span>`;
    this.wetLedgerListEl = document.createElement('ol');
    this.wetLedgerListEl.className = 'ledger-entries-list';
    ledgerFolio.append(ledgerHeading, this.wetLedgerListEl);

    rightCol.append(merchantBlock, ledgerFolio);
    section.append(leftCol, centerCol, rightCol);
    return section;
  }

  private buildCellarStation(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'station-panel station-cellar';
    section.dataset.station = 'cellar';
    section.hidden = true;

    const stoneDeck = document.createElement('div');
    stoneDeck.className = 'cellar-stone-frame';

    const heading = document.createElement('div');
    heading.className = 'plaque-heading';
    heading.innerHTML = `<h2>V. Candlelit Stone Cellar Still</h2><span>Polyrhythmic Borosilicate Condensers &amp; Quintessence Hedge</span>`;

    this.cellarCanvas = document.createElement('canvas');
    this.cellarCanvas.className = 'cellar-canvas';
    this.cellarCanvas.dataset.testid = 'cellar-canvas';

    this.cellarCanvasView = new CellarCanvasView(this.cellarCanvas, {
      onSelectNode: (nodeId) => {
        this.selectedCellarNodeId = nodeId;
        this.cellarCanvasView?.setSelection(this.selectedCellarNodeId, this.connectSourceNodeId);
        this.syncCellarUi();
      },
      onMoveNode: (nodeId, nx, ny) => {
        const graph = this.cellarEngine.getGraph();
        const target = graph.nodes.find((n) => n.id === nodeId);
        if (target) {
          target.x = nx;
          target.y = ny;
          this.cellarEngine.loadGraph(graph);
        }
      },
      onCommitLayout: () => {
        void this.persistSave();
      },
      onConnectPair: (fromId, toId) => {
        const edge = this.cellarEngine.connectNodes(fromId, toId, this.activeCellarRatio);
        this.connectSourceNodeId = null;
        this.cellarCanvasView?.setSelection(this.selectedCellarNodeId, null);
        if (edge) {
          globalAudioBus.emit({ type: 'glass_clink', vessel: 'carafe', momentum: 0.6 });
          this.showWhisper(`Glass tube sealed (${edge.ratio})`);
          void this.persistSave();
        }
        this.syncCellarUi();
      },
    });

    this.cellarStatusEl = document.createElement('p');
    this.cellarStatusEl.className = 'cellar-status-note';

    stoneDeck.append(heading, this.cellarCanvas, this.cellarStatusEl);

    const toolsCol = document.createElement('div');
    toolsCol.className = 'cellar-tools-col';

    const addGroup = document.createElement('div');
    addGroup.className = 'cellar-control-group';
    const addTitle = document.createElement('h3');
    addTitle.textContent = '1. Glassware Apparatus';
    const addGrid = document.createElement('div');
    addGrid.className = 'cellar-apparatus-grid';

    for (const item of APPARATUS_SPECS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brass-clasp cellar-add-btn';
      btn.dataset.testid = `add-${item.type}`;
      btn.innerHTML = `<span>${item.label}</span><small>${item.hint}</small>`;
      btn.addEventListener('click', () => this.handleAddCellarNode(item.type));
      addGrid.appendChild(btn);
    }
    addGroup.append(addTitle, addGrid);

    const wireGroup = document.createElement('div');
    wireGroup.className = 'cellar-control-group';
    const wireTitle = document.createElement('h3');
    wireTitle.textContent = '2. Polyrhythm Tubes & Botanical Feed';

    const selectorsRow = document.createElement('div');
    selectorsRow.className = 'cellar-selectors-row';

    this.cellarRatioSelect = document.createElement('select');
    this.cellarRatioSelect.className = 'brass-select';
    this.cellarRatioSelect.setAttribute('aria-label', 'Polyrhythm Tube Ratio');
    for (const r of CELLAR_RATIOS) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = `Ratio ${r}`;
      this.cellarRatioSelect.appendChild(opt);
    }
    this.cellarRatioSelect.addEventListener('change', () => {
      this.activeCellarRatio = this.cellarRatioSelect.value as PolyrhythmRatio;
    });

    this.cellarReagentSelect = document.createElement('select');
    this.cellarReagentSelect.className = 'brass-select';
    this.cellarReagentSelect.setAttribute('aria-label', 'Botanical or Crystal Feed');
    for (const id of CANONICAL_REAGENT_ORDER) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = REAGENT_CATALOG[id].name;
      this.cellarReagentSelect.appendChild(opt);
    }
    this.cellarReagentSelect.value = this.cellarBotanicalId;
    this.cellarReagentSelect.addEventListener('change', () => {
      this.cellarBotanicalId = this.cellarReagentSelect.value as ReagentId;
    });

    selectorsRow.append(this.cellarRatioSelect, this.cellarReagentSelect);

    const pipeActions = document.createElement('div');
    pipeActions.className = 'cellar-pipe-actions';

    const connectBtn = document.createElement('button');
    connectBtn.type = 'button';
    connectBtn.className = 'brass-clasp';
    connectBtn.dataset.testid = 'connect-cellar-pipe';
    connectBtn.textContent = 'Connect Bezier Glass Tube';
    connectBtn.addEventListener('click', () => this.handleConnectCellarPipe());

    const feedBtn = document.createElement('button');
    feedBtn.type = 'button';
    feedBtn.className = 'brass-clasp';
    feedBtn.dataset.testid = 'feed-cellar-botanical';
    feedBtn.textContent = 'Feed Botanical to Vessel';
    feedBtn.addEventListener('click', () => this.handleFeedCellarBotanical());

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'brass-clasp';
    removeBtn.dataset.testid = 'remove-cellar-node-btn';
    removeBtn.textContent = 'Remove Selected Vessel';
    removeBtn.addEventListener('click', () => this.handleRemoveSelectedCellarNode());

    pipeActions.append(connectBtn, feedBtn, removeBtn);
    wireGroup.append(wireTitle, selectorsRow, pipeActions);

    this.cellarInventoryEl = document.createElement('div');
    this.cellarInventoryEl.className = 'cellar-yield-rack';

    toolsCol.append(addGroup, wireGroup, this.cellarInventoryEl);
    section.append(stoneDeck, toolsCol);
    return section;
  }

  private initRenderers(): void {
    this.renderer = new ApothecaryRenderer({
      cauldronCanvas: this.cauldronCanvas,
      decantCanvas: this.decantCanvas,
      windowCanvas: this.windowCanvas,
    });
    const state = this.cauldronSim.getState();
    this.renderer.updateCauldronState({
      layers: toRendererLayers(state),
      temperatureC: state.temperatureC,
      viscosity: state.meanViscosity,
      marblingIndex: state.marblingIndex,
      layerCrispness: state.layerCrispness,
      phRgb: state.phIndicatorRgb,
    });
    this.renderer.updateWeather(this.getActiveSlot().regime);
    this.syncDecantRenderer();
  }

  private bindGlobalListeners(): void {
    // Unlock procedural Web Audio on first user interaction
    const unlockHandler = () => this.unlockAudioOnce();
    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler);

    // Keyboard shortcuts: 1-5 switch stations, Space pumps bellows on Cauldron, M toggles audio mute
    window.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (ev.key >= '1' && ev.key <= '5') {
        const idx = Number(ev.key) - 1;
        this.switchStation(STATION_ORDER[idx]);
        return;
      }

      if (ev.key === 'm' || ev.key === 'M') {
        this.toggleAudioMute();
        return;
      }

      if (ev.key === ' ' && this.activeStation === 'cauldron') {
        ev.preventDefault();
        if (!ev.repeat) {
          this.handlePumpBellows();
        }
      }
    });

    // Install App prompt handler (hidden in standalone mode)
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!isStandalone) {
      window.addEventListener('beforeinstallprompt', (ev) => {
        ev.preventDefault();
        if (this.installDismissed) return;
        this.deferredInstallPrompt = ev as BeforeInstallPromptEvent;
        this.installWrapEl.hidden = false;
      });
      window.addEventListener('appinstalled', () => {
        this.deferredInstallPrompt = null;
        this.installWrapEl.hidden = true;
      });
    }
  }

  private async triggerInstallPrompt(): Promise<void> {
    if (!this.deferredInstallPrompt) {
      this.installWrapEl.hidden = true;
      return;
    }
    const promptEv = this.deferredInstallPrompt;
    this.deferredInstallPrompt = null;
    try {
      await promptEv.prompt();
      await promptEv.userChoice;
    } catch {
      // Ignore user cancellation
    }
    this.installWrapEl.hidden = true;
  }

  private bindMortarInteractions(el: HTMLButtonElement): void {
    let dragging = false;
    let didCircularAction = false;
    let lastAngle = 0;
    let swept = 0;
    let lastTapHandledAt = 0;

    const getAngle = (ev: PointerEvent): number => {
      const rect = el.getBoundingClientRect();
      return Math.atan2(
        ev.clientY - (rect.top + rect.height / 2),
        ev.clientX - (rect.left + rect.width / 2)
      );
    };

    el.addEventListener('pointerdown', (ev) => {
      dragging = true;
      didCircularAction = false;
      swept = 0;
      lastAngle = getAngle(ev);
      el.classList.add('is-active-ritual');
      el.setPointerCapture?.(ev.pointerId);
    });

    el.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const angle = getAngle(ev);
      let dAngle = angle - lastAngle;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      lastAngle = angle;
      swept += Math.abs(dAngle);
      if (swept >= 1.35) {
        swept = 0;
        didCircularAction = true;
        this.performPrepAddition('ground_crystal', clamp(Math.abs(dAngle) * 3.2, 0.4, 1.5));
      }
    });

    const endMortar = (ev: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('is-active-ritual');
      if (el.hasPointerCapture?.(ev.pointerId)) {
        el.releasePointerCapture(ev.pointerId);
      }
      if (ev.type === 'pointerup' && !didCircularAction) {
        lastTapHandledAt = performance.now();
        this.performPrepAddition('ground_crystal', 0.9);
      }
    };

    el.addEventListener('pointerup', endMortar);
    el.addEventListener('pointercancel', endMortar);
    el.addEventListener('click', () => {
      if (performance.now() - lastTapHandledAt < 350 || didCircularAction) {
        didCircularAction = false;
        return;
      }
      this.performPrepAddition('ground_crystal', 0.9);
    });
  }

  private bindKnifeInteractions(el: HTMLButtonElement): void {
    let swiping = false;
    let didSwipeAction = false;
    let anchorX = 0;
    let anchorY = 0;
    let lastTapHandledAt = 0;

    el.addEventListener('pointerdown', (ev) => {
      swiping = true;
      didSwipeAction = false;
      anchorX = ev.clientX;
      anchorY = ev.clientY;
      el.classList.add('is-active-ritual');
      el.setPointerCapture?.(ev.pointerId);
    });

    el.addEventListener('pointermove', (ev) => {
      if (!swiping) return;
      const dist = Math.hypot(ev.clientX - anchorX, ev.clientY - anchorY);
      if (dist >= 34) {
        anchorX = ev.clientX;
        anchorY = ev.clientY;
        didSwipeAction = true;
        this.performPrepAddition('sliced_botanical', 0.9);
      }
    });

    const endKnife = (ev: PointerEvent) => {
      if (!swiping) return;
      swiping = false;
      el.classList.remove('is-active-ritual');
      if (el.hasPointerCapture?.(ev.pointerId)) {
        el.releasePointerCapture(ev.pointerId);
      }
      if (ev.type === 'pointerup' && !didSwipeAction) {
        lastTapHandledAt = performance.now();
        this.performPrepAddition('sliced_botanical', 0.9);
      }
    };

    el.addEventListener('pointerup', endKnife);
    el.addEventListener('pointercancel', endKnife);
    el.addEventListener('click', () => {
      if (performance.now() - lastTapHandledAt < 350 || didSwipeAction) {
        didSwipeAction = false;
        return;
      }
      this.performPrepAddition('sliced_botanical', 0.9);
    });
  }

  private bindPipetteInteractions(el: HTMLButtonElement): void {
    let squeezed = false;
    let lastTapHandledAt = 0;

    el.addEventListener('pointerdown', (ev) => {
      squeezed = true;
      el.classList.add('is-active-ritual');
      el.setPointerCapture?.(ev.pointerId);
    });

    const endPipette = (ev: PointerEvent) => {
      if (!squeezed) return;
      squeezed = false;
      el.classList.remove('is-active-ritual');
      if (el.hasPointerCapture?.(ev.pointerId)) {
        el.releasePointerCapture(ev.pointerId);
      }
      if (ev.type === 'pointerup') {
        lastTapHandledAt = performance.now();
        this.performPrepAddition('pipette_drops', 1.0);
      }
    };

    el.addEventListener('pointerup', endPipette);
    el.addEventListener('pointercancel', endPipette);
    el.addEventListener('click', () => {
      if (performance.now() - lastTapHandledAt < 350) {
        return;
      }
      this.performPrepAddition('pipette_drops', 1.0);
    });
  }

  private bindLadleWheelInteractions(el: HTMLElement): void {
    let stirring = false;
    let lastAngle = 0;
    let lastTimeMs = 0;
    let visualAngleDeg = 0;

    const angleForEvent = (ev: PointerEvent): number => {
      const rect = el.getBoundingClientRect();
      return Math.atan2(
        ev.clientY - (rect.top + rect.height / 2),
        ev.clientX - (rect.left + rect.width / 2)
      );
    };

    el.addEventListener('pointerdown', (ev) => {
      stirring = true;
      lastAngle = angleForEvent(ev);
      lastTimeMs = performance.now();
      el.classList.add('is-stirring');
      el.setPointerCapture?.(ev.pointerId);
    });

    el.addEventListener('pointermove', (ev) => {
      if (!stirring) return;
      const now = performance.now();
      const dtSec = clamp((now - lastTimeMs) / 1000, 1 / 240, 0.12);
      lastTimeMs = now;

      const angle = angleForEvent(ev);
      let dAngle = angle - lastAngle;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      lastAngle = angle;

      visualAngleDeg = (angle * 180) / Math.PI;
      this.ladleArmEl.style.transform = `rotate(${visualAngleDeg.toFixed(1)}deg)`;

      const omega = clamp(dAngle / dtSec, -36, 36);
      const state = this.cauldronSim.applyLadleStir(omega, dtSec);
      this.renderer?.setLadleMotion(
        0.5 + Math.cos(angle) * 0.25,
        0.5 + Math.sin(angle) * 0.25,
        -Math.sin(angle) * clamp(omega * 0.25, -6, 6),
        Math.cos(angle) * clamp(omega * 0.25, -6, 6),
        omega
      );
      this.emitThrottledLadleAudio(Math.abs(omega), state.meanViscosity);
      this.syncCauldronUi();
    });

    const stopStir = (ev: PointerEvent) => {
      if (!stirring) return;
      stirring = false;
      el.classList.remove('is-stirring');
      if (el.hasPointerCapture?.(ev.pointerId)) {
        el.releasePointerCapture(ev.pointerId);
      }
    };

    el.addEventListener('pointerup', stopStir);
    el.addEventListener('pointercancel', stopStir);
  }

  private bindCauldronCanvasStir(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let prevX = 0.5;
    let prevY = 0.5;
    let prevTime = 0;

    const toNorm = (ev: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [
        clamp((ev.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
        clamp((ev.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
      ];
    };

    canvas.addEventListener('pointerdown', (ev) => {
      dragging = true;
      const [nx, ny] = toNorm(ev);
      prevX = nx;
      prevY = ny;
      prevTime = performance.now();
      this.renderer?.triggerDropletRipple(nx, ny);
      canvas.setPointerCapture?.(ev.pointerId);
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const now = performance.now();
      const dtSec = clamp((now - prevTime) / 1000, 1 / 240, 0.12);
      prevTime = now;
      const [nx, ny] = toNorm(ev);
      const vx = clamp((nx - prevX) / dtSec, -8, 8);
      const vy = clamp((ny - prevY) / dtSec, -8, 8);
      const rx = nx - 0.5;
      const ry = ny - 0.5;
      const rSq = Math.max(0.02, rx * rx + ry * ry);
      const omega = clamp((rx * vy - ry * vx) / rSq, -36, 36);
      prevX = nx;
      prevY = ny;

      const state = this.cauldronSim.applyLadleStir(omega, dtSec);
      this.renderer?.setLadleMotion(nx, ny, vx, vy, omega);
      this.emitThrottledLadleAudio(Math.abs(omega), state.meanViscosity);
      this.syncCauldronUi();
    });

    const endCanvas = (ev: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture?.(ev.pointerId)) {
        canvas.releasePointerCapture(ev.pointerId);
      }
    };
    canvas.addEventListener('pointerup', endCanvas);
    canvas.addEventListener('pointercancel', endCanvas);
  }

  private emitThrottledLadleAudio(angularSpeed: number, viscosity: number): void {
    const now = performance.now();
    if (angularSpeed < 0.25 || now - this.lastLadleAudioMs < 130) return;
    this.lastLadleAudioMs = now;
    globalAudioBus.emit({ type: 'ladle_swirl', angularSpeed, viscosity });
  }

  private performPrepAddition(prepForm: PrepForm, speed: number): void {
    const slot = this.getActiveSlot();
    const spec = REAGENT_CATALOG[this.selectedReagentId];
    if (slot.mode === 'grandmaster') {
      const stock = slot.reagentStock[this.selectedReagentId] ?? 0;
      if (stock < 1) {
        this.showWhisper(`No ${spec.name} left in Grandmaster jar — restock at Shopfront`);
        return;
      }
      slot.reagentStock[this.selectedReagentId] = stock - 1;
    }

    const state = this.cauldronSim.addReagent(this.selectedReagentId, prepForm, 25);

    if (prepForm === 'ground_crystal') {
      globalAudioBus.emit({ type: 'mortar_grind', hardness: spec.hardness, speed });
    } else if (prepForm === 'sliced_botanical') {
      globalAudioBus.emit({
        type: 'herb_slice',
        wetness: clamp(1 - spec.hardness, 0.12, 0.95),
      });
    } else if (prepForm === 'pipette_drops') {
      globalAudioBus.emit({ type: 'pipette_drop', viscosity: spec.baseViscosity });
      this.renderer?.triggerDropletRipple(0.5, 0.5);
    }

    this.pushCauldronToRenderer(state);
    this.syncPrepUi();
    this.syncCauldronUi();
    this.syncDecantUi();
    void this.persistSave();
  }

  private async applyRefinedFromCellar(kind: 'cellar_quintessence' | 'catalyst_salt'): Promise<void> {
    if (!this.cellarEngine.consumeRefined(kind, this.selectedReagentId)) {
      this.showWhisper(`No cellar-refined ${REAGENT_CATALOG[this.selectedReagentId].name} ready`);
      return;
    }
    const state = this.cauldronSim.addReagent(this.selectedReagentId, kind, 25);
    globalAudioBus.emit({
      type: 'pipette_drop',
      viscosity: state.meanViscosity,
      pitchOffset: kind === 'cellar_quintessence' ? 4 : -3,
    });
    this.renderer?.triggerDropletRipple(0.5, 0.5);
    this.pushCauldronToRenderer(state);
    this.syncPrepUi();
    this.syncCauldronUi();
    this.syncDecantUi();
    this.syncCellarUi();
    await this.persistSave();
  }

  private applyPresetStir(whip: boolean): void {
    const cur = this.cauldronSim.getState();
    const omega = whip
      ? Math.max(16.0, cur.shearCritRadS * 2.8)
      : Math.min(1.4, cur.shearCritRadS * 0.55);
    const dt = whip ? 0.95 : 0.65;
    const next = this.cauldronSim.applyLadleStir(omega, dt);

    const spinDeg = whip ? 220 : 52;
    this.ladleArmEl.style.transform = `rotate(${spinDeg}deg)`;
    this.renderer?.setLadleMotion(0.58, 0.44, whip ? 3.5 : 0.8, whip ? -2.8 : 0.6, omega);
    globalAudioBus.emit({
      type: 'ladle_swirl',
      angularSpeed: Math.abs(omega),
      viscosity: next.meanViscosity,
    });
    this.pushCauldronToRenderer(next);
    this.syncCauldronUi();
  }

  private handlePumpBellows(): void {
    const next = this.cauldronSim.pumpBellows(1.0);
    globalAudioBus.emit({ type: 'bellows_pump', intensity: 0.95 });
    const now = performance.now();
    if (next.temperatureC >= 45 && now - this.lastSimmerAudioMs > 260) {
      this.lastSimmerAudioMs = now;
      globalAudioBus.emit({
        type: 'cauldron_simmer',
        temperatureC: next.temperatureC,
        viscosity: next.meanViscosity,
      });
    }
    this.bellowsBtn.classList.add('is-pumping');
    window.setTimeout(() => this.bellowsBtn.classList.remove('is-pumping'), 220);
    this.pushCauldronToRenderer(next);
    this.syncCauldronUi();
  }

  private pushCauldronToRenderer(state: CauldronFluidState): void {
    this.renderer?.updateCauldronState({
      layers: toRendererLayers(state),
      temperatureC: state.temperatureC,
      viscosity: state.meanViscosity,
      marblingIndex: state.marblingIndex,
      layerCrispness: state.layerCrispness,
      phRgb: state.phIndicatorRgb,
    });
    this.syncDecantRenderer();
  }

  private syncDecantRenderer(): void {
    const state = this.cauldronSim.getState();
    this.renderer?.updateDecantView({
      vessel: this.selectedVessel,
      pourProgress: this.decantPhase === 'idle' ? 0 : this.decantPourVisual,
      corked:
        this.decantPhase === 'corked' ||
        this.decantPhase === 'wax_poured' ||
        this.decantPhase === 'stamped',
      waxColor: this.selectedWaxColor,
      waxPoured: this.decantPhase === 'wax_poured' || this.decantPhase === 'stamped',
      waxStamped: this.decantPhase === 'stamped',
      layers: toRendererLayers(state),
    });
  }

  private handleFunnelPour(): void {
    const state = this.cauldronSim.getState();
    if (state.layers.length === 0) {
      this.showWhisper('Add at least one reagent in Station I before pouring');
      return;
    }
    this.decantPhase = 'poured';
    this.decantPourVisual = Math.max(this.decantPourVisual, 0.25);
    globalAudioBus.emit({ type: 'pipette_drop', viscosity: state.meanViscosity, pitchOffset: -5 });
    this.syncDecantRenderer();
    this.syncDecantUi();
  }

  private handleCorkPress(): void {
    if (this.decantPhase !== 'poured') return;
    this.decantPhase = 'corked';
    this.decantPourVisual = 1;
    globalAudioBus.emit({ type: 'cork_pop' });
    this.syncDecantRenderer();
    this.syncDecantUi();
  }

  private handlePourWax(): void {
    if (this.decantPhase !== 'corked') return;
    this.decantPhase = 'wax_poured';
    globalAudioBus.emit({ type: 'wax_sizzle', phase: 'pour' });
    this.syncDecantRenderer();
    this.syncDecantUi();
  }

  private handleStampSignet(): void {
    if (this.decantPhase !== 'wax_poured') return;
    this.decantPhase = 'stamped';
    globalAudioBus.emit({ type: 'wax_sizzle', phase: 'stamp' });
    this.syncDecantRenderer();
    this.syncDecantUi();
  }

  private async handleShelvePotion(): Promise<void> {
    if (this.decantPhase !== 'stamped') return;
    const slot = this.getActiveSlot();
    const uid = `potion-${slot.day}-${slot.shelfPotions.length + 1}-${Date.now().toString(36)}`;
    const potion = this.cauldronSim.decantToPotion(
      this.selectedVessel,
      {
        color: this.selectedWaxColor,
        crest: this.selectedCrest,
        stamped: true,
      },
      slot.day,
      uid
    );
    slot.shelfPotions.push(potion);
    if (!slot.unlockedVessels.includes(this.selectedVessel)) {
      slot.unlockedVessels.push(this.selectedVessel);
    }

    this.selectedShelfIndex = slot.shelfPotions.length - 1;
    this.cauldronSim.reset(22);
    this.decantPhase = 'idle';
    this.decantPourVisual = 0;

    globalAudioBus.emit({ type: 'glass_clink', vessel: potion.vessel, momentum: 0.55 });
    this.pushCauldronToRenderer(this.cauldronSim.getState());

    this.envoySequence += 1;
    this.refreshMarketAndEnvoy(true);
    this.envoyReactionLine = `${this.activeEnvoy.name} inspects ${potion.name} on the sunlit shelf.`;

    this.syncAllUi();
    this.showWhisper(`Shelved ${potion.name}`);
    await this.persistSave();
  }

  private handleMatchPanEquilibrium(): void {
    const slot = this.getActiveSlot();
    const potion = slot.shelfPotions[this.selectedShelfIndex] ?? null;
    if (!potion) {
      this.showWhisper('Select a sealed bottle on the Oak Shelf first');
      return;
    }

    this.brassScale.clearWeights();
    this.brassScale.setLeftMass(this.activeEnvoy.fairOfferCrowns);
    const coins = decomposeCrownsToWeights(this.activeEnvoy.fairOfferCrowns);
    for (const denom of coins) {
      this.brassScale.addWeight(denom);
    }
    if (coins.length > 0) {
      globalAudioBus.emit({
        type: 'scale_weight_clink',
        denom: coins[0],
        momentum: 0.75,
      });
    }
    this.scaleView?.update(this.brassScale.getState(), potion);
  }

  private appendLedgerEntry(
    slot: HouseholdSlotState,
    entry: Omit<LedgerEntry, 'id' | 'timestampIso'>
  ): void {
    const id = `entry-${slot.day}-${slot.ledgerEntries.length + 1}-${Date.now().toString(36)}`;
    const fullEntry: LedgerEntry = {
      ...entry,
      id,
      timestampIso: new Date().toISOString(),
    };
    slot.ledgerEntries.push(fullEntry);
    this.wetEntryTimestamps.set(id, performance.now());
  }

  private async handleStrikeBargainBell(): Promise<void> {
    const slot = this.getActiveSlot();
    const potion = slot.shelfPotions[this.selectedShelfIndex] ?? null;
    if (!potion) {
      this.showWhisper('Place a bottle from the Oak Shelf onto the left scale pan first');
      return;
    }

    const scaleState = this.brassScale.getState();
    const result = evaluateBargainProposal(
      this.activeEnvoy,
      potion,
      scaleState.rightMassCrowns,
      this.marketSnapshot
    );
    this.envoyReactionLine = result.envoyReaction;

    if (result.outcome === 'accepted') {
      slot.shelfPotions.splice(this.selectedShelfIndex, 1);
      slot.crowns = roundHalfCrown(slot.crowns + result.finalCrowns);
      slot.reputation = Math.round((slot.reputation + 2) * 10) / 10;

      this.appendLedgerEntry(slot, {
        day: slot.day,
        text: `Sold ${potion.name} (${VESSEL_LABELS[potion.vessel]}) to ${this.activeEnvoy.name}`,
        deltaCrowns: result.finalCrowns,
        kind: 'sale',
      });

      // Evaluate Weekly Festival STEM Commissions
      if (this.festival) {
        for (const comm of this.festival.commissions) {
          if (slot.completedCommissionIds.includes(comm.id)) continue;
          const evalRes = evaluateCommission(potion, comm);
          if (evalRes.satisfied) {
            const reward = Math.round(comm.rewardCrowns * evalRes.bonusMultiplier);
            slot.completedCommissionIds.push(comm.id);
            slot.crowns = roundHalfCrown(slot.crowns + reward);
            slot.reputation = Math.round((slot.reputation + 5) * 10) / 10;
            this.appendLedgerEntry(slot, {
              day: slot.day,
              text: `Festival Commission: ${comm.title} (${comm.tier})`,
              deltaCrowns: reward,
              kind: 'commission',
            });
            this.showWhisper(`Commission Fulfilled: +${reward} Crowns!`);
          }
        }
      }

      globalAudioBus.emit({ type: 'quill_scratch', intensity: 0.9 });
      this.envoySequence += 1;
      this.refreshMarketAndEnvoy(true);
      this.syncAllUi();
      await this.persistSave();
      return;
    }

    if (result.outcome === 'counter') {
      this.activeEnvoy = result.nextOffer;
      this.brassScale.setLeftMass(this.activeEnvoy.fairOfferCrowns);
      globalAudioBus.emit({ type: 'scale_weight_clink', denom: 1, momentum: 0.35 });
      this.syncShopfrontUi();
      return;
    }

    // Walked out: summon a new envoy
    this.envoySequence += 1;
    const reaction = result.envoyReaction;
    this.refreshMarketAndEnvoy(true);
    this.envoyReactionLine = reaction;
    globalAudioBus.emit({ type: 'glass_clink', vessel: potion.vessel, momentum: 0.25 });
    this.syncShopfrontUi();
  }

  private async handleBuyReagent(reagentId: ReagentId): Promise<void> {
    const slot = this.getActiveSlot();
    const price = this.marketSnapshot.reagentBuyPrices[reagentId] ?? 10;
    if (slot.crowns < price) {
      this.showWhisper(`Need ${formatCrowns(price)} Crowns for ${REAGENT_CATALOG[reagentId].name}`);
      return;
    }
    slot.crowns = roundHalfCrown(slot.crowns - price);
    slot.reagentStock[reagentId] = (slot.reagentStock[reagentId] ?? 0) + 1;
    this.appendLedgerEntry(slot, {
      day: slot.day,
      text: `Restocked 1× ${REAGENT_CATALOG[reagentId].name}`,
      deltaCrowns: -price,
      kind: 'purchase',
    });

    globalAudioBus.emit({ type: 'scale_weight_clink', denom: 1, momentum: 0.5 });
    globalAudioBus.emit({ type: 'quill_scratch', intensity: 0.45 });
    this.syncAllUi();
    await this.persistSave();
  }

  private async handleNewDawnShift(): Promise<void> {
    const slot = this.getActiveSlot();
    const solvency = applyEndOfDaySolvency(slot.crowns, slot.mode, this.marketSnapshot);
    slot.crowns = solvency.nextCrowns;
    slot.day += 1;
    slot.regime = pickDailyMarketRegime(slot.dateSeed, slot.day);

    this.appendLedgerEntry(slot, {
      day: slot.day,
      text: solvency.insolvent
        ? `Dawn Shift (Day ${slot.day}): Coal & parchment shortfall · ${REGIME_META[slot.regime].label}`
        : `Dawn Shift (Day ${slot.day}): Coal & parchment upkeep · ${REGIME_META[slot.regime].label}`,
      deltaCrowns: -solvency.overheadPaid,
      kind: 'overhead',
    });

    this.envoySequence += 1;
    this.refreshMarketAndEnvoy(true);
    this.renderer?.updateWeather(slot.regime);
    this.audioEngine.setWeatherRegime(slot.regime);
    globalAudioBus.emit({ type: 'weather_ambience', regime: slot.regime });
    globalAudioBus.emit({ type: 'quill_scratch', intensity: 0.65 });

    this.envoyReactionLine = `Dawn breaks under ${REGIME_META[slot.regime].label}.`;
    this.syncAllUi();
    this.showWhisper(`Day ${slot.day}: ${REGIME_META[slot.regime].label}`);
    await this.persistSave();
  }

  private toggleGuildMode(): void {
    const slot = this.getActiveSlot();
    const nextMode: GameMode = slot.mode === 'apprentice' ? 'grandmaster' : 'apprentice';
    slot.mode = nextMode;
    this.cauldronSim.setMode(nextMode);
    globalAudioBus.emit({ type: 'scale_weight_clink', denom: 5, momentum: 0.4 });
    this.syncAllUi();
    this.showWhisper(
      nextMode === 'apprentice'
        ? 'Apprentice Mode · Free infinite tray & steam safety collar'
        : 'Grandmaster Mode · Scarcity stocks & exothermic boil-over'
    );
    void this.persistSave();
  }

  private toggleVaultDrawer(): void {
    this.vaultDrawerOpen = !this.vaultDrawerOpen;
    this.vaultDrawerEl.hidden = !this.vaultDrawerOpen;
    this.waxVaultBtn.classList.toggle('is-active', this.vaultDrawerOpen);
  }

  private async handleSwitchHouseholdSlot(slotId: HouseholdSlotId): Promise<void> {
    this.saveState.activeSlot = slotId;
    const slot = this.getActiveSlot();
    this.cauldronSim.setMode(slot.mode);
    this.cauldronSim.reset(22);
    this.decantPhase = 'idle';
    this.decantPourVisual = 0;
    this.cellarEngine.loadGraph(slot.cellarGraph);
    this.selectedCellarNodeId = slot.cellarGraph.nodes[0]?.id ?? null;
    this.connectSourceNodeId = null;

    this.audioEngine.setMuted(this.saveState.audioMuted);
    this.audioEngine.setMasterVolume(this.saveState.audioVolume);
    this.audioEngine.setWeatherRegime(slot.regime);
    this.renderer?.updateWeather(slot.regime);
    this.pushCauldronToRenderer(this.cauldronSim.getState());

    this.envoySequence += 1;
    this.selectedShelfIndex = 0;
    this.refreshMarketAndEnvoy(true);
    this.renderedLedgerKey = '';
    this.syncAllUi();
    this.showWhisper(`Unsealed ${slot.label} (Day ${slot.day})`);
    await this.vault.switchHouseholdSlot(this.saveState, slotId);
  }

  private handleExportLedger(): void {
    const json = this.vault.exportLedgerJson(this.saveState);
    const slot = this.getActiveSlot();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `alchemists-ledger-slot${slot.slotId}-day${slot.day}.ledger.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    globalAudioBus.emit({ type: 'quill_scratch', intensity: 0.6 });
    this.showWhisper('Exported .ledger.json seal');
  }

  private async handleImportLedger(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const rawText = await file.text();
    const imported = this.vault.importLedgerJson(rawText);
    if (!imported) {
      this.showWhisper('Corrupted or invalid .ledger.json rejected');
      return;
    }
    this.saveState = imported;
    const slot = this.getActiveSlot();
    this.cauldronSim.setMode(slot.mode);
    this.cauldronSim.reset(22);
    this.decantPhase = 'idle';
    this.decantPourVisual = 0;
    this.cellarEngine.loadGraph(slot.cellarGraph);
    this.selectedCellarNodeId = slot.cellarGraph.nodes[0]?.id ?? null;
    this.connectSourceNodeId = null;
    this.audioEngine.setMuted(this.saveState.audioMuted);
    this.audioEngine.setMasterVolume(this.saveState.audioVolume);
    this.audioEngine.setWeatherRegime(slot.regime);
    this.renderer?.updateWeather(slot.regime);
    this.pushCauldronToRenderer(this.cauldronSim.getState());
    this.selectedShelfIndex = 0;
    this.refreshMarketAndEnvoy(true);
    this.renderedLedgerKey = '';
    await this.vault.save(this.saveState);
    this.syncAllUi();
    globalAudioBus.emit({ type: 'quill_scratch', intensity: 0.85 });
    this.showWhisper(`Restored ${slot.label} from ledger seal`);
  }

  private toggleAudioMute(): void {
    this.saveState.audioMuted = !this.saveState.audioMuted;
    this.audioEngine.setMuted(this.saveState.audioMuted);
    this.syncTopRailUi();
    void this.persistSave();
  }

  private handleVolumeChange(saveNow: boolean): void {
    const val = clamp(Number(this.audioKnobInput.value), 0, 1);
    this.saveState.audioVolume = val;
    this.audioEngine.setMasterVolume(val);
    this.syncTopRailUi();
    if (saveNow) {
      void this.persistSave();
    }
  }

  private handleAddCellarNode(type: CellarApparatusType): void {
    const graph = this.cellarEngine.getGraph();
    const idx = graph.nodes.length;
    const col = idx % 4;
    const row = Math.floor(idx / 4) % 2;
    const nx = clamp(0.18 + col * 0.21 + (row * 0.06), 0.12, 0.88);
    const ny = clamp(0.32 + row * 0.34 + ((idx % 2) * 0.08), 0.2, 0.82);

    const initialReagent =
      type === 'boiling_retort' ? this.cellarBotanicalId : undefined;
    const node = this.cellarEngine.addNode(type, nx, ny, initialReagent);
    this.selectedCellarNodeId = node.id;
    this.cellarCanvasView?.setSelection(this.selectedCellarNodeId, this.connectSourceNodeId);

    globalAudioBus.emit({ type: 'glass_clink', vessel: 'carafe', momentum: 0.45 });
    this.syncCellarUi();
    void this.persistSave();
  }

  private handleConnectCellarPipe(): void {
    const graph = this.cellarEngine.getGraph();
    if (graph.nodes.length < 2) {
      this.showWhisper('Place at least two cellar vessels to bridge a tube');
      return;
    }

    // Smart auto-link: connect selected node -> next unconnected node, or last-but-one -> last
    let fromId: string | null = null;
    let toId: string | null = null;

    if (this.selectedCellarNodeId) {
      const candidateTo = graph.nodes.find(
        (n) =>
          n.id !== this.selectedCellarNodeId &&
          !graph.edges.some(
            (e) => e.fromNodeId === this.selectedCellarNodeId && e.toNodeId === n.id
          )
      );
      if (candidateTo) {
        fromId = this.selectedCellarNodeId;
        toId = candidateTo.id;
      }
    }

    if (!fromId || !toId) {
      for (let i = 0; i < graph.nodes.length - 1; i++) {
        const a = graph.nodes[i];
        const b = graph.nodes[i + 1];
        const exists = graph.edges.some(
          (e) => e.fromNodeId === a.id && e.toNodeId === b.id
        );
        if (!exists) {
          fromId = a.id;
          toId = b.id;
          break;
        }
      }
    }

    if (fromId && toId) {
      const edge = this.cellarEngine.connectNodes(fromId, toId, this.activeCellarRatio);
      if (edge) {
        this.connectSourceNodeId = null;
        this.selectedCellarNodeId = toId;
        this.cellarCanvasView?.setSelection(this.selectedCellarNodeId, null);
        globalAudioBus.emit({ type: 'glass_clink', vessel: 'prism', momentum: 0.55 });
        this.showWhisper(`Connected glass tube (${edge.ratio})`);
        this.syncCellarUi();
        void this.persistSave();
        return;
      }
    }

    // Fallback: toggle click-to-link mode from selected node
    this.connectSourceNodeId = this.selectedCellarNodeId ?? graph.nodes[0].id;
    this.cellarCanvasView?.setSelection(this.selectedCellarNodeId, this.connectSourceNodeId);
    this.showWhisper('Tap target vessel on canvas to link');
    this.syncCellarUi();
  }

  private handleFeedCellarBotanical(): void {
    const graph = this.cellarEngine.getGraph();
    if (graph.nodes.length === 0) {
      this.showWhisper('Add a Boiling Retort first to feed botanicals');
      return;
    }
    const targetNode =
      graph.nodes.find((n) => n.id === this.selectedCellarNodeId) ??
      graph.nodes.find((n) => n.type === 'boiling_retort') ??
      graph.nodes[0];

    this.cellarEngine.setNodeReagent(targetNode.id, this.cellarBotanicalId);
    this.selectedCellarNodeId = targetNode.id;
    this.cellarCanvasView?.setSelection(this.selectedCellarNodeId, this.connectSourceNodeId);
    globalAudioBus.emit({
      type: 'pipette_drop',
      viscosity: REAGENT_CATALOG[this.cellarBotanicalId].baseViscosity,
    });
    this.showWhisper(`Fed ${REAGENT_CATALOG[this.cellarBotanicalId].name} into cellar vessel`);
    this.syncCellarUi();
    void this.persistSave();
  }

  private handleRemoveSelectedCellarNode(): void {
    if (!this.selectedCellarNodeId) return;
    this.cellarEngine.removeNode(this.selectedCellarNodeId);
    const graph = this.cellarEngine.getGraph();
    this.selectedCellarNodeId = graph.nodes[0]?.id ?? null;
    this.connectSourceNodeId = null;
    this.cellarCanvasView?.setSelection(this.selectedCellarNodeId, null);
    this.syncCellarUi();
    void this.persistSave();
  }

  switchStation(stationId: StationId): void {
    this.activeStation = stationId;
    for (const id of STATION_ORDER) {
      const isCurrent = id === stationId;
      this.stationTabs.get(id)?.classList.toggle('is-active', isCurrent);
      const panel = this.stationPanels.get(id);
      if (panel) {
        panel.hidden = !isCurrent;
      }
    }
    this.syncAllUi();
  }

  private syncAllUi(): void {
    this.syncTopRailUi();
    this.syncVaultDrawerUi();
    this.syncPrepUi();
    this.syncCauldronUi();
    this.syncDecantUi();
    this.syncShopfrontUi();
    this.syncCellarUi();
  }

  private syncTopRailUi(): void {
    const slot = this.getActiveSlot();
    for (const id of STATION_ORDER) {
      this.stationTabs.get(id)?.classList.toggle('is-active', id === this.activeStation);
    }

    this.guildMedallionBtn.dataset.mode = slot.mode;
    this.guildMedallionBtn.textContent =
      slot.mode === 'apprentice' ? 'Guild: Apprentice' : 'Guild: Grandmaster';

    this.crownTallyEl.innerHTML = `
      <span class="tally-crowns">${formatCrowns(slot.crowns)} Cr</span>
      <span class="tally-day">Day ${slot.day}</span>
    `;

    const regMeta = REGIME_META[slot.regime];
    this.regimeSealEl.innerHTML = `
      <span class="regime-swatch" style="background:${regMeta.swatch}"></span>
      <span class="regime-title">${regMeta.label}</span>
    `;
    this.regimeSealEl.title = regMeta.omen;

    this.audioMuteBtn.textContent = this.saveState.audioMuted ? '🔇 Muted' : '🔊 Sound';
    this.audioMuteBtn.classList.toggle('is-muted', this.saveState.audioMuted);
    this.audioKnobInput.value = String(this.saveState.audioVolume);
    const deg = -135 + this.saveState.audioVolume * 270;
    this.audioKnobNeedleEl.style.transform = `rotate(${deg.toFixed(1)}deg)`;
  }

  private syncVaultDrawerUi(): void {
    for (const slotId of SLOT_IDS) {
      const btn = this.slotButtons.get(slotId);
      if (!btn) continue;
      const s = this.saveState.slots[slotId];
      const active = slotId === this.saveState.activeSlot;
      btn.classList.toggle('is-active-slot', active);
      btn.innerHTML = `
        <span class="wax-slot-crest">${active ? '✦ ' : ''}${s.label}</span>
        <span class="wax-slot-meta">Day ${s.day} · ${formatCrowns(s.crowns)} Cr · ${s.mode}</span>
      `;
    }
  }

  private syncPrepUi(): void {
    const slot = this.getActiveSlot();
    for (const id of CANONICAL_REAGENT_ORDER) {
      const btn = this.jarButtons.get(id);
      if (!btn) continue;
      const spec = REAGENT_CATALOG[id];
      const isSelected = id === this.selectedReagentId;
      btn.classList.toggle('is-selected', isSelected);

      // Specific gravity indicator dot maps [0.82 .. 1.55] -> top% [12% .. 82%]
      const rhoNorm = clamp((spec.specificGravity - 0.82) / (1.55 - 0.82), 0, 1);
      const dotTopPct = Math.round(14 + rhoNorm * 68);
      const stockLabel =
        slot.mode === 'apprentice' ? '∞' : `${slot.reagentStock[id] ?? 0}`;

      btn.innerHTML = `
        <span class="jar-glass" style="background:${rgbTupleToCss(spec.baseColorRgb, 0.88)}">
          <span class="jar-rho-dot" style="top:${dotTopPct}%" title="Specific Gravity ${spec.specificGravity}"></span>
        </span>
        <span class="jar-meta">
          <span class="jar-name">${spec.name}</span>
          <span class="jar-sub">ρ ${spec.specificGravity.toFixed(2)} · Stock ${stockLabel}</span>
        </span>
      `;
    }

    const activeSpec = REAGENT_CATALOG[this.selectedReagentId];
    const activeStock =
      slot.mode === 'apprentice'
        ? 'Infinite Tray'
        : `${slot.reagentStock[this.selectedReagentId] ?? 0} in jar`;

    this.selectedReagentCardEl.innerHTML = `
      <div class="reagent-plaque-swatch" style="background:${rgbTupleToCss(activeSpec.baseColorRgb)}"></div>
      <div class="reagent-plaque-body">
        <strong>${activeSpec.name}</strong>
        <span>Preferred: ${PREP_LABELS[activeSpec.preferredPrep]} · ρ ${activeSpec.specificGravity.toFixed(2)} · μ ${activeSpec.baseViscosity.toFixed(1)} · ${activeStock}</span>
        <span>ΔT ${activeSpec.enthalpyDeltaC >= 0 ? '+' : ''}${activeSpec.enthalpyDeltaC}°C · ΔpH ${activeSpec.phShift >= 0 ? '+' : ''}${activeSpec.phShift}</span>
      </div>
    `;

    const graph = this.cellarEngine.getGraph();
    const quintQty = graph.quintessences[this.selectedReagentId] ?? 0;
    const saltQty = graph.catalystSalts[this.selectedReagentId] ?? 0;
    this.infuseQuintBtn.textContent = `Infuse Quintessence (${quintQty})`;
    this.infuseQuintBtn.disabled = quintQty < 1;
    this.addSaltBtn.textContent = `Dust Catalyst Salt (${saltQty})`;
    this.addSaltBtn.disabled = saltQty < 1;

    const cauldronState = this.cauldronSim.getState();
    this.prepBeakerEl.innerHTML = '';
    const beakerTitle = document.createElement('div');
    beakerTitle.className = 'beaker-title';
    beakerTitle.textContent =
      cauldronState.layers.length === 0
        ? 'Crucible Awaiting First Dose'
        : `${cauldronState.layers.length} Density Strata · ${EFFECT_LABELS[cauldronState.dominantEffect]}`;
    this.prepBeakerEl.appendChild(beakerTitle);

    const strataBar = document.createElement('div');
    strataBar.className = 'beaker-strata-stack';
    const totalVol = Math.max(1, cauldronState.totalVolumeMl);
    for (let i = cauldronState.layers.length - 1; i >= 0; i--) {
      const layer = cauldronState.layers[i];
      const band = document.createElement('div');
      band.className = 'beaker-layer-band';
      band.style.background = rgbTupleToCss(layer.colorRgb, 0.92);
      band.style.flexGrow = String(Math.max(0.2, layer.volumeMl / totalVol));
      band.textContent = `${REAGENT_CATALOG[layer.reagentId].name.split(' ')[0]} (ρ ${layer.specificGravity.toFixed(2)})`;
      strataBar.appendChild(band);
    }
    this.prepBeakerEl.appendChild(strataBar);
  }

  private syncCauldronUi(): void {
    const state = this.cauldronSim.getState();
    const phCss = rgbTupleToCss(state.phIndicatorRgb);

    // Ceramic pH Tiles
    this.phTilesEl.innerHTML = '';
    const dish = document.createElement('div');
    dish.className = 'ph-live-glaze-dish';
    dish.style.background = `radial-gradient(circle at 35% 35%, #fff3d6 0%, ${phCss} 42%, #1d120c 100%)`;
    dish.innerHTML = `<span>pH ${state.ph.toFixed(1)}</span>`;
    this.phTilesEl.appendChild(dish);

    const refRow = document.createElement('div');
    refRow.className = 'ph-reference-tiles';
    for (const stop of PH_REFERENCE_STOPS) {
      const tile = document.createElement('span');
      tile.className = 'ph-ceramic-tile';
      if (Math.abs(state.ph - stop) <= 1.0) {
        tile.classList.add('is-near-ph');
      }
      tile.style.backgroundColor = rgbTupleToCss(getPhIndicatorRgb(stop));
      tile.title = `pH ${stop}`;
      tile.textContent = `${stop}`;
      refRow.appendChild(tile);
    }
    this.phTilesEl.appendChild(refRow);

    // Diegetic charcoal ember glow reflecting temperature
    const tempNorm = clamp((state.temperatureC - 15) / 100, 0, 1);
    const emberGlow = this.emberBedEl.querySelector('.ember-glow') as HTMLElement | null;
    const emberCaption = this.emberBedEl.querySelector('.ember-caption') as HTMLElement | null;
    if (emberGlow) {
      emberGlow.style.opacity = String((0.25 + tempNorm * 0.75).toFixed(2));
      emberGlow.style.boxShadow = `0 0 ${Math.round(12 + tempNorm * 28)}px rgba(255, 112, 34, ${(0.35 + tempNorm * 0.6).toFixed(2)})`;
    }
    if (emberCaption) {
      emberCaption.textContent =
        state.boilOverPenalty > 0
          ? `Scorched Coals · ${state.temperatureC.toFixed(0)}°C`
          : `Hearth Coals · ${state.temperatureC.toFixed(0)}°C`;
    }

    this.cauldronReadoutEl.innerHTML = `
      <span>Effect: <strong>${EFFECT_LABELS[state.dominantEffect]}</strong></span>
      <span>Layers: <strong>${state.layers.length}</strong></span>
      <span>Crispness: <strong>${Math.round(state.layerCrispness * 100)}%</strong></span>
      <span>Marbling: <strong>${Math.round(state.marblingIndex * 100)}%</strong></span>
      <span>Purity: <strong>${Math.round(state.purity * 100)}%</strong></span>
      <span>Shear Crit: <strong>${state.shearCritRadS.toFixed(1)} rad/s</strong></span>
    `;
  }

  private syncDecantUi(): void {
    const state = this.cauldronSim.getState();
    const hasLayers = state.layers.length >= 1;

    for (const v of VESSELS) {
      this.vesselButtons.get(v)?.classList.toggle('is-selected', v === this.selectedVessel);
    }
    for (const c of WAX_COLORS) {
      this.waxButtons.get(c)?.classList.toggle('is-selected', c === this.selectedWaxColor);
    }
    for (const cr of CRESTS) {
      this.crestButtons.get(cr)?.classList.toggle('is-selected', cr === this.selectedCrest);
    }

    this.pourFunnelBtn.disabled = !hasLayers || this.decantPhase !== 'idle';
    this.pressCorkBtn.disabled = this.decantPhase !== 'poured';
    this.pourWaxBtn.disabled = this.decantPhase !== 'corked';
    this.stampSignetBtn.disabled = this.decantPhase !== 'wax_poured';
    this.shelvePotionBtn.disabled = this.decantPhase !== 'stamped';

    if (!hasLayers) {
      this.decantRitualHintEl.textContent =
        'Crucible empty — prepare at least one reagent on Station I before pouring.';
    } else if (this.decantPhase === 'idle') {
      this.decantRitualHintEl.textContent = `Ready to pour ${state.layers.length} layer(s) of ${EFFECT_LABELS[state.dominantEffect]} into ${VESSEL_LABELS[this.selectedVessel]}.`;
    } else if (this.decantPhase === 'poured') {
      this.decantRitualHintEl.textContent = 'Beat 1: Drive the cork stopper into the vessel neck.';
    } else if (this.decantPhase === 'corked') {
      this.decantRitualHintEl.textContent = 'Beat 2: Select sealing wax pigment and pour molten wax.';
    } else if (this.decantPhase === 'wax_poured') {
      this.decantRitualHintEl.textContent = 'Beat 3: Choose a guild crest and stamp the brass signet.';
    } else {
      this.decantRitualHintEl.textContent = 'Sealed with Guild Signet — place bottle onto the sunlit Oak Shelf.';
    }
  }

  private syncShopfrontUi(): void {
    const slot = this.getActiveSlot();

    // 1. Sunlit Oak Shelf
    this.oakShelfEl.innerHTML = '';
    if (slot.shelfPotions.length === 0) {
      const emptyNote = document.createElement('p');
      emptyNote.className = 'shelf-empty-note';
      emptyNote.textContent = 'No sealed bottles on the oak shelf yet — brew and seal a potion on Stations I–III.';
      this.oakShelfEl.appendChild(emptyNote);
    } else {
      slot.shelfPotions.forEach((potion, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shelf-bottle-card';
        btn.dataset.testid = `shelf-bottle-${index}`;
        if (index === this.selectedShelfIndex) {
          btn.classList.add('is-selected');
        }
        btn.appendChild(createCraftedBottleSvg(potion, `shelf-${index}-${potion.id}`));

        const appraised = appraisePotionForMarket(potion, this.marketSnapshot);
        const info = document.createElement('div');
        info.className = 'shelf-bottle-meta';
        info.innerHTML = `
          <strong>${potion.name}</strong>
          <span>${EFFECT_LABELS[potion.dominantEffect]} · ~${formatCrowns(appraised)} Cr</span>
        `;
        btn.appendChild(info);
        btn.addEventListener('click', () => {
          this.selectedShelfIndex = index;
          this.envoySequence += 1;
          this.refreshMarketAndEnvoy(true);
          this.envoyReactionLine = `${this.activeEnvoy.name} studies ${potion.name} across the counter.`;
          globalAudioBus.emit({ type: 'glass_clink', vessel: potion.vessel, momentum: 0.55 });
          this.syncShopfrontUi();
        });
        this.oakShelfEl.appendChild(btn);
      });
    }

    // 2. Active Envoy Card
    const archetype = ENVOY_ARCHETYPES[this.activeEnvoy.archetype];
    const patiencePips = '🜂 '.repeat(Math.max(0, this.activeEnvoy.patienceLeft)).trim() || 'Exhausted';
    this.envoyCardEl.innerHTML = `
      <div class="envoy-header">
        <div>
          <span class="envoy-archetype">${archetype.title}</span>
          <h3>${this.activeEnvoy.name}</h3>
        </div>
        <div class="envoy-offer-seal">
          <span class="offer-label">Opening Bid</span>
          <strong>${formatCrowns(this.activeEnvoy.fairOfferCrowns)} Cr</strong>
        </div>
      </div>
      <p class="envoy-tell"><em>Posture:</em> ${this.activeEnvoy.postureTell}</p>
      <p class="envoy-tell"><em>Gaze:</em> ${this.activeEnvoy.eyeTell}</p>
      <div class="envoy-desire-row">
        <span>Seeks: <strong>${EFFECT_LABELS[this.activeEnvoy.requestedEffect]}</strong></span>
        ${this.activeEnvoy.desiredVessel ? `<span>Vessel: <strong>${VESSEL_LABELS[this.activeEnvoy.desiredVessel]}</strong></span>` : ''}
        <span>Patience: <strong>${patiencePips}</strong></span>
      </div>
      ${this.envoyReactionLine ? `<p class="envoy-reaction">${this.envoyReactionLine}</p>` : ''}
    `;

    // 3. Scale view sync
    const selectedPotion = slot.shelfPotions[this.selectedShelfIndex] ?? null;
    this.scaleView?.update(this.brassScale.getState(), selectedPotion);
    this.sealBargainBtn.disabled = selectedPotion === null;

    // 4. Merchant Restock Tray
    for (const id of CANONICAL_REAGENT_ORDER) {
      const btn = this.buyButtons.get(id);
      if (!btn) continue;
      const spec = REAGENT_CATALOG[id];
      const price = this.marketSnapshot.reagentBuyPrices[id] ?? spec.baseCostCrowns;
      const stock = slot.reagentStock[id] ?? 0;
      btn.disabled = slot.crowns < price;
      btn.innerHTML = `
        <span class="merchant-dot" style="background:${rgbTupleToCss(spec.baseColorRgb)}"></span>
        <span class="merchant-name">${spec.name}</span>
        <span class="merchant-price">${formatCrowns(price)} Cr · Stock ${stock}</span>
      `;
    }

    // 5. Festival Charter Banner
    if (this.festival) {
      const commsHtml = this.festival.commissions
        .map((c) => {
          const done = slot.completedCommissionIds.includes(c.id);
          return `<li class="${done ? 'is-fulfilled' : ''}">
            <span>${done ? '✓' : '○'} <strong>${c.title}</strong> (${c.tier}, +${c.rewardCrowns} Cr)</span>
            <small>${c.description}</small>
          </li>`;
        })
        .join('');
      this.festivalBannerEl.innerHTML = `
        <div class="festival-head">
          <strong>${this.festival.festivalName}</strong>
          <span>${this.festival.isoYearWeek}</span>
        </div>
        <p>${this.festival.loreNote}</p>
        <ul class="festival-commissions-list">${commsHtml}</ul>
      `;
    } else {
      this.festivalBannerEl.innerHTML = `
        <div class="festival-head">
          <strong>Guild Charter</strong>
          <span>Day ${slot.day}</span>
        </div>
        <p>${REGIME_META[slot.regime].omen}</p>
      `;
    }

    // 6. Wet-Ink Cotton-Rag Ledger (no HTML <table>)
    this.syncWetInkLedgerUi(slot);
  }

  private syncWetInkLedgerUi(slot: HouseholdSlotState): void {
    const lastEntry = slot.ledgerEntries[slot.ledgerEntries.length - 1];
    const ledgerKey = `${slot.slotId}:${slot.ledgerEntries.length}:${lastEntry?.id ?? ''}`;
    if (this.renderedLedgerKey === ledgerKey) {
      return;
    }
    this.renderedLedgerKey = ledgerKey;

    const entriesDesc = [...slot.ledgerEntries].reverse().slice(0, 24);
    const now = performance.now();

    // Prune stale wet-ink animations past 4s
    for (const [id, startedAt] of this.wetEntryTimestamps.entries()) {
      if (now - startedAt > 4200) {
        this.wetEntryTimestamps.delete(id);
      }
    }

    this.wetLedgerListEl.innerHTML = '';
    if (entriesDesc.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ledger-entry ledger-entry--empty';
      empty.textContent = 'Blank cotton-rag folio — complete a sale, restock, or dawn shift to ink the first entry.';
      this.wetLedgerListEl.appendChild(empty);
      return;
    }

    for (const entry of entriesDesc) {
      const li = document.createElement('li');
      li.className = `ledger-entry ledger-entry--${entry.kind}`;
      const wetStarted = this.wetEntryTimestamps.get(entry.id);
      if (wetStarted !== undefined && now - wetStarted < 4000) {
        li.classList.add('ledger-entry--wet');
      }
      const sign = entry.deltaCrowns > 0 ? '+' : '';
      const deltaStr =
        entry.deltaCrowns === 0 ? '—' : `${sign}${formatCrowns(entry.deltaCrowns)} Cr`;
      li.innerHTML = `
        <span class="ledger-day">D${entry.day}</span>
        <span class="ledger-text">${entry.text}</span>
        <span class="ledger-delta ${entry.deltaCrowns >= 0 ? 'is-credit' : 'is-debit'}">${deltaStr}</span>
      `;
      this.wetLedgerListEl.appendChild(li);
    }
  }

  private syncCellarUi(): void {
    const slot = this.getActiveSlot();
    const graph = this.cellarEngine.getGraph();

    this.cellarRatioSelect.value = this.activeCellarRatio;
    this.cellarReagentSelect.value = this.cellarBotanicalId;

    if (this.connectSourceNodeId) {
      this.cellarStatusEl.textContent = `Linking glass tube from ${this.connectSourceNodeId} — tap destination apparatus on stone canvas.`;
    } else if (graph.nodes.length === 0) {
      this.cellarStatusEl.textContent = 'Add glassware vessels to construct your polyrhythmic distillation cellar.';
    } else {
      this.cellarStatusEl.textContent = `${graph.nodes.length} vessel(s), ${graph.edges.length} Bezier tube(s). Drag vessels to arrange.`;
    }

    const qEntries = Object.entries(graph.quintessences).filter(([, n]) => (n ?? 0) > 0);
    const sEntries = Object.entries(graph.catalystSalts).filter(([, n]) => (n ?? 0) > 0);

    const pills: string[] = [];
    for (const [id, count] of qEntries) {
      const qty = count ?? 0;
      const hedge = computeCellarHedgeYield(id as ReagentId, slot.regime, qty);
      pills.push(
        `<li><strong>${REAGENT_CATALOG[id as ReagentId].name} Quintessence</strong> · ${qty}× (Hedge ~${formatCrowns(hedge)} Cr)</li>`
      );
    }
    for (const [id, count] of sEntries) {
      const qty = count ?? 0;
      const hedge = computeCellarHedgeYield(id as ReagentId, slot.regime, qty);
      pills.push(
        `<li><strong>${REAGENT_CATALOG[id as ReagentId].name} Catalyst Salt</strong> · ${qty}× (Hedge ~${formatCrowns(hedge)} Cr)</li>`
      );
    }

    this.cellarInventoryEl.innerHTML = `
      <h3>Refined Cellar Distillates</h3>
      ${
        pills.length === 0
          ? '<p class="cellar-empty-yield">Connect a fed Boiling Retort to a Graham Condenser or Drip Alembic to harvest Quintessences &amp; Catalyst Salts.</p>'
          : `<ul class="cellar-yield-list">${pills.join('')}</ul>`
      }
    `;
  }

  private startMasterLoop(): void {
    const tick = (nowMs: number) => {
      if (this.disposed) return;

      const rawDt = this.lastRafMs === null ? 1 / 60 : (nowMs - this.lastRafMs) / 1000;
      this.lastRafMs = nowMs;
      const dt = clamp(Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1 / 60, 1 / 240, 1 / 20);
      this.simTimeSec += dt;

      // 1. Cauldron thermal cooling & angular damping
      const nextState = this.cauldronSim.stepCooling(dt);
      if (
        Math.abs(nextState.temperatureC - this.lastSyncedCauldronTemp) >= 0.35 ||
        Math.abs(nextState.angularVelocityRadS - this.lastSyncedCauldronOmega) >= 0.08
      ) {
        this.lastSyncedCauldronTemp = nextState.temperatureC;
        this.lastSyncedCauldronOmega = nextState.angularVelocityRadS;
        this.pushCauldronToRenderer(nextState);
        if (this.activeStation === 'cauldron') {
          this.syncCauldronUi();
        }
      }

      // 2. Smooth decant pour progress animation
      if (this.decantPhase !== 'idle' && this.decantPourVisual < 1) {
        this.decantPourVisual = Math.min(1, this.decantPourVisual + dt * 1.9);
        this.syncDecantRenderer();
      }

      // 3. Brass Balance Scale damped torque physics
      const scaleState = this.brassScale.step(dt);
      if (this.activeStation === 'shopfront') {
        const selectedPotion =
          this.getActiveSlot().shelfPotions[this.selectedShelfIndex] ?? null;
        this.scaleView?.update(scaleState, selectedPotion);
      }

      // 4. Polyrhythmic Kinetic Cellar Engine
      const slot = this.getActiveSlot();
      let producedSomething = false;
      const cellarEvents = this.cellarEngine.tick(
        dt,
        slot.mode === 'grandmaster'
          ? (reagentId) => {
              const cur = slot.reagentStock[reagentId] ?? 0;
              if (cur < 1) return false;
              slot.reagentStock[reagentId] = cur - 1;
              return true;
            }
          : undefined
      );
      for (const ev of cellarEvents) {
        if (this.activeStation === 'cellar') {
          globalAudioBus.emit({
            type: 'cellar_drip',
            midiNote: ev.midiNote,
            ratio: ev.ratio,
          });
        }
        if (ev.producedItem) {
          producedSomething = true;
        }
      }
      if (this.activeStation === 'cellar') {
        this.cellarCanvasView?.render(this.cellarEngine.getGraph(), this.simTimeSec);
      }
      if (producedSomething) {
        if (this.activeStation === 'cellar') {
          this.syncCellarUi();
        }
        if (this.activeStation === 'prep') {
          this.syncPrepUi();
        }
        if (nowMs - this.cellarSaveCooldownMs > 1800) {
          this.cellarSaveCooldownMs = nowMs;
          void this.persistSave();
        }
      }

      // 5. Master WebGL2 / Canvas2D renderer frame
      this.renderer?.renderFrame(nowMs);

      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private startCookieHeartbeat(): void {
    this.heartbeatId = window.setInterval(() => {
      if (this.disposed) return;
      if (!document.cookie.includes(`${COOKIE_VAULT_NAME}=`)) {
        void this.vault.save(this.saveState);
      }
    }, 1000);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.heartbeatId !== null) {
      window.clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
    if (this.statusWhisperTimer !== null) {
      window.clearTimeout(this.statusWhisperTimer);
    }
    this.renderer?.dispose();
    this.audioEngine.dispose();
  }
}
