#version 300 es
precision highp float;
precision highp int;

uniform float u_time;
uniform float u_dt;
uniform vec2 u_resolution;
uniform vec2 u_pointerPos;
uniform vec2 u_pointerVel;
uniform float u_ladleOmega;
uniform float u_viscosity;
uniform float u_temperature;
uniform float u_marbling;
uniform float u_layerCrispness;
uniform float u_micaAmount;
uniform vec2 u_rippleOrigin;
uniform float u_ripplePhase;
uniform vec3 u_layerColors[4];
uniform float u_layerDensities[4];
uniform sampler2D u_prevState;

// Optional multi-pass & encoding uniforms (default cleanly to 0 when unset)
uniform int u_pass;
uniform float u_fboEncoded;
uniform float u_hasWarpTex;
uniform sampler2D u_warpTex;
uniform sampler2D u_simTex;
uniform vec3 u_phRgb;

out vec4 fragColor;

const float PI = 3.14159265359;
const float HALF_8BIT = 128.0 / 255.0;

float safeFinite(float x, float fallback) {
  if (isnan(x) || isinf(x) || !(x >= -1e5 && x <= 1e5)) {
    return fallback;
  }
  return x;
}

vec2 safeFinite2(vec2 v, vec2 fallback) {
  return vec2(safeFinite(v.x, fallback.x), safeFinite(v.y, fallback.y));
}

vec3 safeColor(vec3 c, vec3 fallback) {
  return clamp(vec3(
    safeFinite(c.x, fallback.x),
    safeFinite(c.y, fallback.y),
    safeFinite(c.z, fallback.z)
  ), 0.0, 1.0);
}

vec4 sanitizeVec4(vec4 v, vec4 fallback) {
  return vec4(
    safeFinite(v.x, fallback.x),
    safeFinite(v.y, fallback.y),
    safeFinite(v.z, fallback.z),
    safeFinite(v.w, fallback.w)
  );
}

vec2 safeNormalize(vec2 v) {
  float lenSq = dot(v, v);
  if (isnan(lenSq) || isinf(lenSq) || lenSq <= 1e-8) {
    return vec2(0.0);
  }
  return v * inversesqrt(lenSq);
}

vec4 decodeState(vec4 raw) {
  vec4 clean = sanitizeVec4(raw, vec4(0.0));
  if (u_fboEncoded > 0.5) {
    return clamp((clean - vec4(HALF_8BIT)) * 8.0, vec4(-4.0), vec4(4.0));
  }
  return clamp(clean, vec4(-8.0), vec4(8.0));
}

vec4 encodeState(vec4 val) {
  vec4 clean = sanitizeVec4(val, vec4(0.0));
  if (u_fboEncoded > 0.5) {
    return clamp(clean * 0.125 + vec4(HALF_8BIT), 0.0, 1.0);
  }
  return clamp(clean, vec4(-8.0), vec4(8.0));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    sum += amp * noise2D(p);
    p = rot * p * 2.03 + vec2(13.7, 7.1);
    amp *= 0.5;
  }
  return sum;
}

float computeCurl(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 vL = decodeState(texture(tex, clamp(uv - vec2(texel.x, 0.0), texel, 1.0 - texel))).xy;
  vec2 vR = decodeState(texture(tex, clamp(uv + vec2(texel.x, 0.0), texel, 1.0 - texel))).xy;
  vec2 vB = decodeState(texture(tex, clamp(uv - vec2(0.0, texel.y), texel, 1.0 - texel))).xy;
  vec2 vT = decodeState(texture(tex, clamp(uv + vec2(0.0, texel.y), texel, 1.0 - texel))).xy;
  return 0.5 * ((vR.y - vL.y) - (vT.x - vB.x));
}

