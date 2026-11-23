import type {
  CraftedPotion,
  PotionEffectTag,
  PotionVessel,
  PrepForm,
  WaxSealSpec,
} from '../alchemy/index';
import type { MarketRegime, WaxColor } from '../render/index';

export const VESSEL_LABELS: Record<PotionVessel, string> = {
  prism: 'Prism Vial',
  teardrop: 'Teardrop Flagon',
  crescent: 'Crescent Ampoule',
  carafe: 'Guild Carafe',
};

export const WAX_COLOR_HEX: Record<WaxColor, string> = {
  crimson: '#b5222c',
  verdigris: '#2b8f70',
  gold: '#dca938',
  indigo: '#2e3994',
};

export const WAX_COLOR_LABELS: Record<WaxColor, string> = {
  crimson: 'Crimson Wax',
  verdigris: 'Verdigris Wax',
  gold: 'Gilded Wax',
  indigo: 'Indigo Wax',
};

export const CREST_LABELS: Record<WaxSealSpec['crest'], string> = {
  phoenix: 'Phoenix',
  alembic: 'Alembic',
  crescent: 'Crescent',
  scales: 'Scales',
};

export const EFFECT_LABELS: Record<PotionEffectTag, string> = {
  fire_ward: 'Fire Ward',
  burn_salve: 'Burn Salve',
  hearth_tonic: 'Hearth Tonic',
  galaxy_elixir: 'Galaxy Elixir',
  neutralizing_salve: 'Neutralizing Salve',
  soothing_draught: 'Soothing Draught',
};

export const REGIME_META: Record<MarketRegime, { label: string; omen: string; swatch: string }> = {
  calm: {
    label: 'Calm Harbor',
    omen: 'Steady trade along sunlit wharves',
    swatch: '#d9a45b',
  },
  dragon_siege: {
    label: 'Dragon Siege',
    omen: 'Ember-ash skies & urgent ward demand',
    swatch: '#d95729',
  },
  bumper_harvest: {
    label: 'Bumper Harvest',
    omen: 'Silver rain & abundant botanicals',
    swatch: '#5d9b84',
  },
  glacial_snap: {
    label: 'Glacial Snap',
    omen: 'Frost-rimmed panes & warming tonic craze',
    swatch: '#7dc3e8',
  },
  starfall_conclave: {
    label: 'Starfall Conclave',
    omen: 'Aurora skies & collector luster',
    swatch: '#a67ef2',
  },
};

export const PREP_LABELS: Record<PrepForm, string> = {
  raw: 'Raw',
  ground_crystal: 'Ground Crystal',
  sliced_botanical: 'Sliced Botanical',
  pipette_drops: 'Pipette Drops',
  cellar_quintessence: 'Cellar Quintessence',
  catalyst_salt: 'Catalyst Salt',
};

