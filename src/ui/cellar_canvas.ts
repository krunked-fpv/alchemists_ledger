import { REAGENT_CATALOG, type ReagentId } from '../alchemy/index';
import {
  evalCubicBezier,
  type CellarApparatusType,
  type CellarNode,
  type CellarPipeEdge,
  type CellarPipeGraph,
} from '../cellar/index';
import { rgbTupleToCss } from './bottles';

export interface CellarCanvasCallbacks {
  onSelectNode: (nodeId: string | null) => void;
  onMoveNode: (nodeId: string, nx: number, ny: number) => void;
  onCommitLayout: () => void;
  onConnectPair: (fromNodeId: string, toNodeId: string) => void;
}

const APPARATUS_SHORT: Record<CellarApparatusType, string> = {
  boiling_retort: 'Retort',
  graham_condenser: 'Condenser',
  copper_siphon: 'Siphon',
  drip_alembic: 'Alembic',
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function getEdgeControlPoints(
  from: CellarNode,
  to: CellarNode,
  w: number,
  h: number
): [[number, number], [number, number], [number, number], [number, number]] {
  const x0 = from.x * w;
  const y0 = from.y * h;
  const x3 = to.x * w;
  const y3 = to.y * h;
  const dx = x3 - x0;
  const dy = y3 - y0;
  const span = Math.max(48, Math.abs(dx) * 0.45);
  const sag = Math.abs(dy) < 28 ? 38 : dy * 0.25;
  const p0: [number, number] = [x0, y0];
  const p1: [number, number] = [x0 + (dx >= 0 ? span : -span), y0 + sag];
  const p2: [number, number] = [x3 - (dx >= 0 ? span : -span), y3 - sag];
  const p3: [number, number] = [x3, y3];
  return [p0, p1, p2, p3];
}

export class CellarCanvasView {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: CellarCanvasCallbacks;

  private ctx: CanvasRenderingContext2D | null = null;
  private latestGraph: CellarPipeGraph = {
    nodes: [],
    edges: [],
    quintessences: {},
    catalystSalts: {},
  };
  private selectedNodeId: string | null = null;
  private connectSourceId: string | null = null;

  private draggingNodeId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private didDrag = false;

  constructor(canvas: HTMLCanvasElement, callbacks: CellarCanvasCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    try {
      this.ctx = canvas.getContext('2d');
    } catch {
      this.ctx = null;
    }
    this.bindPointerEvents();
  }

  setSelection(selectedNodeId: string | null, connectSourceId: string | null): void {
    this.selectedNodeId = selectedNodeId;
    this.connectSourceId = connectSourceId;
  }

  private toNormalized(ev: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    return [
      clamp((ev.clientX - rect.left) / w, 0.07, 0.93),
      clamp((ev.clientY - rect.top) / h, 0.12, 0.88),
    ];
  }

  private findNodeAt(nx: number, ny: number): CellarNode | null {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || this.canvas.width || 640);
    const h = Math.max(1, rect.height || this.canvas.height || 360);
    const px = nx * w;
    const py = ny * h;

    for (let i = this.latestGraph.nodes.length - 1; i >= 0; i--) {
      const n = this.latestGraph.nodes[i];
      const dx = n.x * w - px;
      const dy = n.y * h - py;
      if (dx * dx + dy * dy <= 34 * 34) {
        return n;
      }
    }
    return null;
  }

  private bindPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', (ev) => {
      const [nx, ny] = this.toNormalized(ev);
      const hit = this.findNodeAt(nx, ny);
      if (hit) {
        if (this.connectSourceId && this.connectSourceId !== hit.id) {
          this.callbacks.onConnectPair(this.connectSourceId, hit.id);
          return;
        }
        this.draggingNodeId = hit.id;
        this.dragStartX = ev.clientX;
        this.dragStartY = ev.clientY;
        this.didDrag = false;
        this.callbacks.onSelectNode(hit.id);
        this.canvas.setPointerCapture?.(ev.pointerId);
      } else {
        this.callbacks.onSelectNode(null);
      }
    });

    this.canvas.addEventListener('pointermove', (ev) => {
      if (!this.draggingNodeId) return;
      const dist = Math.hypot(ev.clientX - this.dragStartX, ev.clientY - this.dragStartY);
      if (dist > 5) {
        this.didDrag = true;
      }
      if (this.didDrag) {
        const [nx, ny] = this.toNormalized(ev);
        this.callbacks.onMoveNode(this.draggingNodeId, nx, ny);
      }
    });

    const finishDrag = (ev: PointerEvent) => {
      if (!this.draggingNodeId) return;
      if (this.canvas.hasPointerCapture?.(ev.pointerId)) {
        this.canvas.releasePointerCapture(ev.pointerId);
      }
      const moved = this.didDrag;
      this.draggingNodeId = null;
      this.didDrag = false;
      if (moved) {
        this.callbacks.onCommitLayout();
      }
    };

    this.canvas.addEventListener('pointerup', finishDrag);
    this.canvas.addEventListener('pointercancel', finishDrag);
  }

  render(graph: CellarPipeGraph, timeSec: number): void {
    this.latestGraph = graph;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw > 0 && ch > 0) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(cw * dpr);
      const targetH = Math.round(ch * dpr);
      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
    } else {
      if (!this.canvas.width) this.canvas.width = 760;
      if (!this.canvas.height) this.canvas.height = 380;
    }

    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const dprScale = Math.max(1, w / Math.max(1, cw || w));

    // Candlelit stone masonry background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#18141a');
    bg.addColorStop(0.6, '#231c22');
    bg.addColorStop(1, '#130e10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle stone blocks
    ctx.strokeStyle = 'rgba(255, 224, 178, 0.045)';
    ctx.lineWidth = 1.2 * dprScale;
    const rowH = Math.max(36, h / 7);
    for (let r = 0; r < 8; r++) {
      const y = r * rowH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      const offset = (r % 2) * (w / 10);
      for (let x = offset; x < w; x += w / 5) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowH);
        ctx.stroke();
      }
    }

    // Flickering candle halos along stone arch
    const flicker = 0.85 + Math.sin(timeSec * 5.2) * 0.08 + Math.sin(timeSec * 11.7) * 0.04;
    for (const cxFrac of [0.16, 0.5, 0.84]) {
      const cx = w * cxFrac;
      const cy = h * 0.16;
      const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.min(w, h) * 0.34);
      halo.addColorStop(0, `rgba(255, 182, 74, ${(0.22 * flicker).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255, 140, 40, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
    }

    const nodeMap = new Map<string, CellarNode>();
    for (const node of graph.nodes) {
      nodeMap.set(node.id, node);
    }

    // Draw Bezier borosilicate tubes and glowing droplets
    for (const edge of graph.edges) {
      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      if (!from || !to) continue;
      this.drawPipeEdge(ctx, edge, from, to, nodeMap, graph.edges, w, h, dprScale);
    }

    // Draw glassware apparatus nodes
    for (const node of graph.nodes) {
      this.drawApparatusNode(ctx, node, w, h, dprScale, timeSec);
    }

    if (graph.nodes.length === 0) {
      ctx.fillStyle = 'rgba(232, 212, 178, 0.72)';
      ctx.font = `${Math.round(14 * dprScale)}px Palatino Linotype, Book Antiqua, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillText(
        'Place retorts, condensers, siphons & alembics below to weave a polyrhythmic still',
        w * 0.5,
        h * 0.52
      );
    }
  }

  private resolveReagentColor(
    fromNode: CellarNode,
    edges: CellarPipeEdge[],
    nodeMap: Map<string, CellarNode>
  ): [number, number, number] {
    const queue = [fromNode.id];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const curId = queue.shift()!;
      if (visited.has(curId)) continue;
      visited.add(curId);
      const node = nodeMap.get(curId);
      if (!node) continue;
      if (node.inputReagent) {
        return REAGENT_CATALOG[node.inputReagent].baseColorRgb;
      }
      for (const e of edges) {
        if (e.toNodeId === curId && !visited.has(e.fromNodeId)) {
          queue.push(e.fromNodeId);
        }
      }
    }
    return [0.36, 0.82, 0.78];
  }

  private drawPipeEdge(
    ctx: CanvasRenderingContext2D,
    edge: CellarPipeEdge,
    from: CellarNode,
    to: CellarNode,
    nodeMap: Map<string, CellarNode>,
    edges: CellarPipeEdge[],
    w: number,
    h: number,
    scale: number
  ): void {
    const [p0, p1, p2, p3] = getEdgeControlPoints(from, to, w, h);
    const fluidColor = this.resolveReagentColor(from, edges, nodeMap);

    // Outer borosilicate tube shadow
    ctx.strokeStyle = 'rgba(170, 224, 240, 0.25)';
    ctx.lineWidth = 8 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    ctx.stroke();

    // Inner glowing capillary
    ctx.strokeStyle = rgbTupleToCss(fluidColor, 0.45);
    ctx.lineWidth = 3.2 * scale;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    ctx.stroke();

    // Glowing primary droplet via evalCubicBezier
    const dropletPt = evalCubicBezier(p0, p1, p2, p3, edge.dropletProgress);
    const trailPt = evalCubicBezier(p0, p1, p2, p3, Math.max(0, edge.dropletProgress - 0.08));

    const glow = ctx.createRadialGradient(
      dropletPt[0],
      dropletPt[1],
      1,
      dropletPt[0],
      dropletPt[1],
      15 * scale
    );
    glow.addColorStop(0, rgbTupleToCss(fluidColor, 0.95));
    glow.addColorStop(1, rgbTupleToCss(fluidColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(dropletPt[0], dropletPt[1], 15 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff5dc';
    ctx.beginPath();
    ctx.arc(dropletPt[0], dropletPt[1], 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgbTupleToCss(fluidColor, 0.72);
    ctx.beginPath();
    ctx.arc(trailPt[0], trailPt[1], 2.6 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Polyrhythm ratio badge along midpoint
    const mid = evalCubicBezier(p0, p1, p2, p3, 0.5);
    ctx.fillStyle = 'rgba(22, 16, 12, 0.85)';
    ctx.strokeStyle = 'rgba(212, 175, 100, 0.55)';
    ctx.lineWidth = 1 * scale;
    const bw = 34 * scale;
    const bh = 18 * scale;
    ctx.beginPath();
    ctx.roundRect(mid[0] - bw / 2, mid[1] - bh / 2, bw, bh, 5 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f2deb0';
    ctx.font = `bold ${Math.round(10 * scale)}px Palatino Linotype, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(edge.ratio, mid[0], mid[1]);
  }

  private drawApparatusNode(
    ctx: CanvasRenderingContext2D,
    node: CellarNode,
    w: number,
    h: number,
    scale: number,
    timeSec: number
  ): void {
    const cx = node.x * w;
    const cy = node.y * h;
    const r = 24 * scale;

    const isSelected = node.id === this.selectedNodeId;
    const isConnectSrc = node.id === this.connectSourceId;
    const reagentSpec = node.inputReagent ? REAGENT_CATALOG[node.inputReagent as ReagentId] : null;
    const tint = reagentSpec ? reagentSpec.baseColorRgb : ([0.44, 0.74, 0.86] as const);

    // Selection or linking ring
    if (isSelected || isConnectSrc) {
      ctx.strokeStyle = isConnectSrc ? '#7de3a6' : '#f0c76e';
      ctx.lineWidth = 2.4 * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 7 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Spirit flame beneath retorts/alembics
    if (node.type === 'boiling_retort' || node.type === 'drip_alembic') {
      const pulse = 0.8 + Math.sin(node.cyclePhase * Math.PI * 2 + timeSec * 4) * 0.2;
      ctx.fillStyle = `rgba(255, 146, 48, ${(0.75 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r + 5 * scale, 7 * scale * pulse, 4 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Apparatus glass vessel
    ctx.fillStyle = 'rgba(18, 22, 28, 0.78)';
    ctx.strokeStyle = node.type === 'copper_siphon' ? '#d49155' : 'rgba(208, 240, 255, 0.82)';
    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    if (node.type === 'graham_condenser') {
      ctx.roundRect(cx - r * 0.72, cy - r, r * 1.44, r * 2, 10 * scale);
    } else if (node.type === 'copper_siphon') {
      ctx.moveTo(cx - r * 0.8, cy + r * 0.8);
      ctx.lineTo(cx - r * 0.8, cy - r * 0.4);
      ctx.arc(cx, cy - r * 0.4, r * 0.8, Math.PI, 0, false);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.8);
      ctx.closePath();
    } else if (node.type === 'drip_alembic') {
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.85);
      ctx.lineTo(cx - r * 0.9, cy + r * 0.85);
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Inner glowing essence fill
    ctx.fillStyle = rgbTupleToCss(tint, reagentSpec ? 0.72 : 0.28);
    ctx.beginPath();
    ctx.arc(cx, cy + 2 * scale, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // Apparatus label
    ctx.fillStyle = '#f2e4c7';
    ctx.font = `bold ${Math.round(11 * scale)}px Palatino Linotype, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(APPARATUS_SHORT[node.type], cx, cy + r + 10 * scale);

    if (reagentSpec) {
      ctx.fillStyle = '#d4b888';
      ctx.font = `${Math.round(9.5 * scale)}px Palatino Linotype, Georgia, serif`;
      ctx.fillText(reagentSpec.name.split(' ')[0], cx, cy + r + 23 * scale);
    }
  }
}
