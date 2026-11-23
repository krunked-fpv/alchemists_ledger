import type { CraftedPotion } from '../alchemy/index';
import type { BrassScaleState, BrassWeightDenom } from '../../simulation/npc_envoys';
import { createCraftedBottleSvg, formatCrowns } from './bottles';

export interface BrassScaleViewCallbacks {
  onRemoveWeight: (index: number) => void;
}

export class BrassScaleView {
  private readonly root: HTMLElement;
  private readonly callbacks: BrassScaleViewCallbacks;

  private beamGroup: SVGGElement | null = null;
  private leftChainGroup: SVGGElement | null = null;
  private rightChainGroup: SVGGElement | null = null;
  private pointerNeedle: SVGLineElement | null = null;
  private leftSlotEl: HTMLElement | null = null;
  private rightTrayEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  private renderedPotionId: string | null = null;
  private renderedWeightsKey = '';
  private renderedStatusKey = '';

  constructor(root: HTMLElement, callbacks: BrassScaleViewCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.buildDom();
  }

  private buildDom(): void {
    this.root.innerHTML = '';
    this.root.classList.add('brass-scale-stage');

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 360 210');
    svg.setAttribute('class', 'brass-scale-svg');
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(svgNS, 'defs');
    const brassGrad = document.createElementNS(svgNS, 'linearGradient');
    brassGrad.setAttribute('id', 'scaleBrassGrad');
    brassGrad.setAttribute('x1', '0%');
    brassGrad.setAttribute('y1', '0%');
    brassGrad.setAttribute('x2', '100%');
    brassGrad.setAttribute('y2', '100%');
    const stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#e9c878');
    const stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '55%');
    stop2.setAttribute('stop-color', '#a67b36');
    const stop3 = document.createElementNS(svgNS, 'stop');
    stop3.setAttribute('offset', '100%');
    stop3.setAttribute('stop-color', '#593e18');
    brassGrad.append(stop1, stop2, stop3);
    defs.appendChild(brassGrad);
    svg.appendChild(defs);

    // Pedestal & graduated balance arc
    const base = document.createElementNS(svgNS, 'path');
    base.setAttribute('d', 'M122 198 L238 198 L226 184 L134 184 Z');
    base.setAttribute('fill', 'url(#scaleBrassGrad)');
    const pillar = document.createElementNS(svgNS, 'rect');
    pillar.setAttribute('x', '173');
    pillar.setAttribute('y', '48');
    pillar.setAttribute('width', '14');
    pillar.setAttribute('height', '138');
    pillar.setAttribute('rx', '5');
    pillar.setAttribute('fill', 'url(#scaleBrassGrad)');

    const arc = document.createElementNS(svgNS, 'path');
    arc.setAttribute('d', 'M154 114 Q180 124 206 114');
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', '#caa055');
    arc.setAttribute('stroke-width', '2');

    const centerTick = document.createElementNS(svgNS, 'line');
    centerTick.setAttribute('x1', '180');
    centerTick.setAttribute('y1', '112');
    centerTick.setAttribute('x2', '180');
    centerTick.setAttribute('y2', '126');
    centerTick.setAttribute('stroke', '#f7dfa0');
    centerTick.setAttribute('stroke-width', '2');

    svg.append(base, pillar, arc, centerTick);

    // Beam + pointer needle
    const beamGroup = document.createElementNS(svgNS, 'g');
    const beamBar = document.createElementNS(svgNS, 'path');
    beamBar.setAttribute('d', 'M56 50 L180 42 L304 50 L304 56 L180 52 L56 56 Z');
    beamBar.setAttribute('fill', 'url(#scaleBrassGrad)');
    const fulcrumCap = document.createElementNS(svgNS, 'circle');
    fulcrumCap.setAttribute('cx', '180');
    fulcrumCap.setAttribute('cy', '49');
    fulcrumCap.setAttribute('r', '9');
    fulcrumCap.setAttribute('fill', '#e5c16c');
    fulcrumCap.setAttribute('stroke', '#3d2910');
    fulcrumCap.setAttribute('stroke-width', '2');

    const pointer = document.createElementNS(svgNS, 'line');
    pointer.setAttribute('x1', '180');
    pointer.setAttribute('y1', '54');
    pointer.setAttribute('x2', '180');
    pointer.setAttribute('y2', '112');
    pointer.setAttribute('stroke', '#f1d287');
    pointer.setAttribute('stroke-width', '2.4');

    beamGroup.append(beamBar, pointer, fulcrumCap);
    svg.appendChild(beamGroup);
    this.beamGroup = beamGroup;
    this.pointerNeedle = pointer;

    // Left Pan & Chains
    const leftChain = document.createElementNS(svgNS, 'g');
    leftChain.innerHTML = `
      <line x1="0" y1="0" x2="-34" y2="86" stroke="#c89e52" stroke-width="2" />
      <line x1="0" y1="0" x2="34" y2="86" stroke="#c89e52" stroke-width="2" />
      <path d="M-42 86 Q0 104 42 86 Z" fill="url(#scaleBrassGrad)" stroke="#4c3312" stroke-width="1.5" />
    `;
    svg.appendChild(leftChain);
    this.leftChainGroup = leftChain;

    // Right Pan & Chains
    const rightChain = document.createElementNS(svgNS, 'g');
    rightChain.innerHTML = `
      <line x1="0" y1="0" x2="-34" y2="86" stroke="#c89e52" stroke-width="2" />
      <line x1="0" y1="0" x2="34" y2="86" stroke="#c89e52" stroke-width="2" />
      <path d="M-42 86 Q0 104 42 86 Z" fill="url(#scaleBrassGrad)" stroke="#4c3312" stroke-width="1.5" />
    `;
    svg.appendChild(rightChain);
    this.rightChainGroup = rightChain;

