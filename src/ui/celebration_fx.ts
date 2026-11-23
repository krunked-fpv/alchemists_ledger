import { globalAudioBus } from '../audio/index';
import type { ApothecaryRenderer, MarketRegime, WaxColor } from '../render/index';
import { REGIME_META, WAX_COLOR_HEX, formatCrowns } from './bottles';

export interface CelebrationDirectorOptions {
  hostEl: HTMLElement;
  getRenderer?: () => ApothecaryRenderer | null;
}

const CELLAR_HARVEST_COOLDOWN_MS = 4000;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getElementCenter(
  el: HTMLElement | null | undefined,
  fallbackX: number,
  fallbackY: number,
  yRatio = 0.5
): { x: number; y: number } {
  if (el && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * yRatio,
      };
    }
  }
  return { x: fallbackX, y: fallbackY };
}

/**
 * Diegetic, pointer-events-free ceremonial visual & audio celebration director.
 */
export class CelebrationDirector {
  private readonly hostEl: HTMLElement;
  private readonly getRenderer?: () => ApothecaryRenderer | null;
  private readonly layerEl: HTMLElement;
  private readonly particlesEl: HTMLElement;
  private readonly bannerSlotEl: HTMLElement;

  private readonly timers = new Set<number>();
  private bannerDismissTimer: number | null = null;
  private lastCellarHarvestAtMs = -Infinity;
  private disposed = false;

  constructor(options: CelebrationDirectorOptions) {
    this.hostEl = options.hostEl;
    this.getRenderer = options.getRenderer;

    this.layerEl = document.createElement('div');
    this.layerEl.className = 'celebration-fx-layer';

    this.particlesEl = document.createElement('div');
    this.particlesEl.className = 'celebration-particles-layer';
    this.particlesEl.setAttribute('aria-hidden', 'true');

    this.bannerSlotEl = document.createElement('div');
    this.bannerSlotEl.className = 'celebration-banner-slot';

    this.layerEl.append(this.particlesEl, this.bannerSlotEl);
    this.hostEl.appendChild(this.layerEl);
  }

