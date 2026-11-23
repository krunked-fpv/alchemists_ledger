import cauldronCoreGlsl from '../../shaders/cauldron_core.glsl';
import glassCausticsGlsl from '../../shaders/glass_caustics.glsl';
import stainedGlassWeatherGlsl from '../../shaders/stained_glass_weather.glsl';

export interface FluidCpuRefParams {
  dt: number;
  pointerVel: [number, number];
  ladleOmega: number;
  viscosity: number;
  temperatureC: number;
  grid?: Float32Array;
}

export interface FluidCpuRefResult {
  maxVelocity: number;
  vorticityPeak: number;
  hasNaN: boolean;
  grid: Float32Array;
}

export interface HeadlessCompileCheckResult {
  cauldronShaderValid: boolean;
  causticsShaderValid: boolean;
  weatherShaderValid: boolean;
  uniformsVerified: string[];
}

const DEFAULT_GRID_N = 32;
const CHANNELS = 4; // [vx, vy, pressure, curl]
const MIN_DT = 0;
const MAX_DT = 1 / 20;
const MAX_VEL = 12.0;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function finiteOr(v: number | undefined, fallback: number): number {
  return v !== undefined && Number.isFinite(v) ? v : fallback;
}

function resolveGridDim(grid?: Float32Array): number {
  if (!grid || grid.length < 4 * 4 * CHANNELS) {
    return DEFAULT_GRID_N;
  }
  const n = Math.round(Math.sqrt(grid.length / CHANNELS));
  if (n >= 4 && n * n * CHANNELS === grid.length) {
    return n;
  }
  return DEFAULT_GRID_N;
}

/**
 * Deterministic CPU reference solver mirroring `shaders/cauldron_core.glsl`:
 * Semi-Lagrangian velocity advection, vorticity confinement, viscous damping,
 * and Jacobi pressure projection with strict NaN/Inf and extreme-parameter guards.
 */