    this.root.appendChild(svg);

    const readouts = document.createElement('div');
    readouts.className = 'scale-pan-readouts';

    const leftSlot = document.createElement('div');
    leftSlot.className = 'scale-pan-card scale-pan-card--left';
    this.leftSlotEl = leftSlot;

    const status = document.createElement('div');
    status.className = 'scale-equilibrium-badge';
    this.statusEl = status;

    const rightTray = document.createElement('div');
    rightTray.className = 'scale-pan-card scale-pan-card--right';
    this.rightTrayEl = rightTray;

    readouts.append(leftSlot, status, rightTray);
    this.root.appendChild(readouts);
  }

  update(scaleState: BrassScaleState, potion: CraftedPotion | null): void {
    const tiltRad = Number.isFinite(scaleState.tiltAngleRad) ? scaleState.tiltAngleRad : 0;
    const deg = (-tiltRad * 180) / Math.PI;

    if (this.beamGroup) {
      this.beamGroup.setAttribute('transform', `rotate(${deg.toFixed(3)} 180 51)`);
    }
    if (this.pointerNeedle) {
      this.pointerNeedle.setAttribute('stroke', scaleState.balanced ? '#7be3a6' : '#f1d287');
    }

    const armHalf = 118;
    const pivotX = 180;
    const pivotY = 51;
    const leftX = pivotX - Math.cos(tiltRad) * armHalf;
    const leftY = pivotY + Math.sin(tiltRad) * armHalf;
    const rightX = pivotX + Math.cos(tiltRad) * armHalf;
    const rightY = pivotY - Math.sin(tiltRad) * armHalf;

    if (this.leftChainGroup) {
      this.leftChainGroup.setAttribute('transform', `translate(${leftX.toFixed(2)}, ${leftY.toFixed(2)})`);
    }
    if (this.rightChainGroup) {
      this.rightChainGroup.setAttribute('transform', `translate(${rightX.toFixed(2)}, ${rightY.toFixed(2)})`);
    }

    const potionId = potion?.id ?? '__none__';
    if (this.leftSlotEl && (this.renderedPotionId !== potionId || !this.leftSlotEl.dataset.massSynced)) {
      this.renderedPotionId = potionId;
      this.leftSlotEl.dataset.massSynced = String(scaleState.leftMassCrowns);
      this.renderLeftPan(potion, scaleState.leftMassCrowns);
    } else if (
      this.leftSlotEl &&
      this.leftSlotEl.dataset.massSynced !== String(scaleState.leftMassCrowns)
    ) {
      this.leftSlotEl.dataset.massSynced = String(scaleState.leftMassCrowns);
      this.renderLeftPan(potion, scaleState.leftMassCrowns);
    }

    const weightsKey = scaleState.weightsOnPan.join(',') + `|${scaleState.rightMassCrowns}`;
    if (this.rightTrayEl && this.renderedWeightsKey !== weightsKey) {
      this.renderedWeightsKey = weightsKey;
      this.renderRightPan(scaleState.weightsOnPan, scaleState.rightMassCrowns);
    }

    const statusKey = `${scaleState.balanced}|${scaleState.settled}|${scaleState.leftMassCrowns}|${scaleState.rightMassCrowns}`;
    if (this.statusEl && this.renderedStatusKey !== statusKey) {
      this.renderedStatusKey = statusKey;
      this.statusEl.classList.toggle('is-balanced', scaleState.balanced);
      if (scaleState.leftMassCrowns <= 0 && scaleState.rightMassCrowns <= 0) {
        this.statusEl.textContent = 'Empty Pans';
      } else if (scaleState.balanced) {
        this.statusEl.textContent = 'True Equilibrium';
      } else if (scaleState.leftMassCrowns > scaleState.rightMassCrowns) {
        this.statusEl.textContent = 'Left Pan Heavy';
      } else {
        this.statusEl.textContent = 'Counterweight Heavy';
      }
    }
  }

  private renderLeftPan(potion: CraftedPotion | null, leftMassCrowns: number): void {
    if (!this.leftSlotEl) return;
    this.leftSlotEl.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'pan-title';
    label.textContent = `Left Pan · ${formatCrowns(leftMassCrowns)} Cr`;
    this.leftSlotEl.appendChild(label);

    if (potion) {
      const miniWrap = document.createElement('div');
      miniWrap.className = 'scale-bottle-mini';
      miniWrap.appendChild(createCraftedBottleSvg(potion, `scale-${potion.id}`));
      const nameSpan = document.createElement('span');
      nameSpan.className = 'scale-bottle-name';
      nameSpan.textContent = potion.name;
      miniWrap.appendChild(nameSpan);
      this.leftSlotEl.appendChild(miniWrap);
    } else {
      const empty = document.createElement('span');
      empty.className = 'scale-pan-empty';
      empty.textContent = 'Select bottle on Oak Shelf';
      this.leftSlotEl.appendChild(empty);
    }
  }

  private renderRightPan(weights: BrassWeightDenom[], rightMassCrowns: number): void {
    if (!this.rightTrayEl) return;
    this.rightTrayEl.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'pan-title';
    label.textContent = `Counterweights · ${formatCrowns(rightMassCrowns)} Cr`;
    this.rightTrayEl.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'placed-weights-row';
    if (weights.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'scale-pan-empty';
      empty.textContent = 'No brass weights';
      chips.appendChild(empty);
    } else {
      weights.forEach((denom, idx) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'placed-weight-chip';
        chip.textContent = `${denom} Cr ×`;
        chip.title = `Remove ${denom} Crown brass weight`;
        chip.addEventListener('click', () => this.callbacks.onRemoveWeight(idx));
        chips.appendChild(chip);
      });
    }
    this.rightTrayEl.appendChild(chips);
  }
}