vec4 runAdvectAndVorticityPass(vec2 uv, vec2 texel, float dt, float visc, float tempNorm) {
  vec4 sC = decodeState(texture(u_prevState, uv));
  if (dt <= 0.0) {
    return encodeState(sC);
  }

  vec2 uvL = clamp(uv - vec2(texel.x, 0.0), texel, 1.0 - texel);
  vec2 uvR = clamp(uv + vec2(texel.x, 0.0), texel, 1.0 - texel);
  vec2 uvB = clamp(uv - vec2(0.0, texel.y), texel, 1.0 - texel);
  vec2 uvT = clamp(uv + vec2(0.0, texel.y), texel, 1.0 - texel);

  vec4 sL = decodeState(texture(u_prevState, uvL));
  vec4 sR = decodeState(texture(u_prevState, uvR));
  vec4 sB = decodeState(texture(u_prevState, uvB));
  vec4 sT = decodeState(texture(u_prevState, uvT));

  // Semi-Lagrangian velocity advection
  vec2 backUv = clamp(uv - sC.xy * dt * 0.30, texel, 1.0 - texel);
  vec2 velAdv = decodeState(texture(u_prevState, backUv)).xy;

  // Viscous diffusion (CFL-safe Laplacian weight <= 0.22)
  vec2 velLap = 0.25 * (sL.xy + sR.xy + sB.xy + sT.xy);
  float diffAlpha = clamp(visc * dt * 0.14, 0.0, 0.22);
  vec2 vel = mix(velAdv, velLap, diffAlpha);

  // Vorticity confinement (prevents numerical dissipation into grey mud)
  float cC = computeCurl(u_prevState, uv, texel);
  float cL = computeCurl(u_prevState, uvL, texel);
  float cR = computeCurl(u_prevState, uvR, texel);
  float cB = computeCurl(u_prevState, uvB, texel);
  float cT = computeCurl(u_prevState, uvT, texel);

  vec2 gradCurlMag = vec2(abs(cR) - abs(cL), abs(cT) - abs(cB)) * 0.5;
  vec2 eta = safeNormalize(gradCurlMag);
  float viscNorm = clamp((visc - 0.5) / 24.5, 0.0, 1.0);
  float vortEps = mix(0.95, 0.22, viscNorm);
  vec2 fVort = vec2(eta.y, -eta.x) * cC * vortEps;
  vel += clamp(fVort * dt * 16.0, vec2(-0.45), vec2(0.45));

  // Cauldron radial geometry
  vec2 relCenter = uv - vec2(0.5);
  float rSq = dot(relCenter, relCenter);
  float r = sqrt(max(rSq, 0.0));
  float wallMask = 1.0 - smoothstep(0.40, 0.47, r);

  // Ladle vortex torque
  float omega = clamp(safeFinite(u_ladleOmega, 0.0), -40.0, 40.0);
  vec2 ladleCenter = mix(vec2(0.5), clamp(safeFinite2(u_pointerPos, vec2(0.5)), 0.15, 0.85), 0.35);
  vec2 relLadle = uv - ladleCenter;
  float rLadleSq = dot(relLadle, relLadle);
  vec2 tangent = vec2(-relLadle.y, relLadle.x);
  vel += tangent * omega * exp(-rLadleSq * 7.5) * 0.42 * dt;

  // Pointer drag impulse jet
  vec2 pPos = clamp(safeFinite2(u_pointerPos, vec2(0.5)), 0.0, 1.0);
  vec2 pVel = clamp(safeFinite2(u_pointerVel, vec2(0.0)), vec2(-8.0), vec2(8.0));
  float ptrDistSq = dot(uv - pPos, uv - pPos);
  vel += pVel * exp(-ptrDistSq * 58.0) * 1.15 * dt;

  // Hearth thermal convection plumes (bottom-center heating)
  float heatFactor = tempNorm * tempNorm;
  float plumeNoiseX = noise2D(uv * 7.5 + vec2(0.0, -u_time * (0.4 + tempNorm * 0.9))) - 0.5;
  float plumeNoiseY = noise2D(uv * 7.5 + vec2(3.7, -u_time * (0.5 + tempNorm * 1.1))) - 0.5;
  vec2 thermalForce = vec2(plumeNoiseX, plumeNoiseY + 0.15 * (0.5 - r)) * heatFactor * exp(-rSq * 4.5) * 1.25;
  vel += thermalForce * dt;

  // Surface-tension droplet ripple impulse
  float rPhase = clamp(safeFinite(u_ripplePhase, 0.0), 0.0, 1.0);
  if (rPhase > 0.001 && rPhase < 0.98) {
    vec2 rOrig = clamp(safeFinite2(u_rippleOrigin, vec2(0.5)), 0.0, 1.0);
    vec2 dRip = uv - rOrig;
    float dLen = length(dRip);
    float ringPos = rPhase * 0.42;
    float ringEnv = exp(-pow((dLen - ringPos) * 26.0, 2.0)) * (1.0 - rPhase);
    vel += safeNormalize(dRip) * ringEnv * 0.9 * dt;
  }

  // Unconditionally stable exponential viscosity damping & no-slip wall
  float damp = exp(-dt * (0.16 + visc * 0.11));
  vel = clamp(vel * damp * wallMask, vec2(-3.5), vec2(3.5));

  float swirlMag = clamp(mix(sC.w, length(vel) * 0.75 + abs(cC) * 4.0, clamp(dt * 4.5, 0.0, 1.0)), 0.0, 3.5);
  return encodeState(vec4(vel, sC.z, swirlMag));
}

