import cauldronCoreGlsl from '../../shaders/cauldron_core.glsl';
import glassCausticsGlsl from '../../shaders/glass_caustics.glsl';
import stainedGlassWeatherGlsl from '../../shaders/stained_glass_weather.glsl';
import {
  compileCheckHeadless,
  stepFluidSolverCpuRef,
  validateGlslShaderSource,
  type FluidCpuRefParams,
  type FluidCpuRefResult,
  type HeadlessCompileCheckResult,
} from './fluid_cpu_ref';

export {
  compileCheckHeadless,
  stepFluidSolverCpuRef,
  validateGlslShaderSource,
  type FluidCpuRefParams,
  type FluidCpuRefResult,
  type HeadlessCompileCheckResult,
};

export type PotionVessel = 'prism' | 'teardrop' | 'crescent' | 'carafe';

export type MarketRegime =
  | 'calm'
  | 'dragon_siege'
  | 'bumper_harvest'
  | 'glacial_snap'
  | 'starfall_conclave';

export type WaxColor = 'crimson' | 'verdigris' | 'gold' | 'indigo';

export interface CauldronShaderUniforms {
  u_time: number;
  u_dt: number; // clamped [1/240, 1/20]
  u_resolution: [number, number];
  u_pointerPos: [number, number];
  u_pointerVel: [number, number]; // clamped [-8, 8]
  u_ladleOmega: number;
  u_viscosity: number; // clamped [0.5, 25.0]
  u_temperature: number; // normalized [0..1] over [15C..115C]
  u_marbling: number; // [0..1]
  u_layerCrispness: number; // [0..1]
  u_micaAmount: number; // [0..1]
  u_rippleOrigin: [number, number];
  u_ripplePhase: number; // [0..1]
  u_layerColors: [number, number, number][]; // up to 4 RGB triplets
  u_layerDensities: number[]; // up to 4 normalized heights
}

export interface CauldronLayerVisual {
  colorRgb: [number, number, number];
  specificGravity: number;
  volumeFraction: number;
  micaIntensity: number;
  sharpness: number;
}

const MIN_DT = 1 / 240;
const MAX_DT = 1 / 20;
const SIM_FBO_RES = 256;
const JACOBI_ITERATIONS = 6;
const MAX_CANVAS_DIM = 1600;

const VESSEL_INDEX: Record<PotionVessel, number> = {
  prism: 0,
  teardrop: 1,
  crescent: 2,
  carafe: 3,
};

const REGIME_INDEX: Record<MarketRegime, number> = {
  calm: 0,
  dragon_siege: 1,
  bumper_harvest: 2,
  glacial_snap: 3,
  starfall_conclave: 4,
};

const WAX_COLOR_RGB: Record<WaxColor, [number, number, number]> = {
  crimson: [0.72, 0.11, 0.16],
  verdigris: [0.16, 0.56, 0.44],
  gold: [0.88, 0.68, 0.22],
  indigo: [0.18, 0.22, 0.58],
};

