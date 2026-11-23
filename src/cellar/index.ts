import type { ReagentId } from '../alchemy/reagents';

export type { ReagentId };

export type PolyrhythmRatio = '3:4' | '4:5' | '5:6';

export type CellarApparatusType =
  | 'boiling_retort'
  | 'graham_condenser'
  | 'copper_siphon'
  | 'drip_alembic';

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
  producedItem?: {
    kind: 'cellar_quintessence' | 'catalyst_salt';
    reagentId: ReagentId;
    units: number;
  };
}

/**
 * Dorian / Lydian borosilicate glass-drip pitch palette (D4..D5).
 */
export const DORIAN_LYDIAN_MIDI_NOTES: readonly number[] = [
  62, 64, 65, 67, 69, 71, 72, 74,
] as const;

const BAR_DURATION_SEC = 2.0;
const PHASE_EPSILON = 1e-9;

const RATIO_PARTS: Record<PolyrhythmRatio, readonly [number, number]> = {
  '3:4': [3, 4],
  '4:5': [4, 5],
  '5:6': [5, 6],
};

const VOICE_A_PATTERN = [0, 2, 4, 1, 3] as const; // D4, F4, A4, E4, G4
const VOICE_B_PATTERN = [3, 4, 5, 6, 7, 4] as const; // G4, A4, B4, C5, D5, A4

interface EdgePulseRuntime {
  aPhase: number;
  aCount: number;
  bCount: number;
}

interface ScheduledCross {
  timeSec: number;
  edgeIndex: number;
  voice: 'a' | 'b';
  edge: CellarPipeEdge;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function wrapPhase(phase: number): number {
  if (!Number.isFinite(phase) || phase < 0) {
    return 0;
  }
  const frac = phase - Math.floor(phase + PHASE_EPSILON);
  if (Math.abs(frac) < PHASE_EPSILON || Math.abs(1 - frac) < PHASE_EPSILON) {
    return 0;
  }
  return clamp(frac, 0, 1 - PHASE_EPSILON);
}

function cloneNode(node: CellarNode): CellarNode {
  return {
    id: node.id,
    type: node.type,
    x: clamp(finiteOr(node.x, 0.5), 0, 1),
    y: clamp(finiteOr(node.y, 0.5), 0, 1),
    ...(node.inputReagent !== undefined ? { inputReagent: node.inputReagent } : {}),
    active: Boolean(node.active),
    cyclePhase: wrapPhase(node.cyclePhase),
  };
}

function cloneEdge(edge: CellarPipeEdge): CellarPipeEdge {
  return {
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    ratio: edge.ratio,
    dropletProgress: wrapPhase(edge.dropletProgress),
  };
}

function cloneCounts(
  counts: Partial<Record<ReagentId, number>> | undefined
): Partial<Record<ReagentId, number>> {
  const result: Partial<Record<ReagentId, number>> = {};
  if (!counts) {
    return result;
  }
  for (const [key, val] of Object.entries(counts) as Array<[ReagentId, number | undefined]>) {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      result[key] = Math.floor(val);
    }
  }
  return result;
}

/**
 * Evaluates a 2D cubic Bezier curve at parameter t clamped to [0, 1].
 */
export function evalCubicBezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const u = clamp(finiteOr(t, 0), 0, 1);
  const inv = 1 - u;
  const inv2 = inv * inv;
  const u2 = u * u;

  const w0 = inv2 * inv;
  const w1 = 3 * inv2 * u;
  const w2 = 3 * inv * u2;
  const w3 = u2 * u;

  return [
    w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
  ];
}

/**
 * Kinetic borosilicate cellar graph engine running deterministic 3:4, 4:5, and 5:6
 * polyrhythmic distillation chains to synthesize cellar quintessences and catalyst salts.
 */
export class CellarAutomationEngine {
  private graph: CellarPipeGraph = {
    nodes: [],
    edges: [],
    quintessences: {},
    catalystSalts: {},
  };
  private edgeRuntime = new Map<string, EdgePulseRuntime>();
  private nodeSeq = 0;
  private edgeSeq = 0;

  constructor(initialGraph?: CellarPipeGraph) {
    if (initialGraph) {
      this.loadGraph(initialGraph);
    }
  }

  getGraph(): CellarPipeGraph {
    return {
      nodes: this.graph.nodes.map((node) => cloneNode(node)),
      edges: this.graph.edges.map((edge) => cloneEdge(edge)),
      quintessences: cloneCounts(this.graph.quintessences),
      catalystSalts: cloneCounts(this.graph.catalystSalts),
    };
  }

  loadGraph(graph: CellarPipeGraph): void {
    this.graph = {
      nodes: graph.nodes.map((node) => cloneNode(node)),
      edges: graph.edges.map((edge) => cloneEdge(edge)),
      quintessences: cloneCounts(graph.quintessences),
      catalystSalts: cloneCounts(graph.catalystSalts),
    };
    this.edgeRuntime.clear();
    for (const edge of this.graph.edges) {
      const [num, den] = RATIO_PARTS[edge.ratio];
      this.edgeRuntime.set(edge.id, {
        aPhase: wrapPhase((edge.dropletProgress * num) / den),
        aCount: 0,
        bCount: 0,
      });
    }
    this.nodeSeq = this.graph.nodes.length;
    this.edgeSeq = this.graph.edges.length;
  }