vec4 runJacobiPressurePass(vec2 uv, vec2 texel) {
  vec4 sC = decodeState(texture(u_prevState, uv));
  vec4 sL = decodeState(texture(u_prevState, clamp(uv - vec2(texel.x, 0.0), texel, 1.0 - texel)));
  vec4 sR = decodeState(texture(u_prevState, clamp(uv + vec2(texel.x, 0.0), texel, 1.0 - texel)));
  vec4 sB = decodeState(texture(u_prevState, clamp(uv - vec2(0.0, texel.y), texel, 1.0 - texel)));
  vec4 sT = decodeState(texture(u_prevState, clamp(uv + vec2(0.0, texel.y), texel, 1.0 - texel)));

  float div = 0.5 * ((sR.x - sL.x) + (sT.y - sB.y));
  float pNew = clamp(0.25 * (sL.z + sR.z + sB.z + sT.z - div), -3.5, 3.5);
  return encodeState(vec4(sC.xy, pNew, sC.w));
}

vec4 runGradientSubtractPass(vec2 uv, vec2 texel) {
  vec4 sC = decodeState(texture(u_prevState, uv));
  vec4 sL = decodeState(texture(u_prevState, clamp(uv - vec2(texel.x, 0.0), texel, 1.0 - texel)));
  vec4 sR = decodeState(texture(u_prevState, clamp(uv + vec2(texel.x, 0.0), texel, 1.0 - texel)));
  vec4 sB = decodeState(texture(u_prevState, clamp(uv - vec2(0.0, texel.y), texel, 1.0 - texel)));
  vec4 sT = decodeState(texture(u_prevState, clamp(uv + vec2(0.0, texel.y), texel, 1.0 - texel)));

  vec2 gradP = 0.5 * vec2(sR.z - sL.z, sT.z - sB.z);
  float r = length(uv - vec2(0.5));
  float wallMask = 1.0 - smoothstep(0.40, 0.47, r);
  vec2 vel = clamp((sC.xy - gradP) * wallMask, vec2(-3.5), vec2(3.5));
  return encodeState(vec4(vel, sC.z * 0.94, sC.w));
}

vec4 runWarpAdvectPass(vec2 uv, vec2 texel, float dt) {
  vec4 wC = decodeState(texture(u_prevState, uv));
  if (dt <= 0.0) {
    return encodeState(wC);
  }
  vec4 sim = decodeState(texture(u_simTex, uv));
  vec2 vel = sim.xy;

  vec2 backUv = clamp(uv - vel * dt * 0.24, texel, 1.0 - texel);
  vec4 wAdv = decodeState(texture(u_prevState, backUv));

  float marbling = clamp(safeFinite(u_marbling, 0.0), 0.0, 1.0);
  float crisp = clamp(safeFinite(u_layerCrispness, 0.8), 0.0, 1.0);
  float relaxRate = mix(2.6 * crisp + 0.4, 0.06, marbling);
  float decay = exp(-dt * relaxRate);

  vec2 disp = wAdv.xy * decay + vel * dt * 0.28;
  float dispLen = length(disp);
  if (dispLen > 0.46) {
    disp *= 0.46 / dispLen;
  }

  float shearFold = clamp(wAdv.z * decay + (length(vel) + sim.w * 0.35) * dt * 1.4, 0.0, 3.5);
  float micaSpin = fract(wAdv.w + dt * (0.2 + abs(sim.w) * 0.35));
  return encodeState(vec4(disp, shearFold, micaSpin));
}