export function stepFluidSolverCpuRef(params: FluidCpuRefParams): FluidCpuRefResult {
  const n = resolveGridDim(params.grid);
  const cellCount = n * n;
  const totalLen = cellCount * CHANNELS;

  const state = new Float32Array(totalLen);
  if (params.grid && params.grid.length === totalLen) {
    for (let i = 0; i < totalLen; i++) {
      state[i] = clamp(finiteOr(params.grid[i], 0), -MAX_VEL, MAX_VEL);
    }
  }

  const rawDt = finiteOr(params.dt, 0);
  const dt = clamp(rawDt, MIN_DT, MAX_DT);
  const ptrVx = clamp(finiteOr(params.pointerVel?.[0], 0), -8, 8);
  const ptrVy = clamp(finiteOr(params.pointerVel?.[1], 0), -8, 8);
  const omega = clamp(finiteOr(params.ladleOmega, 0), -60, 60);
  const viscosity = clamp(finiteOr(params.viscosity, 1.0), 0.5, 25.0);
  const tempNorm = clamp((finiteOr(params.temperatureC, 20) - 15) / 100, 0, 1);

  const vx = new Float32Array(cellCount);
  const vy = new Float32Array(cellCount);
  const pressure = new Float32Array(cellCount);
  const curl = new Float32Array(cellCount);

  for (let i = 0; i < cellCount; i++) {
    const base = i * CHANNELS;
    vx[i] = state[base];
    vy[i] = state[base + 1];
    pressure[i] = state[base + 2];
  }

  if (dt > 0) {
    const idx = (x: number, y: number): number => {
      const cx = x < 0 ? 0 : x >= n ? n - 1 : x;
      const cy = y < 0 ? 0 : y >= n ? n - 1 : y;
      return cy * n + cx;
    };

    // 1. External forces: ladle vortex, pointer jet, hearth thermal convection
    const heatFactor = tempNorm * tempNorm;
    for (let y = 0; y < n; y++) {
      const vNorm = (y + 0.5) / n;
      const dy = vNorm - 0.5;
      for (let x = 0; x < n; x++) {
        const uNorm = (x + 0.5) / n;
        const dx = uNorm - 0.5;
        const rSq = dx * dx + dy * dy;
        const r = Math.sqrt(rSq);
        if (r > 0.48) continue;

        const i = y * n + x;
        const swirlFalloff = Math.exp(-rSq * 7.5);
        const fxLadle = -dy * omega * swirlFalloff * 0.42;
        const fyLadle = dx * omega * swirlFalloff * 0.42;

        const ptrFalloff = Math.exp(-rSq * 42.0);
        const fxPtr = ptrVx * ptrFalloff * 1.15;
        const fyPtr = ptrVy * ptrFalloff * 1.15;

        const plume = Math.sin(uNorm * 12.0 + vNorm * 9.0) * 0.5;
        const fxHeat = plume * heatFactor * Math.exp(-rSq * 4.5) * 0.65;
        const fyHeat = (0.35 - r) * heatFactor * Math.exp(-rSq * 4.5) * 0.85;

        vx[i] = clamp(vx[i] + (fxLadle + fxPtr + fxHeat) * dt, -MAX_VEL, MAX_VEL);
        vy[i] = clamp(vy[i] + (fyLadle + fyPtr + fyHeat) * dt, -MAX_VEL, MAX_VEL);
      }
    }

    // 2. Vorticity confinement (prevents numerical dissipation into mud)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const dvydx = 0.5 * (vy[idx(x + 1, y)] - vy[idx(x - 1, y)]);
        const dvxdy = 0.5 * (vx[idx(x, y + 1)] - vx[idx(x, y - 1)]);
        curl[i] = (dvydx - dvxdy) * n;
      }
    }

    const viscNorm = (viscosity - 0.5) / 24.5;
    const vortEps = 0.95 + (0.22 - 0.95) * viscNorm;
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        const gx = 0.5 * (Math.abs(curl[idx(x + 1, y)]) - Math.abs(curl[idx(x - 1, y)]));
        const gy = 0.5 * (Math.abs(curl[idx(x, y + 1)]) - Math.abs(curl[idx(x, y - 1)]));
        const lenSq = gx * gx + gy * gy;
        if (lenSq > 1e-10) {
          const invLen = 1 / Math.sqrt(lenSq);
          const nx = gx * invLen;
          const ny = gy * invLen;
          const c = curl[i];
          vx[i] = clamp(vx[i] + ny * c * vortEps * dt * 0.25, -MAX_VEL, MAX_VEL);
          vy[i] = clamp(vy[i] - nx * c * vortEps * dt * 0.25, -MAX_VEL, MAX_VEL);
        }
      }
    }

    // 3. Semi-Lagrangian advection + CFL-safe viscous Laplacian & exponential damping
    const vxAdv = new Float32Array(cellCount);
    const vyAdv = new Float32Array(cellCount);
    const damp = Math.exp(-dt * (0.16 + viscosity * 0.11));
    const diffAlpha = clamp(viscosity * dt * 0.14, 0, 0.22);

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const backX = clamp(x - vx[i] * dt * n * 0.28, 0.5, n - 1.5);
        const backY = clamp(y - vy[i] * dt * n * 0.28, 0.5, n - 1.5);

        const x0 = Math.floor(backX);
        const y0 = Math.floor(backY);
        const x1 = Math.min(x0 + 1, n - 1);
        const y1 = Math.min(y0 + 1, n - 1);
        const tx = backX - x0;
        const ty = backY - y0;

        const i00 = y0 * n + x0;
        const i10 = y0 * n + x1;
        const i01 = y1 * n + x0;
        const i11 = y1 * n + x1;

        const avX =
          (vx[i00] * (1 - tx) + vx[i10] * tx) * (1 - ty) +
          (vx[i01] * (1 - tx) + vx[i11] * tx) * ty;
        const avY =
          (vy[i00] * (1 - tx) + vy[i10] * tx) * (1 - ty) +
          (vy[i01] * (1 - tx) + vy[i11] * tx) * ty;

        const lapX = 0.25 * (vx[idx(x - 1, y)] + vx[idx(x + 1, y)] + vx[idx(x, y - 1)] + vx[idx(x, y + 1)]);
        const lapY = 0.25 * (vy[idx(x - 1, y)] + vy[idx(x + 1, y)] + vy[idx(x, y - 1)] + vy[idx(x, y + 1)]);

        vxAdv[i] = clamp((avX * (1 - diffAlpha) + lapX * diffAlpha) * damp, -MAX_VEL, MAX_VEL);
        vyAdv[i] = clamp((avY * (1 - diffAlpha) + lapY * diffAlpha) * damp, -MAX_VEL, MAX_VEL);
      }
    }

    // 4. Divergence-free Jacobi pressure projection
    const div = new Float32Array(cellCount);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        div[i] = 0.5 * ((vxAdv[idx(x + 1, y)] - vxAdv[idx(x - 1, y)]) + (vyAdv[idx(x, y + 1)] - vyAdv[idx(x, y - 1)]));
      }
    }

    let pCur = pressure;
    let pNext = new Float32Array(cellCount);
    for (let iter = 0; iter < 8; iter++) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          pNext[i] = clamp(
            0.25 * (pCur[idx(x - 1, y)] + pCur[idx(x + 1, y)] + pCur[idx(x, y - 1)] + pCur[idx(x, y + 1)] - div[i]),
            -MAX_VEL,
            MAX_VEL,
          );
        }
      }
      const tmp = pCur;
      pCur = pNext;
      pNext = tmp;
    }

    for (let y = 0; y < n; y++) {
      const dy = (y + 0.5) / n - 0.5;
      for (let x = 0; x < n; x++) {
        const dx = (x + 0.5) / n - 0.5;
        const r = Math.hypot(dx, dy);
        const wall = r <= 0.42 ? 1 : r >= 0.48 ? 0 : 1 - (r - 0.42) / 0.06;
        const i = y * n + x;
        const gx = 0.5 * (pCur[idx(x + 1, y)] - pCur[idx(x - 1, y)]);
        const gy = 0.5 * (pCur[idx(x, y + 1)] - pCur[idx(x, y - 1)]);
        vx[i] = clamp((vxAdv[i] - gx) * wall, -MAX_VEL, MAX_VEL);
        vy[i] = clamp((vyAdv[i] - gy) * wall, -MAX_VEL, MAX_VEL);
        pressure[i] = pCur[i] * wall;
      }
    }
  }

  // Final curl, metrics & strict NaN check
  const outGrid = new Float32Array(totalLen);
  let maxVelocity = 0;
  let vorticityPeak = 0;
  let hasNaN = false;

  const idxClamp = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= n ? n - 1 : x;
    const cy = y < 0 ? 0 : y >= n ? n - 1 : y;
    return cy * n + cx;
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const u = vx[i];
      const v = vy[i];
      const p = pressure[i];
      const c =
        0.5 *
        ((vy[idxClamp(x + 1, y)] - vy[idxClamp(x - 1, y)]) -
          (vx[idxClamp(x, y + 1)] - vx[idxClamp(x, y - 1)])) *
        n;

      if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(p) || !Number.isFinite(c)) {
        hasNaN = true;
      } else {
        const speed = Math.hypot(u, v);
        if (speed > maxVelocity) maxVelocity = speed;
        const absC = Math.abs(c);
        if (absC > vorticityPeak) vorticityPeak = absC;
      }

      const base = i * CHANNELS;
      outGrid[base] = u;
      outGrid[base + 1] = v;
      outGrid[base + 2] = p;
      outGrid[base + 3] = c;
    }
  }

  return {
    maxVelocity,
    vorticityPeak,
    hasNaN,
    grid: outGrid,
  };
}

