#version 300 es
precision highp float;
precision highp int;

uniform float u_time;
uniform vec2 u_resolution;
uniform int u_regimeIndex;
uniform float u_sunAngle;

out vec4 fragColor;

const float PI = 3.14159265359;

float safeFinite(float x, float fallback) {
  if (isnan(x) || isinf(x) || !(x >= -1e5 && x <= 1e5)) {
    return fallback;
  }
  return x;
}

vec4 sanitizeVec4(vec4 v, vec4 fallback) {
  return vec4(
    safeFinite(v.x, fallback.x),
    safeFinite(v.y, fallback.y),
    safeFinite(v.z, fallback.z),
    safeFinite(v.w, fallback.w)
  );
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise2D(p);
    p = p * 2.04 + vec2(11.3, 4.7);
    amp *= 0.5;
  }
  return sum;
}

vec3 renderSkyByRegime(vec2 uv, vec2 p, int regime, float sunAng) {
  vec2 sunDir = vec2(cos(sunAng), sin(sunAng));

  if (regime == 0) {
    // 0 = calm: Golden-hour cerulean sky with drifting fair-weather cirrus clouds
    vec3 horizon = vec3(0.95, 0.72, 0.42);
    vec3 zenith = vec3(0.22, 0.44, 0.74);
    vec3 sky = mix(horizon, zenith, clamp(uv.y * 1.15, 0.0, 1.0));
    float sunGlow = exp(-length(p - sunDir * 0.55) * 2.4);
    sky += vec3(1.0, 0.88, 0.58) * sunGlow * 0.65;
    float clouds = smoothstep(0.48, 0.78, fbm(vec2(uv.x * 3.5 - u_time * 0.025, uv.y * 5.0)));
    sky = mix(sky, vec3(0.99, 0.94, 0.84), clouds * 0.36);
    return sky;
  } else if (regime == 1) {
    // 1 = dragon_siege: Ember-ash & smoky amber sky with rising glowing cinders
    vec3 smokeBase = vec3(0.24, 0.09, 0.05);
    vec3 emberHorizon = vec3(0.86, 0.34, 0.08);
    float smokePlume = fbm(vec2(uv.x * 3.8 + u_time * 0.04, uv.y * 3.0 - u_time * 0.09));
    vec3 sky = mix(emberHorizon, smokeBase, clamp(uv.y * 0.85 + smokePlume * 0.55, 0.0, 1.0));
    float flare = 0.5 + 0.5 * sin(u_time * 2.3 + smokePlume * 5.0);
    sky += vec3(1.0, 0.44, 0.08) * flare * 0.25 * (1.0 - uv.y);

    // Rising glowing embers
    vec2 eUv = uv * vec2(18.0, 14.0) + vec2(-u_time * 0.7, -u_time * 1.9);
    vec2 eId = floor(eUv);
    vec2 eLoc = fract(eUv) - 0.5;
    if (hash21(eId) > 0.72) {
      vec2 jitter = vec2(hash21(eId + 2.1), hash21(eId + 5.7)) - 0.5;
      float d = length(eLoc - jitter * 0.4);
      float ember = 1.0 - smoothstep(0.02, 0.14, d);
      sky += vec3(1.0, 0.68, 0.18) * ember * 1.3;
    }
    return sky;
  } else if (regime == 2) {
    // 2 = bumper_harvest: Silver rain streaks & passing street silhouettes
    vec3 sky = mix(vec3(0.32, 0.44, 0.48), vec3(0.11, 0.17, 0.25), clamp(uv.y, 0.0, 1.0));
    // Passing merchant cart / umbrella silhouettes along lower sill
    float silX = fract(uv.x * 0.45 - u_time * 0.06);
    float silBody = smoothstep(0.18, 0.16, abs(silX - 0.5)) * (1.0 - smoothstep(0.12, 0.26, uv.y));
    float lanternGlow = exp(-length(vec2((silX - 0.56) * 6.0, (uv.y - 0.16) * 8.0)) * 2.6);
    sky = mix(sky, vec3(0.06, 0.08, 0.11), silBody * 0.75);
    sky += vec3(0.98, 0.74, 0.34) * lanternGlow * 0.48;

    // Diagonal silver rain streaks
    vec2 rainUv = vec2(uv.x * 26.0 + uv.y * 7.0, uv.y * 8.0 + u_time * 4.2);
    vec2 rId = floor(rainUv);
    vec2 rLoc = fract(rainUv) - 0.5;
    float streak = smoothstep(0.16, 0.0, abs(rLoc.x)) * smoothstep(0.48, 0.1, abs(rLoc.y)) * step(0.55, hash21(rId));
    sky += vec3(0.75, 0.86, 0.94) * streak * 0.52;
    return sky;
  } else if (regime == 3) {
    // 3 = glacial_snap: Pale winter twilight sky with corner frost-ferns
    vec3 sky = mix(vec3(0.68, 0.84, 0.94), vec3(0.16, 0.28, 0.46), clamp(uv.y * 1.1, 0.0, 1.0));
    // Dendritic corner frost-ferns creeping inward from window borders
    float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float fernAng = atan(uv.y - 0.5, uv.x - 0.5);
    float fernBranch = fbm(vec2(fernAng * 14.0, edgeDist * 28.0)) * 0.5 + fbm(uv * 24.0) * 0.5;
    float frostMask = smoothstep(0.32, 0.04, edgeDist + (fernBranch - 0.45) * 0.35);
    float crystalSparkle = smoothstep(0.78, 0.96, noise2D(uv * 55.0 + u_time * 0.3));
    sky = mix(sky, vec3(0.88, 0.95, 1.0), frostMask * 0.78);
    sky += vec3(0.95, 0.98, 1.0) * crystalSparkle * frostMask * 0.65;
    return sky;
  } else {
    // 4 = starfall_conclave: Midnight violet cosmos, aurora ribbons & shooting stars
    vec3 sky = mix(vec3(0.11, 0.07, 0.22), vec3(0.03, 0.03, 0.09), clamp(uv.y, 0.0, 1.0));

    // Undulating aurora ribbons
    float band1 = exp(-pow((uv.y - (0.68 + 0.09 * sin(uv.x * 5.2 + u_time * 0.55))) * 6.5, 2.0));
    float band2 = exp(-pow((uv.y - (0.56 + 0.11 * cos(uv.x * 4.1 - u_time * 0.42))) * 5.5, 2.0));
    float curtain = 0.5 + 0.5 * sin(uv.x * 18.0 + fbm(uv * 4.0 + u_time * 0.2) * 5.0);
    sky += vec3(0.18, 0.88, 0.68) * band1 * (0.4 + 0.6 * curtain) * 0.85;
    sky += vec3(0.62, 0.26, 0.94) * band2 * (0.4 + 0.6 * (1.0 - curtain)) * 0.72;

    // Twinkling stars & diagonal starfall streaks
    vec2 sId = floor(uv * 42.0);
    vec2 sLoc = fract(uv * 42.0) - 0.5;
    float sSeed = hash21(sId);
    if (sSeed > 0.89) {
      float twinkle = 0.55 + 0.45 * sin(u_time * 3.5 + sSeed * 40.0);
      sky += vec3(0.95, 0.92, 1.0) * (1.0 - smoothstep(0.02, 0.16, length(sLoc))) * twinkle;
    }
    float meteorPhase = fract(u_time * 0.28);
    vec2 meteorPos = vec2(mix(0.85, 0.15, meteorPhase), mix(0.88, 0.42, meteorPhase));
    vec2 md = uv - meteorPos;
    float trail = exp(-length(md * vec2(1.0, 6.0) + vec2(0.04, -0.04) * md.x) * 14.0) * sin(meteorPhase * PI);
    sky += vec3(0.96, 0.90, 1.0) * clamp(trail, 0.0, 1.0) * 1.1;
    return sky;
  }
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - vec2(0.5)) * 2.0;
  p.x *= aspect;

  float sunAng = safeFinite(u_sunAngle, 0.72);
  vec3 skyCol = renderSkyByRegime(uv, p, u_regimeIndex, sunAng);

  // Leaded diamond-quarry stained-glass lattice & jewel border medallions
  vec2 diamondUv = vec2(p.x + p.y * 0.68, p.x - p.y * 0.68) * 3.4;
  vec2 dCell = fract(diamondUv) - 0.5;
  float leadDist = min(abs(abs(dCell.x) - 0.5), abs(abs(dCell.y) - 0.5));
  float leadCames = 1.0 - smoothstep(0.018, 0.034, leadDist);

  // Outer arched gothic frame & border stained-glass jewel tints
  float archDist = max(abs(p.x) - aspect * 0.92, p.y - 0.88);
  float topArch = length(vec2(p.x / max(aspect, 0.5), max(p.y - 0.25, 0.0))) - 0.74;
  float isBorderPane = smoothstep(0.68, 0.74, abs(uv.x - 0.5) * 2.0) + smoothstep(0.75, 0.85, uv.y);
  isBorderPane = clamp(isBorderPane, 0.0, 1.0);

  vec2 paneId = floor(diamondUv);
  float paneRand = hash21(paneId);
  vec3 jewelTint = mix(
    vec3(0.96, 0.68, 0.24),
    mix(vec3(0.22, 0.72, 0.52), vec3(0.76, 0.22, 0.34), step(0.5, paneRand)),
    step(0.33, fract(paneRand * 3.7))
  );

  // Crown-glass ripples slightly distort the exterior view through each pane
  float glassWave = noise2D(uv * 12.0 + paneRand * 7.0) * 0.14;
  vec3 glassCol = mix(skyCol * (0.94 + glassWave), skyCol * jewelTint * 1.28, isBorderPane * 0.68);

  // Volumetric stained-glass sunbeams slanting across the window
  vec2 beamDir = normalize(vec2(cos(sunAng), -abs(sin(sunAng)) - 0.25));
  float beamCoord = dot(p, vec2(-beamDir.y, beamDir.x));
  float beamStripes = pow(max(sin(beamCoord * 9.0 + u_time * 0.25) * 0.5 + 0.5, 0.0), 2.5);
  float dustMotes = smoothstep(0.82, 0.96, noise2D(uv * 28.0 + vec2(u_time * 0.12, u_time * 0.08)));
  float beamIntensity = (u_regimeIndex == 0) ? 0.42 : ((u_regimeIndex == 1) ? 0.28 : 0.18);
  vec3 beamHue = (u_regimeIndex == 4) ? vec3(0.55, 0.85, 0.95) : mix(vec3(1.0, 0.86, 0.58), jewelTint, isBorderPane * 0.55);
  glassCol += beamHue * beamStripes * (beamIntensity + dustMotes * 0.22);

  // Dark tarnished lead cames & oak window mullions
  vec3 leadColor = vec3(0.06, 0.05, 0.045);
  float centralMullion = 1.0 - smoothstep(0.012, 0.022, abs(p.x));
  float transomBar = 1.0 - smoothstep(0.012, 0.022, abs(p.y - 0.12));
  float frameEdge = smoothstep(0.90, 0.96, max(abs(uv.x - 0.5) * 2.0, abs(uv.y - 0.5) * 2.0));
  float metalMask = clamp(max(leadCames, max(centralMullion, max(transomBar, frameEdge))), 0.0, 1.0);
  if (archDist > 0.08 || topArch > 0.28) {
    metalMask = max(metalMask, 0.88);
  }

  vec3 finalRgb = mix(glassCol, leadColor, metalMask);
  finalRgb = finalRgb / (vec3(1.0) + finalRgb * 0.12);
  fragColor = sanitizeVec4(vec4(clamp(finalRgb, 0.0, 1.0), 1.0), vec4(0.08, 0.07, 0.09, 1.0));
}
