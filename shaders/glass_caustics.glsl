#version 300 es
precision highp float;
precision highp int;

uniform float u_time;
uniform vec2 u_resolution;
uniform int u_vesselType;
uniform float u_pourProgress;
uniform float u_waxStamped;
uniform vec3 u_waxColor;
uniform vec3 u_layerColors[4];
uniform float u_layerDensities[4];

// Optional decant state uniforms (default cleanly to 0 when unset)
uniform float u_corked;
uniform float u_waxPoured;
uniform float u_layerCrispness;
uniform float u_marbling;

out vec4 fragColor;

const float PI = 3.14159265359;

float safeFinite(float x, float fallback) {
  if (isnan(x) || isinf(x) || !(x >= -1e5 && x <= 1e5)) {
    return fallback;
  }
  return x;
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

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
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
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise2D(p);
    p = p * 2.02 + vec2(9.2, 5.4);
    a *= 0.5;
  }
  return s;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 1e-6);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba * h);
}

float sdOctagon(vec2 p, float r) {
  const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623);
  p = abs(p);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdVesselBody(vec2 p, int vesselType) {
  // Neck sits around y in [0.22..0.38], body in [-0.46..0.22]
  float neck = sdBox(p - vec2(0.0, 0.28), vec2(0.068, 0.10)) - 0.014;
  float lip = sdBox(p - vec2(0.0, 0.375), vec2(0.095, 0.018)) - 0.012;
  float neckLip = min(neck, lip);

  if (vesselType == 0) {
    // 0 = prism: faceted diamond-octagon crystal flacon
    vec2 q = vec2(p.x * 1.15, (p.y + 0.10) * 0.92);
    float body = sdOctagon(q, 0.31) - 0.015;
    float base = sdBox(p - vec2(0.0, -0.43), vec2(0.22, 0.03)) - 0.01;
    return min(smin(body, neckLip, 0.03), base);
  } else if (vesselType == 1) {
    // 1 = teardrop: bulbous rounded base tapering gracefully into slender neck
    vec2 q = p - vec2(0.0, -0.15);
    float taper = clamp((0.25 - q.y) * 0.85, 0.18, 1.15);
    vec2 tq = vec2(q.x / max(taper, 0.2), q.y * 0.88);
    float bulb = (length(tq) - 0.30) * min(taper, 1.0);
    float base = sdBox(p - vec2(0.0, -0.44), vec2(0.18, 0.025)) - 0.012;
    return min(smin(bulb, neckLip, 0.06), base);
  } else if (vesselType == 2) {
    // 2 = crescent: arcane crescent moon crystal vessel on footed plinth
    vec2 cp = p - vec2(-0.02, -0.11);
    float outerDisk = length(cp) - 0.33;
    float innerCut = length(cp - vec2(0.16, 0.05)) - 0.23;
    float crescent = max(outerDisk, -innerCut);
    float stem = sdBox(p - vec2(0.0, -0.39), vec2(0.06, 0.06));
    float foot = sdBox(p - vec2(0.0, -0.45), vec2(0.21, 0.022)) - 0.01;
    return min(smin(crescent, neckLip, 0.045), smin(stem, foot, 0.025));
  } else {
    // 3 = carafe: wide-bellied laboratory carafe with heavy collar
    vec2 bp = vec2(p.x * 0.92, (p.y + 0.16) * 1.06);
    float belly = length(bp) - 0.32;
    float flatBottom = max(belly, -(p.y + 0.455));
    float collar = sdBox(p - vec2(0.0, 0.20), vec2(0.095, 0.02)) - 0.008;
    return min(smin(flatBottom, neckLip, 0.055), collar);
  }
}

vec3 evalLiquidLayers(float yNorm, float xPos, float timeVal) {
  float d0 = max(safeFinite(u_layerDensities[0], 0.0), 0.0);
  float d1 = max(safeFinite(u_layerDensities[1], 0.0), 0.0);
  float d2 = max(safeFinite(u_layerDensities[2], 0.0), 0.0);
  float d3 = max(safeFinite(u_layerDensities[3], 0.0), 0.0);
  float totalD = d0 + d1 + d2 + d3;

  if (totalD <= 1e-4) {
    return vec3(0.45, 0.65, 0.72);
  }

  float invD = 1.0 / totalD;
  float h0 = d0 * invD;
  float h1 = h0 + d1 * invD;
  float h2 = h1 + d2 * invD;

  vec3 c0 = safeColor(u_layerColors[0], vec3(0.75, 0.52, 0.20));
  vec3 c1 = (d1 > 1e-4) ? safeColor(u_layerColors[1], c0) : c0;
  vec3 c2 = (d2 > 1e-4) ? safeColor(u_layerColors[2], c1) : c1;
  vec3 c3 = (d3 > 1e-4) ? safeColor(u_layerColors[3], c2) : c2;

  float crisp = clamp(safeFinite(u_layerCrispness, 0.85), 0.0, 1.0);
  float marb = clamp(safeFinite(u_marbling, 0.0), 0.0, 1.0);

  // Subtle internal Suminagashi wave inside the bottle when marbling > 0
  float wave = sin(xPos * 14.0 + yNorm * 10.0 - timeVal * 1.4) * 0.045 * marb
             + sin(xPos * 23.0 - yNorm * 16.0 + timeVal * 0.9) * 0.025 * marb;
  float y = clamp(yNorm + wave, 0.0, 1.0);

  float w = mix(0.055, 0.008, crisp);
  vec3 col = c0;
  if (d1 > 1e-4) col = mix(col, c1, smoothstep(h0 - w, h0 + w, y));
  if (d2 > 1e-4) col = mix(col, c2, smoothstep(h1 - w, h1 + w, y));
  if (d3 > 1e-4) col = mix(col, c3, smoothstep(h2 - w, h2 + w, y));
  return col;
}