const REQUIRED_CAULDRON_UNIFORMS = [
  'u_time',
  'u_dt',
  'u_resolution',
  'u_pointerPos',
  'u_pointerVel',
  'u_ladleOmega',
  'u_viscosity',
  'u_temperature',
  'u_marbling',
  'u_layerCrispness',
  'u_micaAmount',
  'u_rippleOrigin',
  'u_ripplePhase',
  'u_layerColors',
  'u_layerDensities',
  'u_prevState',
] as const;

const REQUIRED_CAUSTICS_UNIFORMS = [
  'u_time',
  'u_resolution',
  'u_vesselType',
  'u_pourProgress',
  'u_waxStamped',
  'u_waxColor',
  'u_layerColors',
  'u_layerDensities',
] as const;

const REQUIRED_WEATHER_UNIFORMS = [
  'u_time',
  'u_resolution',
  'u_regimeIndex',
  'u_sunAngle',
] as const;

function stripGlslComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '');
}

function checkBalancedDelimiters(code: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === ')' || ch === '}' || ch === ']') {
      if (stack.length === 0 || stack.pop() !== pairs[ch]) {
        return false;
      }
    }
  }
  return stack.length === 0;
}

export function validateGlslShaderSource(
  source: string,
  requiredUniforms: readonly string[],
): { valid: boolean; verifiedUniforms: string[] } {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { valid: false, verifiedUniforms: [] };
  }

  const trimmed = source.trimStart();
  if (!trimmed.startsWith('#version 300 es')) {
    return { valid: false, verifiedUniforms: [] };
  }

  const stripped = stripGlslComments(source);
  if (!/precision\s+highp\s+float\s*;/.test(stripped)) {
    return { valid: false, verifiedUniforms: [] };
  }
  if (!checkBalancedDelimiters(stripped)) {
    return { valid: false, verifiedUniforms: [] };
  }
  if (!/\bout\s+vec4\s+\w+\s*;/.test(stripped) || !/\bvoid\s+main\s*\(\s*\)/.test(stripped)) {
    return { valid: false, verifiedUniforms: [] };
  }
  if (/\b(gl_FragColor|varying|attribute|texture2D)\b/.test(stripped)) {
    return { valid: false, verifiedUniforms: [] };
  }

  const verifiedUniforms: string[] = [];
  for (const uniformName of requiredUniforms) {
    const declRe = new RegExp(`\\buniform\\s+\\w+\\s+${uniformName}(?:\\s*\\[\\s*\\d+\\s*\\])?\\s*;`);
    if (!declRe.test(stripped)) {
      return { valid: false, verifiedUniforms: [] };
    }
    const usageMatches = stripped.match(new RegExp(`\\b${uniformName}\\b`, 'g'));
    if (!usageMatches || usageMatches.length < 2) {
      return { valid: false, verifiedUniforms: [] };
    }
    verifiedUniforms.push(uniformName);
  }

  return { valid: true, verifiedUniforms };
}