  private prefersReducedMotion(): boolean {
    try {
      return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  }

  private scheduleTimer(fn: () => void, delayMs: number): number {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) {
        fn();
      }
    }, delayMs);
    this.timers.add(id);
    return id;
  }

  private restartClassAnimation(el: HTMLElement | null | undefined, className: string, durationMs: number): void {
    if (!el || this.disposed) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    this.scheduleTimer(() => {
      el.classList.remove(className);
    }, durationMs);
  }

  private mountBanner(bannerEl: HTMLElement, durationMs: number): void {
    if (this.disposed) return;
    if (this.bannerDismissTimer !== null) {
      window.clearTimeout(this.bannerDismissTimer);
      this.timers.delete(this.bannerDismissTimer);
      this.bannerDismissTimer = null;
    }

    this.bannerSlotEl.innerHTML = '';
    this.bannerSlotEl.appendChild(bannerEl);

    this.bannerDismissTimer = this.scheduleTimer(() => {
      this.bannerDismissTimer = null;
      bannerEl.classList.add('is-exiting');
      this.scheduleTimer(() => {
        if (bannerEl.parentElement === this.bannerSlotEl) {
          bannerEl.remove();
        }
      }, 280);
    }, durationMs);
  }

  /**
   * Station III Beat-3 signet stamp: embossed wax shockwave + gold-leaf/prism burst
   * + renderer caustic shock-ripple + seal_masterwork audio fanfare.
   */
  playSealMasterwork(anchorEl: HTMLElement | null, waxColor: WaxColor): void {
    if (this.disposed) return;

    this.getRenderer?.()?.triggerCelebrationBurst(0.85);
    globalAudioBus.emit({
      type: 'celebration_fanfare',
      kind: 'seal_masterwork',
      intensity: 0.9,
    });

    const waxHex = WAX_COLOR_HEX[waxColor] ?? WAX_COLOR_HEX.crimson;
    if (this.prefersReducedMotion()) {
      this.restartClassAnimation(anchorEl, 'is-reduced-seal-glow', 700);
      return;
    }

    const viewW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 960;
    const viewH = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 640;
    const center = getElementCenter(anchorEl, viewW * 0.35, viewH * 0.45, 0.34);

    const burstHost = document.createElement('div');
    burstHost.className = 'celebration-seal-burst';
    burstHost.style.left = `${center.x.toFixed(1)}px`;
    burstHost.style.top = `${center.y.toFixed(1)}px`;
    burstHost.style.setProperty('--wax-accent', waxHex);

    const shockRing = document.createElement('span');
    shockRing.className = 'celebration-wax-shockwave';
    const medallion = document.createElement('span');
    medallion.className = 'celebration-wax-medallion';
    medallion.textContent = '✦';
    burstHost.append(shockRing, medallion);

    const prismTints = ['#ffe388', '#f5b841', '#9fe7ff', '#f7b2e6', '#ffffff'] as const;
    const particleCount = 14;
    for (let i = 0; i < particleCount; i++) {
      const mote = document.createElement('span');
      mote.className = 'celebration-prism-mote';
      const angle = (i / particleCount) * Math.PI * 2 + (i % 2) * 0.16;
      const dist = 54 + (i % 3) * 28;
      mote.style.setProperty('--dx', `${(Math.cos(angle) * dist).toFixed(1)}px`);
      mote.style.setProperty('--dy', `${(Math.sin(angle) * dist).toFixed(1)}px`);
      mote.style.setProperty('--rot', `${(i * 42) % 360}deg`);
      mote.style.setProperty('--delay', `${(i % 4) * 30}ms`);
      mote.style.setProperty('--mote-color', prismTints[i % prismTints.length]);
      burstHost.appendChild(mote);
    }

    this.particlesEl.appendChild(burstHost);
    this.scheduleTimer(() => burstHost.remove(), 1150);
  }

  /**
   * Station IV bargain accepted: glinting brass/gold coins arc from the balance scale
   * into the crown tally plaque with a gilded pulse and bargain_struck fanfare.
   */
  playBargainStruck(
    scaleEl: HTMLElement | null,
    crownTallyEl: HTMLElement | null,
    earnedCrowns: number
  ): void {
    if (this.disposed) return;

    const safeCrowns = Number.isFinite(earnedCrowns) && earnedCrowns > 0 ? earnedCrowns : 1;
    const intensity = Math.min(1.25, Math.max(0.7, 0.7 + safeCrowns / 160));
    globalAudioBus.emit({
      type: 'celebration_fanfare',
      kind: 'bargain_struck',
      intensity,
    });

    this.restartClassAnimation(crownTallyEl, 'is-gilded-pulse', 950);

    if (this.prefersReducedMotion()) {
      return;
    }

    const viewW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 960;
    const viewH = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 640;
    const start = getElementCenter(scaleEl, viewW * 0.5, viewH * 0.52, 0.35);
    const end = getElementCenter(crownTallyEl, viewW * 0.72, 34, 0.5);

    const coinBatch = document.createElement('div');
    coinBatch.className = 'celebration-coin-stream';

    const coinCount = Math.min(10, Math.max(5, Math.round(safeCrowns / 14) + 4));
    for (let i = 0; i < coinCount; i++) {
      const coin = document.createElement('span');
      coin.className = 'celebration-crown-coin';
      const jitterX = ((i % 3) - 1) * 18;
      const jitterY = ((i % 2) - 0.5) * 14;
      const sx = start.x + jitterX;
      const sy = start.y + jitterY;
      coin.style.left = `${sx.toFixed(1)}px`;
      coin.style.top = `${sy.toFixed(1)}px`;
      coin.style.setProperty('--tx', `${(end.x - sx).toFixed(1)}px`);
      coin.style.setProperty('--ty', `${(end.y - sy).toFixed(1)}px`);
      coin.style.setProperty('--arc-lift', `${-56 - (i % 3) * 18}px`);
      coin.style.setProperty('--delay', `${i * 50}ms`);
      coin.textContent = '◉';
      coinBatch.appendChild(coin);
    }

    this.particlesEl.appendChild(coinBatch);
    this.scheduleTimer(() => coinBatch.remove(), 1100);
  }

  /**
   * Guild commission completed: illuminated wax-ribbon charter banner unfurls across
   * top-center alongside golden leaf motes and commission_fulfilled fanfare.
   */
  playCommissionFulfilled(title: string, rewardCrowns: number): void {
    if (this.disposed) return;

    globalAudioBus.emit({
      type: 'celebration_fanfare',
      kind: 'commission_fulfilled',
      intensity: 1.0,
    });

    const banner = document.createElement('div');
    banner.className = 'celebration-banner celebration-banner--commission';
    banner.dataset.testid = 'celebration-banner';
    banner.dataset.celebrationKind = 'commission';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const sealBadge = document.createElement('span');
    sealBadge.className = 'celebration-banner-seal';
    sealBadge.setAttribute('aria-hidden', 'true');
    sealBadge.textContent = '✦';

    const body = document.createElement('div');
    body.className = 'celebration-banner-body';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'celebration-banner-eyebrow';
    eyebrow.textContent = 'Guild Charter Fulfilled';
    const heading = document.createElement('strong');
    heading.className = 'celebration-banner-title';
    heading.textContent = title;
    body.append(eyebrow, heading);

    const rewardPill = document.createElement('span');
    rewardPill.className = 'celebration-banner-reward';
    rewardPill.textContent = `+${formatCrowns(rewardCrowns)} Cr`;

    banner.append(sealBadge, body, rewardPill);
    this.mountBanner(banner, 3800);

    if (!this.prefersReducedMotion()) {
      const viewW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 960;
      const leafBatch = document.createElement('div');
      leafBatch.className = 'celebration-leaf-burst';
      for (let i = 0; i < 10; i++) {
        const leaf = document.createElement('span');
        leaf.className = 'celebration-leaf-mote';
        const offsetX = (i - 4.5) * 34;
        leaf.style.left = `${(viewW * 0.5 + offsetX).toFixed(1)}px`;
        leaf.style.top = '58px';
        leaf.style.setProperty('--dx', `${((i % 2 === 0 ? 1 : -1) * (18 + (i % 4) * 14)).toFixed(1)}px`);
        leaf.style.setProperty('--dy', `${(48 + (i % 3) * 26).toFixed(1)}px`);
        leaf.style.setProperty('--delay', `${i * 45}ms`);
        leafBatch.appendChild(leaf);
      }
      this.particlesEl.appendChild(leafBatch);
      this.scheduleTimer(() => leafBatch.remove(), 1450);
    }
  }

  /**
   * New Dawn shift: sweeping Atmospheric Dawn Omen banner styled to incoming MarketRegime
   * and bronze morning bell dawn_chime fanfare.
   */
  playDawnShift(regime: MarketRegime, day: number, label: string): void {
    if (this.disposed) return;

    globalAudioBus.emit({
      type: 'celebration_fanfare',
      kind: 'dawn_chime',
      intensity: 0.95,
    });

    const meta = REGIME_META[regime] ?? REGIME_META.calm;
    const banner = document.createElement('div');
    banner.className = 'celebration-banner celebration-banner--dawn';
    banner.dataset.testid = 'celebration-banner';
    banner.dataset.celebrationKind = 'dawn';
    banner.dataset.regime = regime;
    banner.style.setProperty('--regime-swatch', meta.swatch);
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const orb = document.createElement('span');
    orb.className = 'celebration-banner-orb';
    orb.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    body.className = 'celebration-banner-body';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'celebration-banner-eyebrow';
    eyebrow.textContent = `Dawn Break · Day ${day}`;
    const heading = document.createElement('strong');
    heading.className = 'celebration-banner-title';
    heading.textContent = label || meta.label;
    const sub = document.createElement('span');
    sub.className = 'celebration-banner-sub';
    sub.textContent = meta.omen;
    body.append(eyebrow, heading, sub);

    banner.append(orb, body);
    this.mountBanner(banner, 3600);
  }

  /**
   * Station V cellar yield: subtle emerald/gold glow flare + throttled cellar_harvest
   * harmonic triad (cooldown >= 4000ms so background ticks never spam).
   */
  playCellarHarvest(reagentName: string, anchorEl?: HTMLElement | null): void {
    if (this.disposed) return;

    const currentMs = nowMs();
    if (currentMs - this.lastCellarHarvestAtMs < CELLAR_HARVEST_COOLDOWN_MS) {
      return;
    }
    this.lastCellarHarvestAtMs = currentMs;

    globalAudioBus.emit({
      type: 'celebration_fanfare',
      kind: 'cellar_harvest',
      intensity: 0.72,
    });

    if (this.prefersReducedMotion()) {
      this.restartClassAnimation(anchorEl, 'is-cellar-harvest-glow', 800);
      return;
    }

    const viewW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 960;
    const viewH = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 640;
    const pos = getElementCenter(anchorEl, viewW * 0.5, viewH * 0.42, 0.5);

    const flare = document.createElement('div');
    flare.className = 'celebration-cellar-flare';
    flare.style.left = `${pos.x.toFixed(1)}px`;
    flare.style.top = `${pos.y.toFixed(1)}px`;

    const halo = document.createElement('span');
    halo.className = 'celebration-cellar-halo';
    const caption = document.createElement('span');
    caption.className = 'celebration-cellar-tag';
    caption.textContent = `✦ ${reagentName}`;
    flare.append(halo, caption);

    this.particlesEl.appendChild(flare);
    this.scheduleTimer(() => flare.remove(), 1250);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers.clear();
    this.bannerDismissTimer = null;
    this.layerEl.remove();
  }
}