  addNode(
    type: CellarApparatusType,
    x: number,
    y: number,
    inputReagent?: ReagentId
  ): CellarNode {
    const id = this.nextUniqueNodeId();
    const node: CellarNode = {
      id,
      type,
      x: clamp(finiteOr(x, 0.5), 0, 1),
      y: clamp(finiteOr(y, 0.5), 0, 1),
      ...(inputReagent !== undefined ? { inputReagent } : {}),
      active: true,
      cyclePhase: 0,
    };
    this.graph.nodes.push(node);
    return cloneNode(node);
  }

  connectNodes(
    fromNodeId: string,
    toNodeId: string,
    ratio: PolyrhythmRatio = '3:4'
  ): CellarPipeEdge | null {
    if (fromNodeId === toNodeId) {
      return null;
    }

    const fromExists = this.graph.nodes.some((n) => n.id === fromNodeId);
    const toExists = this.graph.nodes.some((n) => n.id === toNodeId);
    if (!fromExists || !toExists) {
      return null;
    }

    const duplicate = this.graph.edges.some(
      (e) => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId
    );
    if (duplicate) {
      return null;
    }

    const id = this.nextUniqueEdgeId();
    const edge: CellarPipeEdge = {
      id,
      fromNodeId,
      toNodeId,
      ratio,
      dropletProgress: 0,
    };
    this.graph.edges.push(edge);
    this.edgeRuntime.set(id, { aPhase: 0, aCount: 0, bCount: 0 });
    return cloneEdge(edge);
  }