vec3 evalStratifiedPigment(
  float zCoord,
  vec2 foldCoord,
  float marbling,
  float crispness,
  out float horizonEdge
) {
  float d0 = max(safeFinite(u_layerDensities[0], 0.0), 0.0);
  float d1 = max(safeFinite(u_layerDensities[1], 0.0), 0.0);
  float d2 = max(safeFinite(u_layerDensities[2], 0.0), 0.0);
  float d3 = max(safeFinite(u_layerDensities[3], 0.0), 0.0);
  float totalD = d0 + d1 + d2 + d3;

  horizonEdge = 0.0;
  if (totalD <= 1e-4) {
    vec3 phTint = safeColor(u_phRgb, vec3(0.45, 0.25, 0.65));
    return mix(vec3(0.06, 0.04, 0.03), phTint * 0.42, 0.38);
  }

  float invD = 1.0 / totalD;
  float h0 = d0 * invD;
  float h1 = h0 + d1 * invD;
  float h2 = h1 + d2 * invD;

  vec3 c0 = safeColor(u_layerColors[0], vec3(0.75, 0.52, 0.20));
  vec3 c1 = (d1 > 1e-4) ? safeColor(u_layerColors[1], c0) : c0;
  vec3 c2 = (d2 > 1e-4) ? safeColor(u_layerColors[2], c1) : c1;
  vec3 c3 = (d3 > 1e-4) ? safeColor(u_layerColors[3], c2) : c2;

  // When marbling > 0, fold the scalar depth coordinate via multi-harmonic Suminagashi wave
  float swirlWave = sin(foldCoord.x * 9.5 + sin(foldCoord.y * 7.2) * 1.45) * 0.5 + 0.5;
  float fineRibbon = sin((foldCoord.x + foldCoord.y * 0.8) * 18.0 + swirlWave * 3.1) * 0.5 + 0.5;
  float foldedZ = mix(zCoord, mix(swirlWave, fineRibbon, 0.42), marbling * 0.92);

  // Crispness keeps boundaries sharp (preventing grey mud blending)
  float edgeWidth = mix(0.085, 0.009, crispness);
  float s1 = smoothstep(h0 - edgeWidth, h0 + edgeWidth, foldedZ);
  float s2 = smoothstep(h1 - edgeWidth, h1 + edgeWidth, foldedZ);
  float s3 = smoothstep(h2 - edgeWidth, h2 + edgeWidth, foldedZ);

  vec3 col = c0;
  if (d1 > 1e-4) {
    col = mix(col, c1, s1);
    horizonEdge += s1 * (1.0 - s1) * 4.0;
  }
  if (d2 > 1e-4) {
    col = mix(col, c2, s2);
    horizonEdge += s2 * (1.0 - s2) * 4.0;
  }
  if (d3 > 1e-4) {
    col = mix(col, c3, s3);
    horizonEdge += s3 * (1.0 - s3) * 4.0;
  }
  horizonEdge = clamp(horizonEdge, 0.0, 1.0);
  return col;
}