const FULLSCREEN_VERTEX_SRC = `#version 300 es
precision highp float;
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function finiteOr(v: number | undefined, fallback: number): number {
  return v !== undefined && Number.isFinite(v) ? v : fallback;
}

function sanitizeRgb(rgb: [number, number, number] | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!rgb) return fallback;
  return [
    clamp(finiteOr(rgb[0], fallback[0]), 0, 1),
    clamp(finiteOr(rgb[1], fallback[1]), 0, 1),
    clamp(finiteOr(rgb[2], fallback[2]), 0, 1),
  ];
}

function rgbToCss(rgb: [number, number, number], alpha = 1): string {
  const r = Math.round(clamp(rgb[0], 0, 1) * 255);
  const g = Math.round(clamp(rgb[1], 0, 1) * 255);
  const b = Math.round(clamp(rgb[2], 0, 1) * 255);
  return alpha >= 0.999 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

interface PackedLayerData {
  sortedLayers: CauldronLayerVisual[];
  colorsFlat: Float32Array; // 12 floats (4 * vec3)
  densitiesFlat: Float32Array; // 4 floats
  micaAmount: number;
}

function packLayerVisuals(layers: CauldronLayerVisual[]): PackedLayerData {
  const valid = (layers ?? [])
    .filter((l) => l && finiteOr(l.volumeFraction, 0) > 1e-6)
    .map((l) => ({
      colorRgb: sanitizeRgb(l.colorRgb, [0.75, 0.52, 0.2]),
      specificGravity: clamp(finiteOr(l.specificGravity, 1.0), 0.5, 2.5),
      volumeFraction: Math.max(finiteOr(l.volumeFraction, 0), 0),
      micaIntensity: clamp(finiteOr(l.micaIntensity, 0), 0, 1),
      sharpness: clamp(finiteOr(l.sharpness, 0.8), 0, 1),
    }));

  // Order bottom (highest specific gravity) to top (lowest specific gravity)
  valid.sort((a, b) => b.specificGravity - a.specificGravity);

  const totalVol = valid.reduce((acc, item) => acc + item.volumeFraction, 0);
  const normalized: CauldronLayerVisual[] =
    totalVol > 1e-6
      ? valid.map((item) => ({ ...item, volumeFraction: item.volumeFraction / totalVol }))
      : [];

  // Bucket into up to 4 bands without losing outer strata
  const bucketed: CauldronLayerVisual[] = [];
  if (normalized.length <= 4) {
    bucketed.push(...normalized);
  } else {
    for (let b = 0; b < 4; b++) {
      const start = Math.floor((b * normalized.length) / 4);
      const end = Math.floor(((b + 1) * normalized.length) / 4);
      let wSum = 0;
      let r = 0;
      let g = 0;
      let bl = 0;
      let sg = 0;
      let mica = 0;
      let sharp = 0;
      for (let i = start; i < end; i++) {
        const l = normalized[i];
        wSum += l.volumeFraction;
        r += l.colorRgb[0] * l.volumeFraction;
        g += l.colorRgb[1] * l.volumeFraction;
        bl += l.colorRgb[2] * l.volumeFraction;
        sg += l.specificGravity * l.volumeFraction;
        mica += l.micaIntensity * l.volumeFraction;
        sharp += l.sharpness * l.volumeFraction;
      }
      if (wSum > 1e-6) {
        bucketed.push({
          colorRgb: [r / wSum, g / wSum, bl / wSum],
          specificGravity: sg / wSum,
          volumeFraction: wSum,
          micaIntensity: mica / wSum,
          sharpness: sharp / wSum,
        });
      }
    }
  }

  const colorsFlat = new Float32Array(12);
  const densitiesFlat = new Float32Array(4);
  let micaWeighted = 0;

  for (let i = 0; i < 4; i++) {
    const layer = bucketed[i];
    if (layer) {
      colorsFlat[i * 3] = layer.colorRgb[0];
      colorsFlat[i * 3 + 1] = layer.colorRgb[1];
      colorsFlat[i * 3 + 2] = layer.colorRgb[2];
      densitiesFlat[i] = layer.volumeFraction;
      micaWeighted += layer.micaIntensity * layer.volumeFraction;
    }
  }

  return {
    sortedLayers: normalized,
    colorsFlat,
    densitiesFlat,
    micaAmount: clamp(micaWeighted, 0, 1),
  };
}

interface GlProgramBundle {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

interface GlFboTarget {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
}

interface GlPingPong {
  targets: [GlFboTarget, GlFboTarget];
  readIndex: number;
  size: number;
  isFloat: boolean;
}

function compileGlShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createGlProgramBundle(gl: WebGL2RenderingContext, fragSource: string): GlProgramBundle | null {
  const vs = compileGlShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX_SRC);
  if (!vs) return null;
  const fs = compileGlShader(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!fs) {
    gl.deleteShader(vs);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) {
    if (vao) gl.deleteVertexArray(vao);
    if (vbo) gl.deleteBuffer(vbo);
    gl.deleteProgram(program);
    return null;
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, 'a_pos');
  if (posLoc >= 0) {
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);

  return {
    program,
    vao,
    vbo,
    uniforms: new Map(),
  };
}

function getUniformLoc(
  gl: WebGL2RenderingContext,
  bundle: GlProgramBundle,
  name: string,
): WebGLUniformLocation | null {
  let loc = bundle.uniforms.get(name);
  if (loc === undefined) {
    loc = gl.getUniformLocation(bundle.program, name);
    bundle.uniforms.set(name, loc);
  }
  return loc;
}

function destroyGlBundle(gl: WebGL2RenderingContext, bundle: GlProgramBundle | null): void {
  if (!bundle) return;
  gl.deleteBuffer(bundle.vbo);
  gl.deleteVertexArray(bundle.vao);
  gl.deleteProgram(bundle.program);
}

function createFboTarget(
  gl: WebGL2RenderingContext,
  size: number,
  useFloat: boolean,
): GlFboTarget | null {
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!texture || !fbo) {
    if (texture) gl.deleteTexture(texture);
    if (fbo) gl.deleteFramebuffer(fbo);
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (useFloat) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    const zeroEncoded = new Uint8Array(size * size * 4);
    zeroEncoded.fill(128);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, zeroEncoded);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (!complete) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    return null;
  }

  return { texture, fbo };
}

function createPingPong(gl: WebGL2RenderingContext, size: number, preferFloat: boolean): GlPingPong | null {
  let isFloat = preferFloat;
  let t0 = createFboTarget(gl, size, isFloat);
  let t1 = t0 ? createFboTarget(gl, size, isFloat) : null;

  if ((!t0 || !t1) && isFloat) {
    if (t0) {
      gl.deleteFramebuffer(t0.fbo);
      gl.deleteTexture(t0.texture);
    }
    if (t1) {
      gl.deleteFramebuffer(t1.fbo);
      gl.deleteTexture(t1.texture);
    }
    isFloat = false;
    t0 = createFboTarget(gl, size, false);
    t1 = t0 ? createFboTarget(gl, size, false) : null;
  }

  if (!t0 || !t1) {
    if (t0) {
      gl.deleteFramebuffer(t0.fbo);
      gl.deleteTexture(t0.texture);
    }
    if (t1) {
      gl.deleteFramebuffer(t1.fbo);
      gl.deleteTexture(t1.texture);
    }
    return null;
  }

  return { targets: [t0, t1], readIndex: 0, size, isFloat };
}

function destroyPingPong(gl: WebGL2RenderingContext, pp: GlPingPong | null): void {
  if (!pp) return;
  for (const target of pp.targets) {
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.texture);
  }
}

function syncCanvasResolution(canvas: HTMLCanvasElement): [number, number] {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (cw > 0 && ch > 0) {
    const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, 2);
    let w = Math.round(cw * dpr);
    let h = Math.round(ch * dpr);
    const maxSide = Math.max(w, h);
    if (maxSide > MAX_CANVAS_DIM) {
      const scale = MAX_CANVAS_DIM / maxSide;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  } else {
    if (!canvas.width || canvas.width <= 0) canvas.width = 512;
    if (!canvas.height || canvas.height <= 0) canvas.height = 512;
  }
  return [canvas.width, canvas.height];
}

interface CauldronGlPipeline {
  gl: WebGL2RenderingContext;
  bundle: GlProgramBundle;
  sim: GlPingPong;
  warp: GlPingPong;
  lost: boolean;
}

interface SinglePassGlPipeline {
  gl: WebGL2RenderingContext;
  bundle: GlProgramBundle;
  lost: boolean;
}

export class ApothecaryRenderer {
  private readonly cauldronCanvas: HTMLCanvasElement;
  private readonly decantCanvas?: HTMLCanvasElement;
  private readonly windowCanvas?: HTMLCanvasElement;

  private backend: 'webgl2' | 'canvas2d' = 'canvas2d';
  private cauldronGl: CauldronGlPipeline | null = null;
  private decantGl: SinglePassGlPipeline | null = null;
  private windowGl: SinglePassGlPipeline | null = null;

  private cauldron2d: CanvasRenderingContext2D | null = null;
  private decant2d: CanvasRenderingContext2D | null = null;
  private window2d: CanvasRenderingContext2D | null = null;

  private readonly cleanupListeners: Array<() => void> = [];

  private rafId: number | null = null;
  private running = false;
  private disposed = false;
  private lastFrameMs: number | null = null;
  private simTimeSec = 0;
  private lastDtSec = 1 / 60;
  private lastMotionTimeSec = -10;

  // Cauldron simulation state
  private cauldronLayers: PackedLayerData = packLayerVisuals([]);
  private temperatureNorm = 0.05; // ~20C
  private viscosity = 2.0;
  private marbling = 0.0;
  private layerCrispness = 0.9;
  private phRgb: [number, number, number] = [0.45, 0.25, 0.65];

  private pointerPos: [number, number] = [0.5, 0.5];
  private pointerVel: [number, number] = [0, 0];
  private ladleOmega = 0;
  private rippleOrigin: [number, number] = [0.5, 0.5];
  private ripplePhase = 0;

  // Decant vessel state
  private decantVessel: PotionVessel = 'prism';
  private pourProgress = 0;
  private corked = false;
  private waxColor: WaxColor = 'crimson';
  private waxPoured = false;
  private waxStamped = false;
  private decantLayers: PackedLayerData = packLayerVisuals([]);

  // Shopfront window weather state
  private marketRegime: MarketRegime = 'calm';
  private sunAngle = 0.72;

  constructor(opts: {
    cauldronCanvas: HTMLCanvasElement;
    decantCanvas?: HTMLCanvasElement;
    windowCanvas?: HTMLCanvasElement;
  }) {
    this.cauldronCanvas = opts.cauldronCanvas;
    this.decantCanvas = opts.decantCanvas;
    this.windowCanvas = opts.windowCanvas;

    this.initCauldronBackend();
    if (this.decantCanvas) {
      this.initDecantBackend(this.decantCanvas);
    }
    if (this.windowCanvas) {
      this.initWindowBackend(this.windowCanvas);
    }
  }

  private attachContextLifecycle(
    canvas: HTMLCanvasElement,
    onLost: () => void,
    onRestored: () => void,
  ): void {
    const lostHandler = (ev: Event) => {
      ev.preventDefault();
      onLost();
    };
    const restoredHandler = () => {
      onRestored();
    };
    canvas.addEventListener?.('webglcontextlost', lostHandler);
    canvas.addEventListener?.('webglcontextrestored', restoredHandler);
    this.cleanupListeners.push(() => {
      canvas.removeEventListener?.('webglcontextlost', lostHandler);
      canvas.removeEventListener?.('webglcontextrestored', restoredHandler);
    });
  }

  private tryGetWebGL2(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      return gl ?? null;
    } catch {
      return null;
    }
  }

  private tryGet2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    try {
      return canvas.getContext('2d') ?? null;
    } catch {
      return null;
    }
  }

  private initCauldronBackend(): void {
    const gl = this.tryGetWebGL2(this.cauldronCanvas);
    if (gl) {
      const bundle = createGlProgramBundle(gl, cauldronCoreGlsl);
      const preferFloat = Boolean(
        gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'),
      );
      const sim = bundle ? createPingPong(gl, SIM_FBO_RES, preferFloat) : null;
      const warp = bundle && sim ? createPingPong(gl, SIM_FBO_RES, preferFloat) : null;

      if (bundle && sim && warp) {
        this.cauldronGl = { gl, bundle, sim, warp, lost: false };
        this.backend = 'webgl2';
        this.attachContextLifecycle(
          this.cauldronCanvas,
          () => {
            if (this.cauldronGl) this.cauldronGl.lost = true;
          },
          () => {
            this.disposeCauldronGl();
            this.initCauldronBackend();
          },
        );
        return;
      }

      destroyPingPong(gl, sim);
      destroyPingPong(gl, warp);
      destroyGlBundle(gl, bundle);
    }

    this.backend = 'canvas2d';
    this.cauldron2d = this.tryGet2d(this.cauldronCanvas);
  }

  private initSinglePassBackend(
    canvas: HTMLCanvasElement,
    fragSource: string,
    assignGl: (pipe: SinglePassGlPipeline | null) => void,
    assign2d: (ctx: CanvasRenderingContext2D | null) => void,
  ): void {
    if (this.backend === 'webgl2') {
      const gl = this.tryGetWebGL2(canvas);
      if (gl) {
        const bundle = createGlProgramBundle(gl, fragSource);
        if (bundle) {
          const pipe: SinglePassGlPipeline = { gl, bundle, lost: false };
          assignGl(pipe);
          this.attachContextLifecycle(
            canvas,
            () => {
              pipe.lost = true;
            },
            () => {
              destroyGlBundle(gl, pipe.bundle);
              assignGl(null);
              this.initSinglePassBackend(canvas, fragSource, assignGl, assign2d);
            },
          );
          return;
        }
      }
    }
    assignGl(null);
    assign2d(this.tryGet2d(canvas));
  }

  private initDecantBackend(canvas: HTMLCanvasElement): void {
    this.initSinglePassBackend(
      canvas,
      glassCausticsGlsl,
      (pipe) => {
        this.decantGl = pipe;
      },
      (ctx) => {
        this.decant2d = ctx;
      },
    );
  }

  private initWindowBackend(canvas: HTMLCanvasElement): void {
    this.initSinglePassBackend(
      canvas,
      stainedGlassWeatherGlsl,
      (pipe) => {
        this.windowGl = pipe;
      },
      (ctx) => {
        this.window2d = ctx;
      },
    );
  }

  getBackend(): 'webgl2' | 'canvas2d' {
    return this.backend;
  }

  updateCauldronState(state: {
    layers: CauldronLayerVisual[];
    temperatureC: number;
    viscosity: number;
    marblingIndex: number;
    layerCrispness: number;
    phRgb: [number, number, number];
  }): void {
    this.cauldronLayers = packLayerVisuals(state.layers);
    const tempC = clamp(finiteOr(state.temperatureC, 20), 15, 115);
    this.temperatureNorm = clamp((tempC - 15) / 100, 0, 1);
    this.viscosity = clamp(finiteOr(state.viscosity, 2.0), 0.5, 25.0);
    this.marbling = clamp(finiteOr(state.marblingIndex, 0), 0, 1);
    this.layerCrispness = clamp(finiteOr(state.layerCrispness, 0.9), 0, 1);
    this.phRgb = sanitizeRgb(state.phRgb, [0.45, 0.25, 0.65]);
  }

  setLadleMotion(nx: number, ny: number, vx: number, vy: number, omegaRadS: number): void {
    this.pointerPos = [clamp(finiteOr(nx, 0.5), 0, 1), clamp(finiteOr(ny, 0.5), 0, 1)];
    this.pointerVel = [clamp(finiteOr(vx, 0), -8, 8), clamp(finiteOr(vy, 0), -8, 8)];
    this.ladleOmega = clamp(finiteOr(omegaRadS, 0), -40, 40);
    this.lastMotionTimeSec = this.simTimeSec;
  }

  triggerDropletRipple(nx: number, ny: number): void {
    this.rippleOrigin = [clamp(finiteOr(nx, 0.5), 0, 1), clamp(finiteOr(ny, 0.5), 0, 1)];
    this.ripplePhase = 0.002;
  }

  updateDecantView(opts: {
    vessel: PotionVessel;
    pourProgress: number;
    corked: boolean;
    waxColor: WaxColor;
    waxPoured: boolean;
    waxStamped: boolean;
    layers: CauldronLayerVisual[];
  }): void {
    this.decantVessel = opts.vessel ?? 'prism';
    this.pourProgress = clamp(finiteOr(opts.pourProgress, 0), 0, 1);
    this.corked = Boolean(opts.corked);
    this.waxColor = opts.waxColor ?? 'crimson';
    this.waxPoured = Boolean(opts.waxPoured);
    this.waxStamped = Boolean(opts.waxStamped);
    this.decantLayers = packLayerVisuals(opts.layers);
  }

  updateWeather(regime: MarketRegime): void {
    this.marketRegime = regime ?? 'calm';
  }

  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    if (typeof requestAnimationFrame === 'function') {
      const tick = (nowMs: number) => {
        if (!this.running || this.disposed) return;
        this.renderFrame(nowMs);
        if (this.running && !this.disposed) {
          this.rafId = requestAnimationFrame(tick);
        }
      };
      this.rafId = requestAnimationFrame(tick);
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  renderFrame(nowMs: number): void {
    if (this.disposed) return;

    const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
    const rawDt = this.lastFrameMs === null ? 1 / 60 : (safeNow - this.lastFrameMs) / 1000;
    this.lastFrameMs = safeNow;
    const dt = clamp(Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1 / 60, MIN_DT, MAX_DT);

    this.lastDtSec = dt;
    this.simTimeSec += dt;

    if (this.ripplePhase > 0) {
      this.ripplePhase += dt * 1.15;
      if (this.ripplePhase >= 1) {
        this.ripplePhase = 0;
      }
    }

    // Gently damp ladle/pointer inertia after input stops
    if (this.simTimeSec - this.lastMotionTimeSec > 0.06) {
      const decay = Math.exp(-dt * 2.4);
      this.pointerVel = [this.pointerVel[0] * decay, this.pointerVel[1] * decay];
      this.ladleOmega *= decay;
    }

    // Slowly shift sun angle for gentle shopfront lighting evolution
    this.sunAngle = 0.68 + Math.sin(this.simTimeSec * 0.04) * 0.14;

    if (this.cauldronGl && !this.cauldronGl.lost) {
      this.renderCauldronWebGL2(this.cauldronGl);
    } else {
      this.renderCauldronCanvas2D();
    }

    if (this.decantCanvas) {
      if (this.decantGl && !this.decantGl.lost) {
        this.renderDecantWebGL2(this.decantGl, this.decantCanvas);
      } else {
        this.renderDecantCanvas2D(this.decantCanvas);
      }
    }

    if (this.windowCanvas) {
      if (this.windowGl && !this.windowGl.lost) {
        this.renderWindowWebGL2(this.windowGl, this.windowCanvas);
      } else {
        this.renderWindowCanvas2D(this.windowCanvas);
      }
    }
  }

  private renderCauldronWebGL2(pipe: CauldronGlPipeline): void {
    const { gl, bundle, sim, warp } = pipe;
    const [canvasW, canvasH] = syncCanvasResolution(this.cauldronCanvas);

    gl.useProgram(bundle.program);
    gl.bindVertexArray(bundle.vao);

    const set1f = (name: string, val: number) => {
      const loc = getUniformLoc(gl, bundle, name);
      if (loc) gl.uniform1f(loc, val);
    };
    const set1i = (name: string, val: number) => {
      const loc = getUniformLoc(gl, bundle, name);
      if (loc) gl.uniform1i(loc, val);
    };
    const set2f = (name: string, x: number, y: number) => {
      const loc = getUniformLoc(gl, bundle, name);
      if (loc) gl.uniform2f(loc, x, y);
    };
    const set3f = (name: string, rgb: [number, number, number]) => {
      const loc = getUniformLoc(gl, bundle, name);
      if (loc) gl.uniform3f(loc, rgb[0], rgb[1], rgb[2]);
    };

    set1f('u_time', this.simTimeSec);
    set1f('u_dt', this.lastDtSec);
    set2f('u_pointerPos', this.pointerPos[0], this.pointerPos[1]);
    set2f('u_pointerVel', this.pointerVel[0], this.pointerVel[1]);
    set1f('u_ladleOmega', this.ladleOmega);
    set1f('u_viscosity', this.viscosity);
    set1f('u_temperature', this.temperatureNorm);
    set1f('u_marbling', this.marbling);
    set1f('u_layerCrispness', this.layerCrispness);
    set1f('u_micaAmount', this.cauldronLayers.micaAmount);
    set2f('u_rippleOrigin', this.rippleOrigin[0], this.rippleOrigin[1]);
    set1f('u_ripplePhase', this.ripplePhase);
    set3f('u_phRgb', this.phRgb);
    set1f('u_fboEncoded', sim.isFloat ? 0.0 : 1.0);

    const colorsLoc = getUniformLoc(gl, bundle, 'u_layerColors[0]') ?? getUniformLoc(gl, bundle, 'u_layerColors');
    if (colorsLoc) gl.uniform3fv(colorsLoc, this.cauldronLayers.colorsFlat);
    const densLoc = getUniformLoc(gl, bundle, 'u_layerDensities[0]') ?? getUniformLoc(gl, bundle, 'u_layerDensities');
    if (densLoc) gl.uniform1fv(densLoc, this.cauldronLayers.densitiesFlat);

    const drawPingPongPass = (pp: GlPingPong, passId: number, extraTex?: WebGLTexture) => {
      const readTarget = pp.targets[pp.readIndex];
      const writeIndex = 1 - pp.readIndex;
      const writeTarget = pp.targets[writeIndex];

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.fbo);
      gl.viewport(0, 0, pp.size, pp.size);
      set2f('u_resolution', pp.size, pp.size);
      set1i('u_pass', passId);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTarget.texture);
      set1i('u_prevState', 0);

      if (extraTex) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, extraTex);
        set1i('u_simTex', 1);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      pp.readIndex = writeIndex;
    };

    // 1. Advect + Vorticity Confinement + Forces
    drawPingPongPass(sim, 1);

    // 2. Divergence-Free Jacobi Pressure Projection
    for (let i = 0; i < JACOBI_ITERATIONS; i++) {
      drawPingPongPass(sim, 2);
    }

    // 3. Pressure Gradient Subtraction
    drawPingPongPass(sim, 3);

    // 4. Advect Suminagashi Reference Warp Field
    drawPingPongPass(warp, 4, sim.targets[sim.readIndex].texture);

    // 5. Final Composite Pass to Canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);
    set2f('u_resolution', canvasW, canvasH);
    set1i('u_pass', 0);
    set1f('u_hasWarpTex', 1.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sim.targets[sim.readIndex].texture);
    set1i('u_prevState', 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, warp.targets[warp.readIndex].texture);
    set1i('u_warpTex', 1);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private renderDecantWebGL2(pipe: SinglePassGlPipeline, canvas: HTMLCanvasElement): void {
    const { gl, bundle } = pipe;
    const [w, h] = syncCanvasResolution(canvas);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(bundle.program);
    gl.bindVertexArray(bundle.vao);

    const set1f = (name: string, val: number) => {
      const loc = getUniformLoc(gl, bundle, name);
      if (loc) gl.uniform1f(loc, val);
    };
    const set1i = (name: string, val: number) => {
      const loc = getUniformLoc(gl, bundle, name);
      if (loc) gl.uniform1i(loc, val);
    };

    set1f('u_time', this.simTimeSec);
    const resLoc = getUniformLoc(gl, bundle, 'u_resolution');
    if (resLoc) gl.uniform2f(resLoc, w, h);

    set1i('u_vesselType', VESSEL_INDEX[this.decantVessel]);
    set1f('u_pourProgress', this.pourProgress);
    set1f('u_waxStamped', this.waxStamped ? 1.0 : 0.0);
    set1f('u_corked', this.corked ? 1.0 : 0.0);
    set1f('u_waxPoured', this.waxPoured ? 1.0 : 0.0);
    set1f('u_layerCrispness', this.layerCrispness);
    set1f('u_marbling', this.marbling);

    const waxRgb = WAX_COLOR_RGB[this.waxColor] ?? WAX_COLOR_RGB.crimson;
    const waxLoc = getUniformLoc(gl, bundle, 'u_waxColor');
    if (waxLoc) gl.uniform3f(waxLoc, waxRgb[0], waxRgb[1], waxRgb[2]);

    const colorsLoc = getUniformLoc(gl, bundle, 'u_layerColors[0]') ?? getUniformLoc(gl, bundle, 'u_layerColors');
    if (colorsLoc) gl.uniform3fv(colorsLoc, this.decantLayers.colorsFlat);
    const densLoc = getUniformLoc(gl, bundle, 'u_layerDensities[0]') ?? getUniformLoc(gl, bundle, 'u_layerDensities');
    if (densLoc) gl.uniform1fv(densLoc, this.decantLayers.densitiesFlat);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private renderWindowWebGL2(pipe: SinglePassGlPipeline, canvas: HTMLCanvasElement): void {
    const { gl, bundle } = pipe;
    const [w, h] = syncCanvasResolution(canvas);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(bundle.program);
    gl.bindVertexArray(bundle.vao);

    const timeLoc = getUniformLoc(gl, bundle, 'u_time');
    if (timeLoc) gl.uniform1f(timeLoc, this.simTimeSec);
    const resLoc = getUniformLoc(gl, bundle, 'u_resolution');
    if (resLoc) gl.uniform2f(resLoc, w, h);
    const regLoc = getUniformLoc(gl, bundle, 'u_regimeIndex');
    if (regLoc) gl.uniform1i(regLoc, REGIME_INDEX[this.marketRegime]);
    const sunLoc = getUniformLoc(gl, bundle, 'u_sunAngle');
    if (sunLoc) gl.uniform1f(sunLoc, this.sunAngle);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------------------
  // High-Craft Canvas2D Fallback Renderers (headless / WebGL2-disabled contexts)
  // ---------------------------------------------------------------------------

  private renderCauldronCanvas2D(): void {
    const [w, h] = syncCanvasResolution(this.cauldronCanvas);
    if (!this.cauldron2d) {
      this.cauldron2d = this.tryGet2d(this.cauldronCanvas);
    }
    const ctx = this.cauldron2d;
    if (!ctx) return;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const rimRadius = Math.min(w, h) * 0.44;
    const liquidRadius = rimRadius * 0.89;

    // Walnut bench surround & cauldron shadow
    ctx.fillStyle = '#180f0a';
    ctx.fillRect(0, 0, w, h);
    const shadowGrad = ctx.createRadialGradient(cx, cy, liquidRadius * 0.7, cx, cy, rimRadius * 1.25);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    shadowGrad.addColorStop(1, 'rgba(24, 15, 10, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, rimRadius * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // Tarnished brass rim
    const brassGrad = ctx.createLinearGradient(cx - rimRadius, cy - rimRadius, cx + rimRadius, cy + rimRadius);
    brassGrad.addColorStop(0, '#ae823b');
    brassGrad.addColorStop(0.5, '#593d18');
    brassGrad.addColorStop(1, '#291c0c');
    ctx.fillStyle = brassGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, rimRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, liquidRadius, 0, Math.PI * 2);
    ctx.clip();

    const layers = this.cauldronLayers.sortedLayers;
    if (layers.length === 0) {
      const baseGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, liquidRadius);
      baseGrad.addColorStop(0, rgbToCss(this.phRgb, 0.42));
      baseGrad.addColorStop(1, '#120b08');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(cx - liquidRadius, cy - liquidRadius, liquidRadius * 2, liquidRadius * 2);
    } else {
      // Bottom-to-top specific gravity strata
      ctx.fillStyle = rgbToCss(layers[0].colorRgb);
      ctx.fillRect(cx - liquidRadius, cy - liquidRadius, liquidRadius * 2, liquidRadius * 2);

      let accumY = 0;
      const swirlPhase = this.simTimeSec * (0.45 + this.ladleOmega * 0.25);
      for (let i = 1; i < layers.length; i++) {
        accumY += layers[i - 1].volumeFraction;
        const horizonY = cy + liquidRadius * (0.68 - accumY * 1.36);
        const waveAmp = liquidRadius * (0.04 + this.marbling * 0.24);
        ctx.fillStyle = rgbToCss(layers[i].colorRgb, 0.92);
        ctx.beginPath();
        ctx.moveTo(cx - liquidRadius, cy - liquidRadius);
        ctx.lineTo(cx + liquidRadius, cy - liquidRadius);
        ctx.lineTo(cx + liquidRadius, horizonY);
        for (let step = 16; step >= 0; step--) {
          const t = step / 16;
          const px = cx - liquidRadius + t * liquidRadius * 2;
          const py =
            horizonY +
            Math.sin(t * Math.PI * (2 + this.marbling * 4) + swirlPhase + i * 1.1) * waveAmp;
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Suminagashi marbling ribbons & 24k gold-leaf flecks when stirred
      if (this.marbling > 0.05) {
        const ribbonCount = Math.min(layers.length * 3, 12);
        for (let rIdx = 0; rIdx < ribbonCount; rIdx++) {
          const layer = layers[rIdx % layers.length];
          const radiusFactor = 0.2 + (rIdx / ribbonCount) * 0.72;
          ctx.strokeStyle = rgbToCss(layer.colorRgb, 0.55 + this.layerCrispness * 0.35);
          ctx.lineWidth = Math.max(2, liquidRadius * 0.045 * (1.15 - this.layerCrispness * 0.4));
          ctx.beginPath();
          for (let a = 0; a <= 48; a++) {
            const theta = (a / 48) * Math.PI * 2;
            const fold =
              Math.sin(theta * 3 + swirlPhase + rIdx) * this.marbling * liquidRadius * 0.16 +
              Math.cos(theta * 5 - swirlPhase * 0.7) * this.marbling * liquidRadius * 0.07;
            const rad = liquidRadius * radiusFactor + fold;
            const rx = cx + Math.cos(theta) * rad;
            const ry = cy + Math.sin(theta) * rad;
            if (a === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          }
          ctx.stroke();
        }
      }

      // Pearlescent mica & 24k gold-leaf flecks
      if (this.cauldronLayers.micaAmount > 0.05) {
        const fleckCount = Math.round(12 + this.cauldronLayers.micaAmount * 22);
        ctx.fillStyle = 'rgba(255, 224, 118, 0.75)';
        for (let f = 0; f < fleckCount; f++) {
          const ang = f * 2.39996 + swirlPhase * 0.4;
          const dist = liquidRadius * (0.14 + ((f * 0.618) % 0.76));
          const fx = cx + Math.cos(ang) * dist;
          const fy = cy + Math.sin(ang) * dist;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.3 + (f % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Hearth thermal convection glow
    if (this.temperatureNorm > 0.15) {
      const ember = ctx.createRadialGradient(cx, cy, 2, cx, cy, liquidRadius * 0.72);
      ember.addColorStop(0, `rgba(255, 118, 30, ${(this.temperatureNorm * this.temperatureNorm * 0.34).toFixed(3)})`);
      ember.addColorStop(1, 'rgba(255, 118, 30, 0)');
      ctx.fillStyle = ember;
      ctx.fillRect(cx - liquidRadius, cy - liquidRadius, liquidRadius * 2, liquidRadius * 2);
    }

    // Rising syrupy bubbles
    const bubbleCount = Math.round(3 + this.temperatureNorm * 10);
    const viscSlow = 1 / (0.6 + this.viscosity * 0.25);
    for (let b = 0; b < bubbleCount; b++) {
      const phase = ((this.simTimeSec * viscSlow * 0.35 + b * 0.27) % 1 + 1) % 1;
      const bx = cx + Math.sin(b * 4.1 + this.simTimeSec * 0.4) * liquidRadius * 0.58;
      const by = cy + liquidRadius * (0.55 - phase * 1.1);
      const br = Math.max(2, liquidRadius * (0.025 + (b % 3) * 0.012));
      ctx.strokeStyle = 'rgba(255, 244, 218, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Concentric surface-tension droplet ripples
    if (this.ripplePhase > 0) {
      const rx = w * this.rippleOrigin[0];
      const ry = h * this.rippleOrigin[1];
      const alpha = Math.sin(this.ripplePhase * Math.PI) * 0.65;
      for (let ring = 0; ring < 3; ring++) {
        const ringR = Math.max(2, (this.ripplePhase * 0.85 - ring * 0.09) * liquidRadius);
        if (ringR > 2) {
          ctx.strokeStyle = `rgba(255, 248, 232, ${(alpha * (1 - ring * 0.25)).toFixed(3)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(rx, ry, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Meniscus specular crescent
    ctx.strokeStyle = 'rgba(255, 245, 224, 0.32)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, liquidRadius - 3, Math.PI * 1.05, Math.PI * 1.65);
    ctx.stroke();

    ctx.restore();
  }

  private renderDecantCanvas2D(canvas: HTMLCanvasElement): void {
    const [w, h] = syncCanvasResolution(canvas);
    if (!this.decant2d) {
      this.decant2d = this.tryGet2d(canvas);
    }
    const ctx = this.decant2d;
    if (!ctx) return;

    const cx = w * 0.5;
    const cy = h * 0.56;
    const scale = Math.min(w, h) * 0.36;

    // Sunlit walnut tabletop & alcove
    const wallGrad = ctx.createLinearGradient(0, 0, w, h);
    wallGrad.addColorStop(0, '#2a180f');
    wallGrad.addColorStop(1, '#120a06');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, h);

    const tableY = h * 0.67;
    const walnutGrad = ctx.createLinearGradient(0, tableY, 0, h);
    walnutGrad.addColorStop(0, '#4f2f1a');
    walnutGrad.addColorStop(1, '#26140a');
    ctx.fillStyle = walnutGrad;
    ctx.fillRect(0, tableY, w, h - tableY);

    // Animated RGB spectral dispersion rainbow caustics on walnut desk
    const causticAlpha = 0.22 + this.pourProgress * 0.35;
    const cShift = Math.sin(this.simTimeSec * 1.6) * scale * 0.08;
    const cSpecs: Array<[number, string]> = [
      [-10, `rgba(255, 92, 64, ${causticAlpha.toFixed(3)})`],
      [0, `rgba(98, 255, 162, ${causticAlpha.toFixed(3)})`],
      [10, `rgba(92, 165, 255, ${causticAlpha.toFixed(3)})`],
    ];
    for (const [dx, color] of cSpecs) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx + scale * 0.68 + dx + cShift, tableY + (h - tableY) * 0.42, scale * 0.48, scale * 0.14, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crystal Vessel path
    const traceVesselPath = () => {
      ctx.beginPath();
      if (this.decantVessel === 'prism') {
        ctx.moveTo(cx - scale * 0.16, cy - scale * 0.72);
        ctx.lineTo(cx + scale * 0.16, cy - scale * 0.72);
        ctx.lineTo(cx + scale * 0.14, cy - scale * 0.42);
        ctx.lineTo(cx + scale * 0.56, cy + scale * 0.08);
        ctx.lineTo(cx + scale * 0.42, cy + scale * 0.68);
        ctx.lineTo(cx - scale * 0.42, cy + scale * 0.68);
        ctx.lineTo(cx - scale * 0.56, cy + scale * 0.08);
        ctx.lineTo(cx - scale * 0.14, cy - scale * 0.42);
      } else if (this.decantVessel === 'teardrop') {
        ctx.moveTo(cx - scale * 0.14, cy - scale * 0.72);
        ctx.lineTo(cx + scale * 0.14, cy - scale * 0.72);
        ctx.bezierCurveTo(cx + scale * 0.14, cy - scale * 0.3, cx + scale * 0.66, cy + scale * 0.15, cx + scale * 0.46, cy + scale * 0.68);
        ctx.lineTo(cx - scale * 0.46, cy + scale * 0.68);
        ctx.bezierCurveTo(cx - scale * 0.66, cy + scale * 0.15, cx - scale * 0.14, cy - scale * 0.3, cx - scale * 0.14, cy - scale * 0.72);
      } else if (this.decantVessel === 'crescent') {
        ctx.moveTo(cx - scale * 0.14, cy - scale * 0.72);
        ctx.lineTo(cx + scale * 0.14, cy - scale * 0.72);
        ctx.quadraticCurveTo(cx + scale * 0.52, cy - scale * 0.2, cx + scale * 0.25, cy + scale * 0.52);
        ctx.lineTo(cx + scale * 0.36, cy + scale * 0.68);
        ctx.lineTo(cx - scale * 0.36, cy + scale * 0.68);
        ctx.lineTo(cx - scale * 0.25, cy + scale * 0.52);
        ctx.quadraticCurveTo(cx - scale * 0.66, cy - scale * 0.05, cx - scale * 0.14, cy - scale * 0.72);
      } else {
        // carafe
        ctx.moveTo(cx - scale * 0.18, cy - scale * 0.72);
        ctx.lineTo(cx + scale * 0.18, cy - scale * 0.72);
        ctx.lineTo(cx + scale * 0.16, cy - scale * 0.36);
        ctx.bezierCurveTo(cx + scale * 0.68, cy - scale * 0.18, cx + scale * 0.68, cy + scale * 0.56, cx + scale * 0.45, cy + scale * 0.68);
        ctx.lineTo(cx - scale * 0.45, cy + scale * 0.68);
        ctx.bezierCurveTo(cx - scale * 0.68, cy + scale * 0.56, cx - scale * 0.68, cy - scale * 0.18, cx - scale * 0.16, cy - scale * 0.36);
      }
      ctx.closePath();
    };

    ctx.save();
    traceVesselPath();
    ctx.fillStyle = 'rgba(186, 224, 240, 0.14)';
    ctx.fill();
    ctx.clip();

    // Stratified liquid fill inside crystal
    if (this.pourProgress > 0.01) {
      const bottomY = cy + scale * 0.68;
      const topY = bottomY - scale * 1.12 * this.pourProgress;
      const layers = this.decantLayers.sortedLayers;
      if (layers.length === 0) {
        ctx.fillStyle = 'rgba(115, 168, 185, 0.85)';
        ctx.fillRect(cx - scale, topY, scale * 2, bottomY - topY);
      } else {
        let curBottom = bottomY;
        const fillH = bottomY - topY;
        for (const layer of layers) {
          const lh = fillH * layer.volumeFraction;
          ctx.fillStyle = rgbToCss(layer.colorRgb, 0.92);
          ctx.fillRect(cx - scale, curBottom - lh, scale * 2, lh + 1);
          curBottom -= lh;
        }
      }
    }
    ctx.restore();

    // Vessel crystal outline & specular highlight
    traceVesselPath();
    ctx.strokeStyle = 'rgba(224, 245, 255, 0.72)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Tarnished brass funnel & laminar pour stream
    if (this.pourProgress > 0.01 && this.pourProgress < 0.97) {
      const fillTopY = cy + scale * 0.68 - scale * 1.12 * this.pourProgress;
      const spoutY = cy - scale * 0.82;
      const streamColor = this.decantLayers.sortedLayers[0]?.colorRgb ?? [0.82, 0.58, 0.24];
      ctx.strokeStyle = rgbToCss(streamColor, 0.9);
      ctx.lineWidth = Math.max(3, scale * 0.045);
      ctx.beginPath();
      ctx.moveTo(cx, spoutY);
      ctx.lineTo(cx, fillTopY);
      ctx.stroke();

      ctx.fillStyle = '#a37b35';
      ctx.beginPath();
      ctx.moveTo(cx - scale * 0.34, cy - scale * 1.16);
      ctx.lineTo(cx + scale * 0.34, cy - scale * 1.16);
      ctx.lineTo(cx + scale * 0.05, spoutY);
      ctx.lineTo(cx - scale * 0.05, spoutY);
      ctx.closePath();
      ctx.fill();
    }

    // Cork stopper
    if (this.corked || this.waxPoured || this.waxStamped) {
      ctx.fillStyle = '#9c6e41';
      ctx.fillRect(cx - scale * 0.11, cy - scale * 0.84, scale * 0.22, scale * 0.16);
    }

    // Molten wax drip & embossed guild signet seal
    if (this.waxPoured || this.waxStamped) {
      const waxRgb = WAX_COLOR_RGB[this.waxColor] ?? WAX_COLOR_RGB.crimson;
      ctx.fillStyle = rgbToCss(waxRgb);
      ctx.beginPath();
      ctx.ellipse(cx, cy - scale * 0.71, scale * 0.2, scale * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - scale * 0.08, cy - scale * 0.72, scale * 0.06, scale * 0.32);
      ctx.fillRect(cx + scale * 0.05, cy - scale * 0.72, scale * 0.05, scale * 0.24);

      if (this.waxStamped) {
        const sealY = cy - scale * 0.32;
        ctx.beginPath();
        ctx.arc(cx, sealY, scale * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 240, 224, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, sealY, scale * 0.105, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private renderWindowCanvas2D(canvas: HTMLCanvasElement): void {
    const [w, h] = syncCanvasResolution(canvas);
    if (!this.window2d) {
      this.window2d = this.tryGet2d(canvas);
    }
    const ctx = this.window2d;
    if (!ctx) return;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (this.marketRegime === 'calm') {
      skyGrad.addColorStop(0, '#3870bd');
      skyGrad.addColorStop(1, '#f2b86b');
    } else if (this.marketRegime === 'dragon_siege') {
      skyGrad.addColorStop(0, '#3d170d');
      skyGrad.addColorStop(1, '#db5714');
    } else if (this.marketRegime === 'bumper_harvest') {
      skyGrad.addColorStop(0, '#1c2b40');
      skyGrad.addColorStop(1, '#52707a');
    } else if (this.marketRegime === 'glacial_snap') {
      skyGrad.addColorStop(0, '#294775');
      skyGrad.addColorStop(1, '#add6f0');
    } else {
      skyGrad.addColorStop(0, '#080817');
      skyGrad.addColorStop(1, '#20123b');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Regime-specific sky details
    if (this.marketRegime === 'dragon_siege') {
      ctx.fillStyle = 'rgba(255, 175, 45, 0.85)';
      for (let i = 0; i < 18; i++) {
        const ex = (((i * 0.17 + this.simTimeSec * 0.12) % 1) + 1) % 1 * w;
        const ey = (1 - (((i * 0.23 + this.simTimeSec * 0.28) % 1) + 1) % 1) * h;
        ctx.beginPath();
        ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.marketRegime === 'bumper_harvest') {
      ctx.strokeStyle = 'rgba(192, 220, 238, 0.55)';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 24; i++) {
        const rx = ((i * 37 + this.simTimeSec * 90) % (w + 40)) - 20;
        const ry = ((i * 53 + this.simTimeSec * 280) % (h + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 8, ry + 22);
        ctx.stroke();
      }
    } else if (this.marketRegime === 'glacial_snap') {
      ctx.strokeStyle = 'rgba(232, 246, 255, 0.65)';
      ctx.lineWidth = 2;
      for (const [fx, fy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const dirX = fx === 0 ? 1 : -1;
        const dirY = fy === 0 ? 1 : -1;
        for (let b = 0; b < 5; b++) {
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + dirX * (w * 0.18), fy + dirY * (b * h * 0.045));
          ctx.stroke();
        }
      }
    } else if (this.marketRegime === 'starfall_conclave') {
      const aurora = ctx.createLinearGradient(0, h * 0.12, w, h * 0.45);
      aurora.addColorStop(0, 'rgba(46, 224, 173, 0.42)');
      aurora.addColorStop(1, 'rgba(158, 66, 240, 0.35)');
      ctx.fillStyle = aurora;
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.28, w * 0.48, h * 0.12, Math.sin(this.simTimeSec * 0.4) * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Slanted stained-glass sunbeams
    ctx.fillStyle = 'rgba(255, 226, 158, 0.14)';
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.45, 0);
    ctx.lineTo(w * 0.82, h);
    ctx.lineTo(w * 0.48, h);
    ctx.closePath();
    ctx.fill();

    // Leaded diamond-quarry cames & mullions
    ctx.strokeStyle = '#120f0d';
    ctx.lineWidth = 2;
    const step = Math.max(28, Math.min(w, h) / 5);
    for (let x = -h; x < w + h; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h * 0.68, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + h * 0.68, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w * 0.5, h);
    ctx.moveTo(0, h * 0.44);
    ctx.lineTo(w, h * 0.44);
    ctx.stroke();
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  private disposeCauldronGl(): void {
    if (!this.cauldronGl) return;
    const { gl, bundle, sim, warp } = this.cauldronGl;
    destroyPingPong(gl, sim);
    destroyPingPong(gl, warp);
    destroyGlBundle(gl, bundle);
    this.cauldronGl = null;
  }

  private disposeSingleGl(pipe: SinglePassGlPipeline | null): null {
    if (!pipe) return null;
    destroyGlBundle(pipe.gl, pipe.bundle);
    return null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    for (const unsub of this.cleanupListeners) {
      unsub();
    }
    this.cleanupListeners.length = 0;

    this.disposeCauldronGl();
    this.decantGl = this.disposeSingleGl(this.decantGl);
    this.windowGl = this.disposeSingleGl(this.windowGl);
    this.cauldron2d = null;
    this.decant2d = null;
    this.window2d = null;
  }
}