  removeNode(nodeId: string): void {
    this.graph.nodes = this.graph.nodes.filter((n) => n.id !== nodeId);
    const remainingEdges: CellarPipeEdge[] = [];
    for (const edge of this.graph.edges) {
      if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
        this.edgeRuntime.delete(edge.id);
      } else {
        remainingEdges.push(edge);
      }
    }
    this.graph.edges = remainingEdges;
  }

  setNodeReagent(nodeId: string, reagentId: ReagentId): void {
    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.inputReagent = reagentId;
    }
  }

  tick(
    dtSec: number,
    consumeBotanical?: (reagentId: ReagentId) => boolean
  ): DistillationTickEvent[] {
    if (!Number.isFinite(dtSec) || dtSec <= 0) {
      return [];
    }

    const nodeById = new Map<string, CellarNode>();
    for (const node of this.graph.nodes) {
      nodeById.set(node.id, node);
      if (node.active) {
        node.cyclePhase = wrapPhase(node.cyclePhase + dtSec / BAR_DURATION_SEC);
      }
    }

    const outgoingCountByNode = new Map<string, number>();
    for (const edge of this.graph.edges) {
      outgoingCountByNode.set(
        edge.fromNodeId,
        (outgoingCountByNode.get(edge.fromNodeId) ?? 0) + 1
      );
    }

    const crossings: ScheduledCross[] = [];

    for (let edgeIndex = 0; edgeIndex < this.graph.edges.length; edgeIndex++) {
      const edge = this.graph.edges[edgeIndex];
      const fromNode = nodeById.get(edge.fromNodeId);
      const toNode = nodeById.get(edge.toNodeId);
      if (!fromNode || !toNode || !fromNode.active || !toNode.active) {
        continue;
      }

      const [num, den] = RATIO_PARTS[edge.ratio];
      let runtime = this.edgeRuntime.get(edge.id);
      if (!runtime) {
        runtime = {
          aPhase: wrapPhase((edge.dropletProgress * num) / den),
          aCount: 0,
          bCount: 0,
        };
        this.edgeRuntime.set(edge.id, runtime);
      }

      const rateA = num / BAR_DURATION_SEC;
      const rateB = den / BAR_DURATION_SEC;

      const prevA = runtime.aPhase;
      const nextA = prevA + dtSec * rateA;
      const crossesA = Math.floor(nextA + PHASE_EPSILON);
      for (let k = 1; k <= crossesA; k++) {
        crossings.push({
          timeSec: Math.min(dtSec, (k - prevA) / rateA),
          edgeIndex,
          voice: 'a',
          edge,
        });
      }
      runtime.aPhase = wrapPhase(nextA);

      const prevB = edge.dropletProgress;
      const nextB = prevB + dtSec * rateB;
      const crossesB = Math.floor(nextB + PHASE_EPSILON);
      for (let k = 1; k <= crossesB; k++) {
        crossings.push({
          timeSec: Math.min(dtSec, (k - prevB) / rateB),
          edgeIndex,
          voice: 'b',
          edge,
        });
      }
      edge.dropletProgress = wrapPhase(nextB);
    }

    crossings.sort((lhs, rhs) => {
      const dt = lhs.timeSec - rhs.timeSec;
      if (Math.abs(dt) > PHASE_EPSILON) {
        return dt;
      }
      if (lhs.edgeIndex !== rhs.edgeIndex) {
        return lhs.edgeIndex - rhs.edgeIndex;
      }
      return lhs.voice === rhs.voice ? 0 : lhs.voice === 'a' ? -1 : 1;
    });

    const events: DistillationTickEvent[] = [];

    for (const cross of crossings) {
      const runtime = this.edgeRuntime.get(cross.edge.id)!;
      const noteOffset = cross.edgeIndex % DORIAN_LYDIAN_MIDI_NOTES.length;

      if (cross.voice === 'a') {
        const patternIdx = VOICE_A_PATTERN[runtime.aCount % VOICE_A_PATTERN.length];
        runtime.aCount += 1;
        const midiNote =
          DORIAN_LYDIAN_MIDI_NOTES[(patternIdx + noteOffset) % DORIAN_LYDIAN_MIDI_NOTES.length];
        events.push({
          type: 'cellar_drip',
          edgeId: cross.edge.id,
          ratio: cross.edge.ratio,
          midiNote,
        });
        continue;
      }

      const patternIdx = VOICE_B_PATTERN[runtime.bCount % VOICE_B_PATTERN.length];
      runtime.bCount += 1;
      const midiNote =
        DORIAN_LYDIAN_MIDI_NOTES[(patternIdx + noteOffset) % DORIAN_LYDIAN_MIDI_NOTES.length];

      const toNode = nodeById.get(cross.edge.toNodeId);
      const producedItem = toNode
        ? this.tryProduceAlongEdge(
            cross.edge,
            toNode,
            outgoingCountByNode.get(toNode.id) ?? 0,
            nodeById,
            consumeBotanical
          )
        : undefined;

      events.push({
        type: 'cellar_drip',
        edgeId: cross.edge.id,
        ratio: cross.edge.ratio,
        midiNote,
        ...(producedItem ? { producedItem } : {}),
      });
    }

    return events;
  }

  consumeRefined(
    kind: 'cellar_quintessence' | 'catalyst_salt',
    reagentId: ReagentId
  ): boolean {
    const bucket =
      kind === 'cellar_quintessence' ? this.graph.quintessences : this.graph.catalystSalts;
    const current = bucket[reagentId] ?? 0;
    if (current < 1) {
      return false;
    }
    bucket[reagentId] = current - 1;
    return true;
  }

  private tryProduceAlongEdge(
    edge: CellarPipeEdge,
    toNode: CellarNode,
    toOutgoingCount: number,
    nodeById: Map<string, CellarNode>,
    consumeBotanical?: (reagentId: ReagentId) => boolean
  ): DistillationTickEvent['producedItem'] {
    const kind = this.resolveProductionKind(toNode, toOutgoingCount);
    if (!kind) {
      return undefined;
    }

    const reagentId = this.resolveFlowReagent(edge.fromNodeId, toNode, nodeById);
    if (!reagentId) {
      return undefined;
    }

    if (consumeBotanical && !consumeBotanical(reagentId)) {
      return undefined;
    }

    const bucket =
      kind === 'cellar_quintessence' ? this.graph.quintessences : this.graph.catalystSalts;
    bucket[reagentId] = (bucket[reagentId] ?? 0) + 1;

    return {
      kind,
      reagentId,
      units: 1,
    };
  }

  private resolveProductionKind(
    toNode: CellarNode,
    toOutgoingCount: number
  ): 'cellar_quintessence' | 'catalyst_salt' | null {
    if (toNode.type === 'drip_alembic') {
      return 'catalyst_salt';
    }
    if (toNode.type === 'graham_condenser') {
      return 'cellar_quintessence';
    }
    if (toNode.type === 'copper_siphon') {
      return toOutgoingCount === 0 ? 'cellar_quintessence' : null;
    }
    return toOutgoingCount === 0 ? 'cellar_quintessence' : null;
  }

  private resolveFlowReagent(
    startNodeId: string,
    toNode: CellarNode,
    nodeById: Map<string, CellarNode>
  ): ReagentId | undefined {
    const queue: string[] = [startNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const node = nodeById.get(currentId);
      if (!node || !node.active) {
        continue;
      }
      if (node.inputReagent !== undefined) {
        return node.inputReagent;
      }

      for (const edge of this.graph.edges) {
        if (edge.toNodeId === currentId && !visited.has(edge.fromNodeId)) {
          queue.push(edge.fromNodeId);
        }
      }
    }

    return toNode.inputReagent;
  }

  private nextUniqueNodeId(): string {
    let candidate = '';
    do {
      this.nodeSeq += 1;
      candidate = `cellar-node-${this.nodeSeq}`;
    } while (this.graph.nodes.some((n) => n.id === candidate));
    return candidate;
  }

  private nextUniqueEdgeId(): string {
    let candidate = '';
    do {
      this.edgeSeq += 1;
      candidate = `cellar-edge-${this.edgeSeq}`;
    } while (this.graph.edges.some((e) => e.id === candidate));
    return candidate;
  }
}