function tryHardwareWebGL2CompileCheck(sources: readonly string[]): boolean[] | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const gl = canvas.getContext('webgl2');
    if (!gl) return null;

    const vertSrc = `#version 300 es
precision highp float;
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return null;
    gl.shaderSource(vs, vertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      gl.deleteShader(vs);
      return null;
    }

    const results = sources.map((fragSrc) => {
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      const prog = gl.createProgram();
      if (!fs || !prog) {
        if (fs) gl.deleteShader(fs);
        if (prog) gl.deleteProgram(prog);
        return false;
      }
      gl.shaderSource(fs, fragSrc);
      gl.compileShader(fs);
      const fsOk = Boolean(gl.getShaderParameter(fs, gl.COMPILE_STATUS));
      let linkOk = false;
      if (fsOk) {
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        linkOk = Boolean(gl.getProgramParameter(prog, gl.LINK_STATUS));
      }
      gl.deleteProgram(prog);
      gl.deleteShader(fs);
      return fsOk && linkOk;
    });

    gl.deleteShader(vs);
    return results;
  } catch {
    return null;
  }
}

/**
 * Validates all 3 GLSL ES 3.00 shaders and their required uniform contracts.
 * Executes static GLSL ES 3.00 structural/uniform analysis in headless Node/Vitest,
 * plus live WebGL2 shader compilation and linking when a WebGL2 context is available.
 */
export function compileCheckHeadless(): HeadlessCompileCheckResult {
  const cauldronCheck = validateGlslShaderSource(cauldronCoreGlsl, REQUIRED_CAULDRON_UNIFORMS);
  const causticsCheck = validateGlslShaderSource(glassCausticsGlsl, REQUIRED_CAUSTICS_UNIFORMS);
  const weatherCheck = validateGlslShaderSource(stainedGlassWeatherGlsl, REQUIRED_WEATHER_UNIFORMS);

  let cauldronShaderValid = cauldronCheck.valid;
  let causticsShaderValid = causticsCheck.valid;
  let weatherShaderValid = weatherCheck.valid;

  const hwResults = tryHardwareWebGL2CompileCheck([
    cauldronCoreGlsl,
    glassCausticsGlsl,
    stainedGlassWeatherGlsl,
  ]);
  if (hwResults) {
    cauldronShaderValid = cauldronShaderValid && hwResults[0];
    causticsShaderValid = causticsShaderValid && hwResults[1];
    weatherShaderValid = weatherShaderValid && hwResults[2];
  }

  const uniformSet = new Set<string>([
    ...cauldronCheck.verifiedUniforms,
    ...causticsCheck.verifiedUniforms,
    ...weatherCheck.verifiedUniforms,
  ]);

  return {
    cauldronShaderValid,
    causticsShaderValid,
    weatherShaderValid,
    uniformsVerified: Array.from(uniformSet),
  };
}