export function rgbTupleToCss(rgb: readonly [number, number, number], alpha = 1): string {
  const r = Math.round(Math.min(1, Math.max(0, rgb[0])) * 255);
  const g = Math.round(Math.min(1, Math.max(0, rgb[1])) * 255);
  const b = Math.round(Math.min(1, Math.max(0, rgb[2])) * 255);
  if (alpha >= 0.999) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha)).toFixed(3)})`;
}

export function formatCrowns(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  const rounded = Math.round(amount * 2) / 2;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

const VESSEL_SVG_PATHS: Record<PotionVessel, string> = {
  prism: 'M34 16 L46 16 L44 27 L62 49 L55 76 L25 76 L18 49 L36 27 Z',
  teardrop: 'M34 16 L46 16 C46 31 64 49 55 76 L25 76 C16 49 34 31 34 16 Z',
  crescent: 'M34 16 L46 16 C61 36 53 60 47 69 L53 76 L27 76 L33 69 C18 48 25 27 34 16 Z',
  carafe: 'M33 16 L47 16 L45 29 C65 38 64 70 55 76 L25 76 C16 70 15 38 35 29 Z',
};

export function createVesselOutlineSvg(vessel: PotionVessel): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 80 86');
  svg.setAttribute('class', 'vessel-silhouette-svg');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', VESSEL_SVG_PATHS[vessel]);
  path.setAttribute('fill', 'rgba(196, 232, 246, 0.16)');
  path.setAttribute('stroke', 'rgba(232, 246, 255, 0.78)');
  path.setAttribute('stroke-width', '2.4');
  svg.appendChild(path);

  const lip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  lip.setAttribute('x', '31');
  lip.setAttribute('y', '12');
  lip.setAttribute('width', '18');
  lip.setAttribute('height', '4.5');
  lip.setAttribute('rx', '2');
  lip.setAttribute('fill', 'rgba(220, 240, 250, 0.65)');
  svg.appendChild(lip);

  return svg;
}

export function createCraftedBottleSvg(potion: CraftedPotion, uidSuffix: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 80 86');
  svg.setAttribute('class', 'crafted-bottle-svg');
  svg.setAttribute('aria-hidden', 'true');

  const clipId = `bottle-clip-${uidSuffix}`;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPath.setAttribute('id', clipId);
  const clipShape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  clipShape.setAttribute('d', VESSEL_SVG_PATHS[potion.vessel]);
  clipPath.appendChild(clipShape);
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  // Stratified liquid group clipped to vessel silhouette
  const liquidGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  liquidGroup.setAttribute('clip-path', `url(#${clipId})`);

  const totalVol = potion.layers.reduce((acc, layer) => acc + Math.max(0, layer.volumeMl), 0);
  const liquidBottom = 76;
  const liquidHeight = 46;
  if (totalVol <= 0 || potion.layers.length === 0) {
    const emptyFill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    emptyFill.setAttribute('x', '14');
    emptyFill.setAttribute('y', String(liquidBottom - liquidHeight * 0.6));
    emptyFill.setAttribute('width', '52');
    emptyFill.setAttribute('height', String(liquidHeight * 0.6));
    emptyFill.setAttribute('fill', 'rgba(130, 178, 198, 0.72)');
    liquidGroup.appendChild(emptyFill);
  } else {
    let cursorY = liquidBottom;
    for (const layer of potion.layers) {
      const frac = Math.max(0, layer.volumeMl) / totalVol;
      const bandH = liquidHeight * frac;
      const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      band.setAttribute('x', '14');
      band.setAttribute('y', (cursorY - bandH).toFixed(2));
      band.setAttribute('width', '52');
      band.setAttribute('height', (bandH + 0.8).toFixed(2));
      band.setAttribute('fill', rgbTupleToCss(layer.colorRgb, 0.94));
      liquidGroup.appendChild(band);
      cursorY -= bandH;
    }
  }
  svg.appendChild(liquidGroup);

  // Crystal silhouette border
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.setAttribute('d', VESSEL_SVG_PATHS[potion.vessel]);
  outline.setAttribute('fill', 'rgba(220, 245, 255, 0.08)');
  outline.setAttribute('stroke', 'rgba(229, 246, 255, 0.85)');
  outline.setAttribute('stroke-width', '2.1');
  svg.appendChild(outline);

  // Cork stopper
  const cork = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  cork.setAttribute('x', '34.5');
  cork.setAttribute('y', '8');
  cork.setAttribute('width', '11');
  cork.setAttribute('height', '9');
  cork.setAttribute('rx', '2');
  cork.setAttribute('fill', '#9e6f41');
  svg.appendChild(cork);

  // Wax collar + stamped crest medallion
  const waxHex = WAX_COLOR_HEX[potion.seal.color] ?? WAX_COLOR_HEX.crimson;
  const collar = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  collar.setAttribute('cx', '40');
  collar.setAttribute('cy', '17');
  collar.setAttribute('rx', '9');
  collar.setAttribute('ry', '3.5');
  collar.setAttribute('fill', waxHex);
  svg.appendChild(collar);

  if (potion.seal.stamped) {
    const medallion = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    medallion.setAttribute('cx', '40');
    medallion.setAttribute('cy', '37');
    medallion.setAttribute('r', '7.5');
    medallion.setAttribute('fill', waxHex);
    medallion.setAttribute('stroke', 'rgba(255, 236, 200, 0.7)');
    medallion.setAttribute('stroke-width', '1.3');
    svg.appendChild(medallion);
  }

  return svg;
}

export function createCrestGlyph(crest: WaxSealSpec['crest']): string {
  switch (crest) {
    case 'phoenix':
      return '✦';
    case 'alembic':
      return '⚗';
    case 'crescent':
      return '☾';
    case 'scales':
      return '⚖';
  }
}