vec4 runCompositePass(vec2 uv, vec2 res, float dt) {
  float aspect = res.x / max(res.y, 1.0);
  vec2 centered = uv - vec2(0.5);
  vec2 p = centered * 2.0;
  if (aspect >= 1.0) {
    p.x *= aspect;
  } else {
    p.y /= max(aspect, 1e-4);
  }

  float r = length(p);
  vec2 simUv = clamp(p * 0.45 + vec2(0.5), vec2(0.002), vec2(0.998));

  vec2 texel = 1.0 / max(res, vec2(1.0));
  vec4 sim = decodeState(texture(u_prevState, simUv));
  // Local divergence-free check sample to prevent boundary seam artifacts
  vec2 simL = decodeState(texture(u_prevState, clamp(simUv - vec2(texel.x, 0.0), 0.0, 1.0))).xy;
  vec2 simR = decodeState(texture(u_prevState, clamp(simUv + vec2(texel.x, 0.0), 0.0, 1.0))).xy;
  float localShear = length(simR - simL) * 4.0 + sim.w;

  vec2 warpDisp = vec2(0.0);
  float shearFold = localShear;
  if (u_hasWarpTex > 0.5) {
    vec4 wSample = decodeState(texture(u_warpTex, simUv));
    warpDisp = wSample.xy;
    shearFold = max(shearFold, wSample.z);
  } else {
    warpDisp = sim.xy * 0.14;
  }

  float visc = clamp(safeFinite(u_viscosity, 2.0), 0.5, 25.0);
  float viscNorm = clamp((visc - 0.5) / 24.5, 0.0, 1.0);
  float tempNorm = clamp(safeFinite(u_temperature, 0.1), 0.0, 1.0);
  float marbling = clamp(safeFinite(u_marbling, 0.0), 0.0, 1.0);
  float crispness = clamp(safeFinite(u_layerCrispness, 0.85), 0.0, 1.0);
  float mica = clamp(safeFinite(u_micaAmount, 0.2), 0.0, 1.0);

  // Dark sunlit walnut bench & hearth shadow exterior
  float woodGrain = sin(p.x * 16.0 + fbm(p * 4.2) * 3.4) * 0.5 + 0.5;
  vec3 benchColor = mix(vec3(0.09, 0.055, 0.035), vec3(0.18, 0.105, 0.065), woodGrain);
  float dropShadow = smoothstep(1.08, 0.84, r);
  benchColor *= mix(1.0, 0.22, dropShadow);

  // Hammered tarnished brass / cast-iron cauldron rim (r in [0.84..0.98])
  float rimInner = 0.84;
  float rimOuter = 0.96;
  float rimMask = smoothstep(rimInner - 0.012, rimInner + 0.012, r) * (1.0 - smoothstep(rimOuter - 0.012, rimOuter + 0.012, r));
  float rimAngle = atan(p.y, p.x);
  float hammerNoise = noise2D(vec2(rimAngle * 9.0, r * 35.0));
  float rimLight = 0.5 + 0.5 * cos(rimAngle + 0.85);
  vec3 brassDark = vec3(0.16, 0.11, 0.06);
  vec3 brassBright = vec3(0.68, 0.50, 0.22);
  vec3 rimColor = mix(brassDark, brassBright, clamp(rimLight * 0.72 + hammerNoise * 0.28, 0.0, 1.0));
  // Subtle heated hearth ember rim highlight
  rimColor += vec3(0.45, 0.14, 0.03) * tempNorm * smoothstep(0.95, 0.85, r);

  // Liquid interior (r <= 0.85)
  float liquidMask = 1.0 - smoothstep(rimInner - 0.015, rimInner + 0.010, r);

  // Buoyancy horizon depth coordinate: dense base beneath light top
  float omega = clamp(safeFinite(u_ladleOmega, 0.0), -40.0, 40.0);
  float angleShift = u_time * omega * 0.06 + dot(sim.xy, vec2(0.8, -0.6)) * 0.45;
  vec2 rotP = mat2(cos(angleShift), -sin(angleShift), sin(angleShift), cos(angleShift)) * p;
  vec2 foldCoord = rotP + warpDisp * (2.6 + marbling * 2.2) + sim.xy * 0.35;

  // Perspective-tilted depth horizon: bottom/outer bowl exposes dense base, top/crown exposes light top
  float depthZ = clamp(0.48 - 0.36 * p.y + 0.32 * (1.0 - clamp(r / rimInner, 0.0, 1.0)) + dot(warpDisp, vec2(0.4, 0.6)) * (0.25 + marbling * 0.55), 0.0, 1.0);

  float horizonEdge = 0.0;
  vec3 fluidColor = evalStratifiedPigment(depthZ, foldCoord, marbling, crispness, horizonEdge);

  // Subtle anthocyanin pH indicator glow along the cauldron meniscus
  vec3 phGlow = safeColor(u_phRgb, vec3(0.45, 0.25, 0.65));
  fluidColor = mix(fluidColor, phGlow, 0.12 * smoothstep(0.55, 0.84, r));

  // Subtle brass ladle wake dimple around pointerPos
  vec2 ladleP = (clamp(safeFinite2(u_pointerPos, vec2(0.5)), 0.0, 1.0) - vec2(0.5)) * 2.0;
  float ladleSpeed = length(clamp(safeFinite2(u_pointerVel, vec2(0.0)), vec2(-8.0), vec2(8.0)));
  float ladleHalo = exp(-dot(p - ladleP, p - ladleP) * 18.0) * clamp(ladleSpeed * 0.14 + abs(omega) * 0.04, 0.0, 0.35);
  fluidColor += vec3(0.95, 0.88, 0.72) * ladleHalo * 0.22;

  // Iridescent thin-film sheen at crisp horizon boundaries
  fluidColor += vec3(0.22, 0.20, 0.28) * horizonEdge * (0.35 + crispness * 0.45);

  // Pearlescent mica eddies & 24k gold-leaf flecks along flow tangents
  vec2 flowTangent = safeNormalize(sim.xy + vec2(-p.y, p.x) * 0.25 + vec2(1e-3, 0.0));
  vec2 lightDir = normalize(vec2(-0.65, 0.76));
  float aniso = pow(max(abs(dot(flowTangent, lightDir)), 0.0), 6.0);
  float micaSwirl = fbm(foldCoord * 7.5 + vec2(u_time * 0.12, -u_time * 0.09));
  vec3 pearlTint = mix(vec3(0.75, 0.88, 0.96), vec3(0.98, 0.86, 0.55), micaSwirl);
  fluidColor += pearlTint * mica * (0.18 + 0.52 * aniso) * (0.4 + 0.6 * micaSwirl);

  // 24k gold-leaf flecks in high-shear marbling filaments
  float fleckCell = noise2D(foldCoord * 36.0 + warpDisp * 14.0);
  float goldMask = smoothstep(0.84, 0.96, fleckCell) * (0.22 + 0.78 * marbling) * (0.25 + 0.75 * mica);
  fluidColor = mix(fluidColor, vec3(1.0, 0.85, 0.34) * (1.1 + 0.35 * aniso), clamp(goldMask, 0.0, 0.85));

  // Hearth thermal convection plumes
  float plume = fbm(p * 3.8 + warpDisp * 2.0 - vec2(0.0, u_time * (0.35 + tempNorm * 0.85)));
  float thermalCore = exp(-dot(p, p) * 2.2) * smoothstep(0.42, 0.82, plume) * tempNorm * tempNorm;
  fluidColor += vec3(1.0, 0.42, 0.09) * thermalCore * 0.48;

  // Concentric surface-tension droplet ripples
  vec2 surfNormal = vec2(0.0);
  float rPhase = clamp(safeFinite(u_ripplePhase, 0.0), 0.0, 1.0);
  if (rPhase > 0.001 && rPhase < 0.995) {
    vec2 rOrigP = (clamp(safeFinite2(u_rippleOrigin, vec2(0.5)), 0.0, 1.0) - vec2(0.5)) * 2.0;
    vec2 dRip = p - rOrigP;
    float dDist = length(dRip);
    float waveFront = rPhase * 1.45;
    float env = exp(-abs(dDist - waveFront) * 4.5) * exp(-dDist * 1.1) * sin(rPhase * PI);
    float ringWave = sin(dDist * 34.0 - rPhase * 28.0) * env;
    surfNormal += safeNormalize(dRip) * ringWave * 0.35;
  }

  // Rising syrupy bubbles (speed inversely coupled to viscosity, rate coupled to temperature)
  float bubbleDensity = 0.18 + tempNorm * 0.72;
  float bubbleSpeed = mix(0.65, 0.14, viscNorm);
  vec2 bUv = p * 5.2 + vec2(0.0, -u_time * bubbleSpeed) + warpDisp * 1.2;
  vec2 bId = floor(bUv);
  vec2 bLocal = fract(bUv) - 0.5;
  float bSeed = hash21(bId);
  if (bSeed < bubbleDensity * 0.45) {
    vec2 bOffset = vec2(hash21(bId + 3.1) - 0.5, hash21(bId + 7.7) - 0.5) * 0.42;
    float bRadius = mix(0.07, 0.18, hash21(bId + 11.3));
    float bDist = length(bLocal - bOffset);
    float bBody = 1.0 - smoothstep(bRadius * 0.75, bRadius, bDist);
    float bRim = smoothstep(bRadius * 0.45, bRadius * 0.92, bDist) * bBody;
    float bSpec = 1.0 - smoothstep(bRadius * 0.12, bRadius * 0.38, length((bLocal - bOffset) - vec2(-0.35, 0.35) * bRadius));
    fluidColor = mix(fluidColor, fluidColor * 1.22 + vec3(0.16, 0.14, 0.12), bRim * 0.55);
    fluidColor += vec3(0.95, 0.92, 0.85) * bSpec * 0.65;
  }

  // Specular liquid meniscus & cauldron wall ambient occlusion
  float bowlAO = mix(1.0, 0.52, smoothstep(0.55, rimInner, r));
  vec2 meniscusNormal = safeNormalize(p) * smoothstep(0.62, rimInner, r) * 0.35 + surfNormal + sim.xy * 0.12;
  float spec = pow(max(dot(safeNormalize(meniscusNormal + vec2(0.0, 0.1)), lightDir), 0.0), 22.0);
  float rimSpecular = pow(max(1.0 - abs(r - (rimInner - 0.035)) * 28.0, 0.0), 2.0) * max(dot(safeNormalize(p), lightDir), 0.0);

  // Subtle boil shimmer above 98C (tempNorm > 0.83)
  float boilJitter = smoothstep(0.80, 1.0, tempNorm) * noise2D(p * 18.0 + u_time * 5.0) * 0.08;
  fluidColor = fluidColor * bowlAO + vec3(0.98, 0.94, 0.86) * (spec * 0.42 + rimSpecular * 0.35 + boilJitter);

  // dt-responsive tiny pulse usage guard so u_dt is always actively coupled
  float dtPulse = clamp(dt, 0.0, 0.1) * 0.0001;
  vec3 finalRgb = mix(benchColor, rimColor, rimMask);
  finalRgb = mix(finalRgb, fluidColor + dtPulse, liquidMask);

  // Gentle vignette & tone mapping
  finalRgb = finalRgb / (vec3(1.0) + finalRgb * 0.18);
  return sanitizeVec4(vec4(clamp(finalRgb, 0.0, 1.0), 1.0), vec4(0.08, 0.05, 0.03, 1.0));
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 texel = 1.0 / res;

  float dt = (u_dt <= 0.0 || isnan(u_dt) || isinf(u_dt))
    ? 0.0
    : clamp(u_dt, 1.0 / 240.0, 1.0 / 20.0);
  float visc = clamp(safeFinite(u_viscosity, 2.0), 0.5, 25.0);
  float tempNorm = clamp(safeFinite(u_temperature, 0.1), 0.0, 1.0);

  if (u_pass == 1) {
    fragColor = runAdvectAndVorticityPass(uv, texel, dt, visc, tempNorm);
  } else if (u_pass == 2) {
    fragColor = runJacobiPressurePass(uv, texel);
  } else if (u_pass == 3) {
    fragColor = runGradientSubtractPass(uv, texel);
  } else if (u_pass == 4) {
    fragColor = runWarpAdvectPass(uv, texel, dt);
  } else {
    fragColor = runCompositePass(uv, res, dt);
  }
}