float waxHeightField(vec2 p) {
  // Molten wax pooling around bottle neck/shoulder with organic teardrop tendrils
  float collar = length((p - vec2(0.0, 0.355)) * vec2(1.0, 2.2)) - 0.115;
  float drip1 = sdSegment(p, vec2(-0.045, 0.34), vec2(-0.055, 0.17)) - (0.024 + 0.008 * sin(p.y * 40.0));
  float drip2 = sdSegment(p, vec2(0.052, 0.34), vec2(0.064, 0.21)) - 0.020;
  float drip3 = sdSegment(p, vec2(0.008, 0.34), vec2(0.012, 0.25)) - 0.022;
  float medallion = length(p - vec2(0.0, 0.13)) - 0.088;
  float d = smin(collar, min(drip1, min(drip2, drip3)), 0.028);
  if (u_waxStamped > 0.5) {
    d = smin(d, medallion, 0.032);
  }
  return d;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - vec2(0.5)) * 2.0;
  p.x *= aspect;

  // 1. Sunlit walnut woodgrain tabletop & warm apothecary shadow backdrop
  float tableY = -0.34;
  float isTable = smoothstep(tableY + 0.03, tableY - 0.03, p.y);

  // Backlit walnut wall vs sunlit desk
  vec2 woodUv = vec2(p.x * 3.2, (p.y - tableY) * 14.0);
  float grainPattern = sin(woodUv.y * 5.0 + fbm(woodUv * 1.4) * 4.8) * 0.5 + 0.5;
  vec3 walnutDark = vec3(0.11, 0.06, 0.035);
  vec3 walnutHoney = vec3(0.32, 0.18, 0.095);
  vec3 tableCol = mix(walnutDark, walnutHoney, grainPattern);

  // Warm diagonal sun shaft from upper-left
  float sunShaft = smoothstep(1.2, -0.4, p.x * 0.7 - p.y * 0.65);
  tableCol *= 0.65 + 0.72 * sunShaft;

  vec3 wallCol = mix(vec3(0.07, 0.045, 0.032), vec3(0.18, 0.11, 0.065), clamp(sunShaft * 0.8 + uv.y * 0.3, 0.0, 1.0));
  vec3 bgCol = mix(wallCol, tableCol, isTable);

  // Ground contact shadow under vessel
  float baseShadow = exp(-pow((p.x - 0.04) * 3.4, 2.0) - pow((p.y + 0.46) * 16.0, 2.0));
  bgCol *= 1.0 - 0.62 * baseShadow;

  // 2. Animated RGB spectral dispersion rainbow caustics across sunlit walnut woodgrain
  vec2 causticCenter = vec2(0.34, -0.49);
  vec2 cd = (p - causticCenter) * vec2(1.15, 3.6);
  float cDist = length(cd);
  if (cDist < 0.78 && isTable > 0.02) {
    float pour = clamp(safeFinite(u_pourProgress, 0.0), 0.0, 1.0);
    float fluidBoost = 0.35 + 0.65 * pour;
    float envelope = smoothstep(0.75, 0.05, cDist) * isTable * fluidBoost;

    float waveBase = u_time * 1.15;
    float cR = pow(max(sin(cd.x * 16.0 + cd.y * 9.0 + waveBase + fbm(cd * 4.0) * 4.2) * 0.5 + 0.5, 0.0), 3.0);
    float cG = pow(max(sin((cd.x + 0.045) * 16.0 + cd.y * 9.0 + waveBase * 1.05 + fbm(cd * 4.0 + 0.15) * 4.2) * 0.5 + 0.5, 0.0), 3.0);
    float cB = pow(max(sin((cd.x + 0.090) * 16.0 + cd.y * 9.0 + waveBase * 1.10 + fbm(cd * 4.0 + 0.30) * 4.2) * 0.5 + 0.5, 0.0), 3.0);

    vec3 potionTint = evalLiquidLayers(clamp(0.5 + cd.x * 0.5, 0.0, 1.0), cd.x, u_time);
    vec3 prismDispersion = vec3(cR * 1.25, cG * 1.05, cB * 1.35) * mix(vec3(1.0), potionTint * 1.35 + 0.2, 0.6);
    bgCol += prismDispersion * envelope * 0.58;
  }

  vec3 col = bgCol;

  // 3. Crystal Vessel Geometry & Stratified Liquid Fill
  float dVessel = sdVesselBody(p, u_vesselType);
  float vesselAlpha = 1.0 - smoothstep(-0.006, 0.008, dVessel);
  float innerWall = dVessel + 0.026;
  float innerAlpha = 1.0 - smoothstep(-0.006, 0.006, innerWall);

  float pour = clamp(safeFinite(u_pourProgress, 0.0), 0.0, 1.0);
  float fillBottom = -0.41;
  float fillTop = mix(fillBottom, 0.21, pour);
  float waveSurface = sin(p.x * 24.0 + u_time * 5.5) * 0.012 * (1.0 - smoothstep(0.85, 1.0, pour)) * step(0.02, pour);
  float liquidMask = innerAlpha * (1.0 - smoothstep(fillTop + waveSurface - 0.006, fillTop + waveSurface + 0.006, p.y));

  if (vesselAlpha > 0.001) {
    // Glass surface normal via finite difference
    vec2 eps = vec2(0.004, 0.0);
    vec2 gGrad = vec2(
      sdVesselBody(p + eps.xy, u_vesselType) - sdVesselBody(p - eps.xy, u_vesselType),
      sdVesselBody(p + eps.yx, u_vesselType) - sdVesselBody(p - eps.yx, u_vesselType)
    ) / (2.0 * eps.x);
    vec2 n2 = length(gGrad) > 1e-5 ? normalize(gGrad) : vec2(0.0, 1.0);
    vec3 glassNormal = normalize(vec3(n2 * 0.72, 0.68));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float fresnel = pow(clamp(1.0 - abs(dot(glassNormal, viewDir)), 0.0, 1.0), 2.4);

    // Refracted background behind crystal
    vec3 glassBody = mix(bgCol * 1.08 + vec3(0.04, 0.07, 0.09), vec3(0.65, 0.82, 0.90), fresnel * 0.55);

    // Stratified liquid inside cavity
    float yNorm = clamp((p.y - fillBottom) / max(fillTop - fillBottom, 1e-4), 0.0, 1.0);
    vec3 liqCol = evalLiquidLayers(yNorm, p.x, u_time);
    // Internal Beer-Lambert depth shading & meniscus highlight
    float radialCurve = clamp(1.0 - abs(p.x) * 2.1, 0.25, 1.0);
    liqCol *= 0.62 + 0.55 * radialCurve;
    float meniscusLine = exp(-pow((p.y - (fillTop + waveSurface)) * 95.0, 2.0)) * innerAlpha * step(0.02, pour);
    liqCol += vec3(0.95, 0.92, 0.86) * meniscusLine * 0.55;

    // Prism facet specular streaks for u_vesselType == 0
    float facetSpec = 0.0;
    if (u_vesselType == 0) {
      facetSpec = pow(max(1.0 - abs(abs(p.x) - 0.14) * 18.0, 0.0), 3.0) * 0.35;
    }

    vec3 lightDir1 = normalize(vec3(-0.6, 0.7, 0.65));
    float spec1 = pow(max(dot(reflect(-lightDir1, glassNormal), viewDir), 0.0), 36.0);
    float glassRim = smoothstep(-0.025, 0.0, dVessel) * vesselAlpha;

    vec3 vesselShade = mix(glassBody, liqCol, liquidMask * 0.90);
    vesselShade += vec3(0.92, 0.97, 1.0) * (fresnel * 0.42 + spec1 * 0.75 + glassRim * 0.38 + facetSpec);
    col = mix(col, vesselShade, vesselAlpha);
  }

  // 4. Tarnished Brass Funnel & Laminar Pour Stream (active while pouring)
  float funnelVis = smoothstep(0.0, 0.05, pour) * (1.0 - smoothstep(0.90, 0.99, pour));
  if (funnelVis > 0.001) {
    // Laminar liquid stream from funnel spout (y=0.45) to liquid surface
    float streamBottom = max(fillTop, -0.38);
    if (p.y >= streamBottom && p.y <= 0.46) {
      float streamW = 0.018 - 0.006 * clamp((0.46 - p.y) / 0.85, 0.0, 1.0);
      float streamD = abs(p.x - sin(p.y * 18.0 - u_time * 14.0) * 0.003) - streamW;
      float streamMask = 1.0 - smoothstep(-0.004, 0.004, streamD);
      vec3 streamCol = evalLiquidLayers(fract(1.0 - pour + (0.46 - p.y) * 0.6), p.x, u_time) * 1.15;
      streamCol += vec3(0.9, 0.95, 1.0) * smoothstep(streamW * 0.3, 0.0, abs(p.x + streamW * 0.35)) * 0.45;
      col = mix(col, streamCol, streamMask * funnelVis * 0.92);
    }

    // Tarnished brass funnel cone & spout above bottle mouth
    float spout = sdBox(p - vec2(0.0, 0.50), vec2(0.025, 0.065)) - 0.004;
    float coneY = p.y - 0.56;
    float halfW = mix(0.025, 0.21, clamp(coneY / 0.20, 0.0, 1.0));
    float cone = (coneY >= 0.0 && coneY <= 0.21) ? (abs(p.x) - halfW) : 1.0;
    float funnelD = min(spout, cone);
    float funnelMask = (1.0 - smoothstep(-0.005, 0.005, funnelD)) * funnelVis;
    if (funnelMask > 0.001) {
      float metalShade = clamp(0.45 - p.x * 3.2 + 0.2 * sin(p.x * 26.0), 0.1, 1.0);
      vec3 brassCol = mix(vec3(0.20, 0.14, 0.07), vec3(0.84, 0.64, 0.29), metalShade);
      // Verdigris tarnish along upper funnel rim
      float patina = smoothstep(0.72, 0.77, p.y) * 0.55;
      brassCol = mix(brassCol, vec3(0.24, 0.48, 0.38), patina);
      col = mix(col, brassCol, funnelMask);
    }
  }

  // 5. Cork Stopper
  float corkActive = max(u_corked, max(u_waxPoured, u_waxStamped));
  if (corkActive > 0.5) {
    float dCork = sdBox(p - vec2(0.0, 0.415), vec2(0.056, 0.048)) - 0.008;
    float corkMask = 1.0 - smoothstep(-0.005, 0.005, dCork);
    if (corkMask > 0.001) {
      float corkGrain = noise2D(p * 85.0);
      vec3 corkCol = mix(vec3(0.42, 0.27, 0.14), vec3(0.68, 0.48, 0.28), corkGrain) * (0.85 - p.x * 3.5);
      col = mix(col, clamp(corkCol, 0.0, 1.0), corkMask);
    }
  }

  // 6. Normal-Mapped Glossy Molten Wax Drip & Embossed Guild Signet Shading
  float waxActive = max(u_waxPoured, u_waxStamped);
  if (waxActive > 0.5) {
    float dw = waxHeightField(p);
    float waxMask = 1.0 - smoothstep(-0.005, 0.005, dw);
    if (waxMask > 0.001) {
      vec2 weps = vec2(0.003, 0.0);
      vec2 wGrad = vec2(
        waxHeightField(p + weps.xy) - waxHeightField(p - weps.xy),
        waxHeightField(p + weps.yx) - waxHeightField(p - weps.yx)
      ) / (2.0 * weps.x);
      vec3 wNorm = normalize(vec3(-wGrad * 0.45, 1.0));

      // Embossed Guild Signet crest normal perturbation inside seal medallion
      if (u_waxStamped > 0.5) {
        vec2 mp = p - vec2(0.0, 0.13);
        float mr = length(mp);
        float ringRelief = exp(-pow((mr - 0.062) * 110.0, 2.0));
        float crestAngle = atan(mp.y, mp.x);
        float crestRelief = exp(-pow((mr - 0.032) * 90.0, 2.0)) * (0.5 + 0.5 * cos(crestAngle * 6.0));
        vec2 embossDir = mr > 1e-4 ? normalize(mp) : vec2(0.0);
        wNorm = normalize(wNorm + vec3(embossDir * (ringRelief * 0.55 - crestRelief * 0.45), 0.0));
      }

      vec3 waxBase = clamp(safeColor(u_waxColor, vec3(0.68, 0.14, 0.18)), 0.02, 1.0);
      vec3 lightD = normalize(vec3(-0.55, 0.72, 0.85));
      float diff = clamp(dot(wNorm, lightD), 0.18, 1.0);
      float gloss = pow(max(dot(reflect(-lightD, wNorm), vec3(0.0, 0.0, 1.0)), 0.0), 42.0);
      vec3 waxLit = waxBase * (0.45 + 0.75 * diff) + vec3(1.0, 0.94, 0.88) * gloss * 0.78;
      col = mix(col, waxLit, waxMask);
    }
  }

  col = col / (vec3(1.0) + col * 0.12);
  fragColor = sanitizeVec4(vec4(clamp(col, 0.0, 1.0), 1.0), vec4(0.12, 0.07, 0.04, 1.0));
}
