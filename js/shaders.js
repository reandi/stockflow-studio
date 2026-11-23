/**
 * StockFlow Studio — WebGL2 GLSL 300 es Procedural Shaders
 * 100% Mathematical Abstract Background Synthesis (Commercial Microstock Grade):
 *  - Mode 0: Ethereal Silk / Flowing Chiffon (Anisotropic Domain Warping + Layered Sheer Drapery + Normal-Map Silk Lighting)
 *  - Mode 1: Liquid Marble / Fluid Waves (Broad Fluid Advection + Sleek Mineral Veins + Glossy Wet-Paint Specular)
 *  - Mode 2: Aurora Mist / Soft Gradient (Rich Atmospheric Depth + Sweeping Luminous Light Curtains)
 *  - Mode 3: Abstract Glass / Frosted Ribbons (Curved Translucent Glass Sheets + Optical Refraction & Crisp Caustic Rims)
 *
 * Output Stage:
 *  - Exact Global-Coordinate Triangular-PDF Interleaved Gradient Noise Micro-Dithering
 *    to eliminate 8-bit JPEG color banding and ensure 100% seamless 4K–8K tiled stitching.
 */
(function (global) {
  'use strict';

  const PATTERN_MODES = [
    {
      id: 0,
      slug: 'silk',
      name: 'Ethereal Silk',
      subtitle: 'Flowing Chiffon',
      keywords: 'ethereal silk, flowing chiffon, satin fabric, translucent folds, soft wave, pastel cloth, abstract drapery',
      defaults: {
        complexity: 4.0,
        scale: 1.15,
        warp: 1.35,
        softness: 0.48,
        contrast: 1.05
      }
    },
    {
      id: 1,
      slug: 'marble',
      name: 'Liquid Marble',
      subtitle: 'Fluid Waves',
      keywords: 'liquid marble, fluid art, acrylic pour, organic waves, flowing liquid, marble texture, glossy swirl',
      defaults: {
        complexity: 4.6,
        scale: 1.10,
        warp: 1.55,
        softness: 0.34,
        contrast: 1.18
      }
    },
    {
      id: 2,
      slug: 'aurora',
      name: 'Aurora Mist',
      subtitle: 'Soft Gradient',
      keywords: 'aurora gradient, atmospheric mist, dreamy blur, soft mesh gradient, pastel aura, luminous glow',
      defaults: {
        complexity: 3.0,
        scale: 1.00,
        warp: 1.25,
        softness: 0.62,
        contrast: 1.12
      }
    },
    {
      id: 3,
      slug: 'glass',
      name: 'Frosted Ribbons',
      subtitle: 'Abstract Glass',
      keywords: 'frosted glass, abstract ribbons, translucent curves, glassmorphism, refraction waves, modern 3d ribbon',
      defaults: {
        complexity: 3.6,
        scale: 1.15,
        warp: 1.20,
        softness: 0.42,
        contrast: 1.15
      }
    }
  ];

  const VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
`;

  const FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 fragColor;

// Tile & Resolution uniforms (for exact tile-invariant 4K-8K rendering)
uniform vec2 u_fullResolution;
uniform vec2 u_tileOffset;

// Pattern & procedural parameters
uniform int u_mode;
uniform float u_seed;
uniform float u_complexity; // 1.0 .. 8.0
uniform float u_scale;      // 0.4 .. 4.0
uniform float u_warp;       // 0.0 .. 3.0
uniform float u_softness;   // 0.0 .. 1.0
uniform float u_contrast;   // 0.0 .. 2.0
uniform float u_rotation;   // radians
uniform float u_dither;     // 0.0 .. 2.0

// 4-color commercial palette (sRGB 0..1)
uniform vec3 u_color0;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;

// -------------------------------------------------------------------------
// Deterministic Seed Hashing (bounded coordinates for full 8K float precision)
// -------------------------------------------------------------------------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash21(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec2 seedVec(float s, float channel) {
  vec2 h = hash21(s * 0.1371 + channel * 19.731);
  return (h - 0.5) * 120.0;
}

mat2 rot2d(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// -------------------------------------------------------------------------
// Perceptual Color Space & Non-Clipping Highlight Helpers
// -------------------------------------------------------------------------
vec3 srgbToLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}

vec3 linearToSrgb(vec3 c) {
  return pow(clamp(c, vec3(0.0), vec3(1.0)), vec3(1.0 / 2.2));
}

vec3 screenBlend(vec3 base, vec3 glow) {
  return 1.0 - (1.0 - clamp(base, 0.0, 1.0)) * (1.0 - clamp(glow, 0.0, 1.0));
}

vec3 samplePaletteLinear(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  t = clamp(t, 0.0, 1.0);
  float seg = t * 3.0;
  if (seg < 1.0) {
    return mix(c0, c1, smoothstep(0.0, 1.0, seg));
  } else if (seg < 2.0) {
    return mix(c1, c2, smoothstep(0.0, 1.0, seg - 1.0));
  } else {
    return mix(c2, c3, smoothstep(0.0, 1.0, seg - 2.0));
  }
}

// -------------------------------------------------------------------------
// 2D Simplex Noise (Ashima / Stefan Gustavson)
// -------------------------------------------------------------------------
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
   -0.577350269189626,
    0.024390243902439
  );

  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x  = a0.x  * x0.x   + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Smooth fractional-octave FBM with per-octave rotation (capped at 6 clean smooth octaves)
const mat2 OCTAVE_ROT = mat2(0.80, -0.60, 0.60, 0.80);

float fbm(vec2 p, float octaves, float gain) {
  float value = 0.0;
  float amp = 0.54;
  float norm = 0.0;
  vec2 shift = vec2(17.3, 9.2);
  float oct = clamp(octaves, 1.0, 6.0);

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    float weight = clamp(oct - fi, 0.0, 1.0);
    value += weight * amp * snoise(p);
    norm += weight * amp;
    p = OCTAVE_ROT * p * 1.92 + shift;
    amp *= gain;
  }
  return value / max(norm, 0.0001);
}

// Smooth draped silk pleat profile without harsh creases
float silkPleat(float phase, float creaseEps) {
  float s = sin(phase);
  float ridge = 1.0 - sqrt(s * s + creaseEps);
  float swell = 0.5 + 0.5 * cos(phase * 0.5);
  return mix(swell, ridge, 0.58);
}

// -------------------------------------------------------------------------
// MODE 0: ETHEREAL SILK / FLOWING CHIFFON
// Anisotropic flowing drapery + layered domain warping + translucent normal lighting
// -------------------------------------------------------------------------
struct SilkSample {
  float height;
  float colorPos;
  float sheenMask;
  float mist;
};

SilkSample evalSilk(vec2 p, vec2 sA, vec2 sB, vec2 sC, vec2 sD) {
  // Anisotropic stretch creates long, graceful, sweeping silk drapery across the frame
  vec2 ap = vec2(p.x * 0.44, p.y * 1.08);
  float gain = mix(0.46, 0.30, u_softness);
  float octBroad = clamp(1.4 + u_complexity * 0.30, 1.5, 3.8);
  float octFold  = clamp(1.8 + u_complexity * 0.42, 2.0, 4.8);

  // Stage 1: Broad undulating wind flow
  vec2 q = vec2(
    fbm(ap * 0.68 + sA, octBroad, gain),
    fbm(ap * 0.68 + sB + vec2(3.8, -2.4), octBroad, gain)
  );

  // Stage 2: Secondary billowing chiffon displacement
  vec2 w1 = ap + u_warp * 0.55 * q;
  vec2 r = vec2(
    fbm(w1 * 0.88 + sC, octFold, gain),
    fbm(w1 * 0.88 + sD + vec2(-2.9, 4.1), octFold, gain)
  );

  vec2 flow = ap + u_warp * (0.34 * q + 0.48 * r);
  float creaseEps = mix(0.055, 0.30, u_softness);

  // Three overlapping sheer chiffon veil sheets at harmonious angles
  float phase1 = flow.y * 3.1 + flow.x * 0.85 + u_warp * (1.35 * r.x + 0.65 * q.y);
  float sheet1 = silkPleat(phase1, creaseEps);

  float phase2 = flow.y * 2.0 - flow.x * 1.15 + u_warp * (1.15 * r.y - 0.60 * q.x) + 1.57;
  float sheet2 = silkPleat(phase2, creaseEps * 1.4);

  float phase3 = flow.y * 4.4 + flow.x * 0.45 + u_warp * (0.95 * r.x + 0.85 * r.y) - 0.85;
  float sheet3 = silkPleat(phase3, creaseEps * 1.8);

  float veilBlend = smoothstep(-0.75, 0.75, r.x * 0.75 + q.y * 0.45);
  float h = mix(sheet1, sheet2, 0.36 + 0.24 * veilBlend);
  h = mix(h, sheet3, mix(0.24, 0.08, u_softness));

  // Large airy billowing depth envelope
  float mist = 0.5 + 0.5 * fbm(w1 * 0.48 + sA * 0.4, 2.2, 0.42);
  h = mix(h, mist, 0.22 + 0.24 * u_softness);

  // Rich color sweep spanning all 4 palette stops across the flowing silk
  float colorPos = clamp(
    0.50 + 0.34 * p.x * 0.55 - 0.22 * p.y * 0.5 + 0.44 * r.x + 0.28 * q.y + 0.16 * (sheet1 - sheet2),
    0.0, 1.0
  );

  SilkSample outS;
  outS.height = h;
  outS.colorPos = colorPos;
  outS.sheenMask = clamp(0.55 * sheet1 + 0.45 * sheet2, 0.0, 1.0);
  outS.mist = mist;
  return outS;
}

vec3 renderEtherealSilk(vec2 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2 sA = seedVec(u_seed, 1.0);
  vec2 sB = seedVec(u_seed, 2.0);
  vec2 sC = seedVec(u_seed, 3.0);
  vec2 sD = seedVec(u_seed, 4.0);

  // World-space finite differences -> 100% seamless across 8K tile borders
  float eps = mix(0.012, 0.036, u_softness);
  SilkSample c  = evalSilk(p, sA, sB, sC, sD);
  SilkSample dx = evalSilk(p + vec2(eps, 0.0), sA, sB, sC, sD);
  SilkSample dy = evalSilk(p + vec2(0.0, eps), sA, sB, sC, sD);

  float relief = mix(0.68, 0.24, u_softness) * (0.55 + 0.65 * u_contrast);
  vec3 N = normalize(vec3(
    (c.height - dx.height) / eps * relief,
    (c.height - dy.height) / eps * relief,
    1.0
  ));

  // Soft studio key + warm/cool fill lighting
  vec3 L1 = normalize(vec3(0.42, 0.68, 0.85));
  vec3 L2 = normalize(vec3(-0.62, -0.32, 0.72));
  vec3 V  = vec3(0.0, 0.0, 1.0);

  // Half-Lambert soft wrap shading (silky shadow transitions, never harsh)
  float wrap1 = pow(clamp(dot(N, L1) * 0.5 + 0.5, 0.0, 1.0), 1.45);
  float wrap2 = pow(clamp(dot(N, L2) * 0.5 + 0.5, 0.0, 1.0), 1.75);

  // Subtle satin sheen along fold crests
  vec3 H1 = normalize(L1 + V);
  float sheenPow = mix(14.0, 5.0, u_softness);
  float sheen = pow(max(dot(N, H1), 0.0), sheenPow) * (0.14 + 0.18 * u_contrast);

  // Translucent chiffon rim glow where fabric curves away from camera
  float fresnel = pow(1.0 - clamp(N.z, 0.0, 1.0), 2.1);

  vec3 baseCol = samplePaletteLinear(c.colorPos, c0, c1, c2, c3);
  vec3 veilCol = samplePaletteLinear(clamp(c.colorPos * 0.68 + 0.28 * c.sheenMask, 0.0, 1.0), c0, c1, c2, c3);
  vec3 col = mix(baseCol, veilCol, 0.36);

  // Sculpt fabric valleys & luminous crests without washing out pastel hues
  float shade = mix(0.76, 1.12, wrap1 * 0.74 + wrap2 * 0.26);
  // Subtle tinted depth in fold valleys
  vec3 valleyTint = mix(col * 0.82, mix(c2, c3, 0.5) * 0.72, 0.22);
  col = mix(valleyTint, col * shade, smoothstep(0.18, 0.92, wrap1));

  // Non-clipping pearlescent sheen & backlit rim glow (screen blend prevents flat white blowout!)
  vec3 pearlTint = mix(c0, vec3(0.98), 0.35);
  col = screenBlend(col, pearlTint * sheen * (0.4 + 0.6 * c.sheenMask));
  col = mix(col, mix(c0, pearlTint, 0.35), fresnel * (0.20 + 0.16 * u_contrast));

  // Airy pastel mist depth
  vec3 mistCol = mix(c0, c1, 0.5);
  float mistAmt = smoothstep(0.22, 0.95, c.mist) * (0.06 + 0.22 * u_softness);
  col = mix(col, mistCol, mistAmt);

  // Refined contrast around perceptual midtone
  float cScale = mix(0.86, 1.24, clamp(u_contrast * 0.5, 0.0, 1.0));
  col = (col - 0.48) * cScale + 0.48;
  return clamp(col, 0.0, 1.0);
}

// -------------------------------------------------------------------------
// MODE 1: LIQUID MARBLE / FLUID WAVES
// Broad luxury acrylic pour waves + sleek mineral veins + glossy specular
// -------------------------------------------------------------------------
struct MarbleSample {
  float height;
  float band;
  float vein;
  float flowTone;
};

MarbleSample evalMarble(vec2 p, vec2 sA, vec2 sB, vec2 sC, vec2 sD) {
  // Broad fluid framing so marble swirls look monumental & sleek, never cluttered
  vec2 mp = p * 0.52;
  float gain = mix(0.48, 0.32, u_softness);
  float oct1 = clamp(1.5 + u_complexity * 0.32, 1.5, 3.8);
  float oct2 = clamp(2.0 + u_complexity * 0.45, 2.0, 5.2);

  vec2 q = vec2(
    fbm(mp * 0.75 + sA, oct1, gain),
    fbm(mp * 0.75 + sB + vec2(4.1, -3.3), oct1, gain)
  );

  vec2 r = vec2(
    fbm(mp * 0.95 + u_warp * 0.72 * q + sC, oct2, gain),
    fbm(mp * 0.95 + u_warp * 0.72 * q + sD + vec2(-3.6, 2.8), oct2, gain)
  );

  float eddy = fbm(mp * 1.18 + u_warp * 0.55 * r + sA * 0.5, max(2.0, oct2 - 0.6), gain);

  // Sweeping glossy liquid ribbons
  float coord = mp.x * 1.65 + mp.y * 1.15 + u_warp * (1.35 * r.x + 1.05 * r.y) + 0.72 * eddy;
  float wave1 = 0.5 + 0.5 * sin(coord * 2.15);
  float wave2 = 0.5 + 0.5 * cos(coord * 1.08 - q.x * 1.65);

  // Sleek flowing gold/mineral vein filaments along contour crests
  float ridgeDist = abs(sin(coord * 2.15 + 0.45 * r.y));
  float veinW = mix(0.032, 0.14, u_softness);
  float vein = exp(-pow(ridgeDist / max(veinW, 0.01), 2.0));
  vein *= smoothstep(-0.25, 0.65, eddy + 0.25);

  MarbleSample ms;
  ms.height = mix(wave1, wave2, 0.42) + 0.18 * eddy + 0.10 * vein;
  ms.band = clamp(mix(wave1, wave2, 0.46) * 0.78 + (0.5 + 0.5 * eddy) * 0.22, 0.0, 1.0);
  ms.vein = vein;
  ms.flowTone = clamp(0.5 + 0.48 * r.x + 0.18 * q.y, 0.0, 1.0);
  return ms;
}

vec3 renderLiquidMarble(vec2 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2 sA = seedVec(u_seed, 5.0);
  vec2 sB = seedVec(u_seed, 6.0);
  vec2 sC = seedVec(u_seed, 7.0);
  vec2 sD = seedVec(u_seed, 8.0);

  float eps = mix(0.010, 0.028, u_softness);
  MarbleSample c  = evalMarble(p, sA, sB, sC, sD);
  MarbleSample dx = evalMarble(p + vec2(eps, 0.0), sA, sB, sC, sD);
  MarbleSample dy = evalMarble(p + vec2(0.0, eps), sA, sB, sC, sD);

  float relief = mix(0.72, 0.24, u_softness) * (0.52 + 0.68 * u_contrast);
  vec3 N = normalize(vec3(
    (c.height - dx.height) / eps * relief,
    (c.height - dy.height) / eps * relief,
    1.0
  ));

  vec3 L1 = normalize(vec3(0.46, 0.68, 0.85));
  vec3 L2 = normalize(vec3(-0.55, -0.40, 0.72));
  vec3 V  = vec3(0.0, 0.0, 1.0);

  float diff = pow(clamp(dot(N, L1) * 0.5 + 0.5, 0.0, 1.0), 1.3);
  float fill = pow(clamp(dot(N, L2) * 0.5 + 0.5, 0.0, 1.0), 1.65);

  vec3 H1 = normalize(L1 + V);
  float spec = pow(max(dot(N, H1), 0.0), mix(34.0, 9.0, u_softness)) * (0.22 + 0.28 * u_contrast);

  vec3 col = samplePaletteLinear(c.band, c0, c1, c2, c3);
  vec3 swirlCol = samplePaletteLinear(c.flowTone, c1, c2, c3, c0);
  col = mix(col, swirlCol, 0.28);

  // Subtle lustrous marble vein highlight
  vec3 veinCol = mix(c2, max(c0, c3), 0.58);
  col = mix(col, veinCol, c.vein * (0.34 + 0.24 * u_contrast));

  col *= mix(0.76, 1.15, diff * 0.76 + fill * 0.24);
  col = screenBlend(col, mix(c0, vec3(1.0), 0.5) * spec);

  float cScale = mix(0.86, 1.24, clamp(u_contrast * 0.5, 0.0, 1.0));
  col = (col - 0.48) * cScale + 0.48;
  return clamp(col, 0.0, 1.0);
}

// -------------------------------------------------------------------------
// MODE 2: AURORA MIST / SOFT GRADIENT
// Deep atmospheric backdrop + sweeping luminous light curtains & dreamy bloom
// -------------------------------------------------------------------------
vec3 renderAuroraMist(vec2 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2 sA = seedVec(u_seed, 9.0);
  vec2 sB = seedVec(u_seed, 10.0);
  vec2 sC = seedVec(u_seed, 11.0);

  float oct = clamp(1.5 + u_complexity * 0.45, 1.5, 4.5);
  float gain = mix(0.45, 0.30, u_softness);

  // Broad sweeping atmospheric drift
  vec2 drift = vec2(
    fbm(p * 0.48 + sA, oct, gain),
    fbm(p * 0.48 + sB + vec2(3.1, -2.4), oct, gain)
  );
  vec2 q = p + u_warp * 0.52 * drift;

  // Rich directional base gradient preserving deep c0 shadow contrast
  float bgT = clamp(0.48 + 0.48 * q.y - 0.28 * q.x + 0.30 * drift.x, 0.0, 1.0);
  vec3 col = mix(c0, c1, smoothstep(0.08, 0.92, bgT));

  // Three graceful sweeping aurora light ribbons with dramatic color separation
  float spread = mix(0.20, 0.58, u_softness);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float phase = fi * 2.15 + hash11(u_seed + fi * 13.7) * 6.28318;
    float wave = sin(q.x * (1.15 + fi * 0.28) + phase + drift.y * (1.2 + 0.55 * u_warp)) * 0.32;
    float centerY = (fi - 1.0) * 0.34 + wave;
    float d = q.y - centerY;

    // Subtle vertical aurora shimmer streaks
    float shimmer = 0.65 + 0.35 * fbm(vec2(q.x * 1.45 + fi * 3.1, q.y * 0.35) + sC, max(1.5, oct - 0.5), 0.40);
    float ribbon = exp(-(d * d) / (spread * spread * (0.55 + 0.30 * fi)));
    ribbon *= clamp(shimmer, 0.25, 1.25);

    // Distinct color per aurora curtain (c1 -> c2 -> c3) for lush depth
    vec3 ribbonCol = (i == 0) ? c1 : ((i == 1) ? c2 : c3);
    float strength = clamp(ribbon * (0.48 + 0.34 * u_contrast), 0.0, 0.90);

    vec3 glow = screenBlend(col, ribbonCol * 0.62);
    col = mix(col, mix(ribbonCol, glow, 0.55), strength);
  }

  // Luminous atmospheric accent bloom
  vec2 bloomPos = (hash21(u_seed * 0.77 + 3.1) - 0.5) * 0.85;
  float radial = exp(-dot(q - bloomPos, q - bloomPos) * mix(1.6, 0.65, u_softness));
  col = mix(col, screenBlend(col, c3 * 0.55), radial * 0.36 * u_contrast);

  float cScale = mix(0.86, 1.26, clamp(u_contrast * 0.5, 0.0, 1.0));
  col = (col - 0.45) * cScale + 0.45;
  return clamp(col, 0.0, 1.0);
}

// -------------------------------------------------------------------------
// MODE 3: ABSTRACT GLASS / FROSTED RIBBONS
// Overlapping curved translucent glass ribbons + crisp optical refraction edges
// -------------------------------------------------------------------------
vec3 renderFrostedRibbons(vec2 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2 sA = seedVec(u_seed, 12.0);
  vec2 sB = seedVec(u_seed, 13.0);

  float oct = clamp(1.5 + u_complexity * 0.45, 1.5, 4.5);
  float gain = mix(0.46, 0.32, u_softness);

  // Smooth frosted editorial backdrop with gentle tonal sweep
  float bgN = fbm(p * 0.46 + sA, 2.5, 0.44);
  float bgT = clamp(0.42 + 0.38 * p.y - 0.22 * p.x + 0.26 * bgN, 0.0, 1.0);
  vec3 col = samplePaletteLinear(bgT, c0, c1, c2, c3);

  float frostWave = fbm(p * 1.65 + sB, oct, gain);

  // 5 graceful curved frosted glass ribbons
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 h = hash21(u_seed * 0.41 + fi * 17.13 + 2.3);
    float angle = (h.x - 0.5) * 0.85 + (fi - 2.0) * 0.14;
    vec2 rp = rot2d(angle) * p;

    float freq = 0.95 + h.y * 0.85;
    float warpAmt = 0.22 + 0.26 * u_warp;
    float spine =
      sin(rp.x * freq + fi * 1.55 + h.x * 6.28318) * warpAmt +
      0.16 * u_warp * fbm(rp * 0.65 + sA + fi * 3.7, max(1.8, oct - 0.8), gain);

    float offset = (fi - 2.0) * 0.30 + (h.y - 0.5) * 0.14;
    float sd = rp.y - (offset + spine);

    float halfWidth = mix(0.14, 0.28, h.x);
    float edgeBlur = mix(0.012, 0.085, u_softness) * (0.75 + 0.40 * (fi / 4.0));

    float inside = 1.0 - smoothstep(halfWidth - edgeBlur, halfWidth + edgeBlur, abs(sd));

    // Sleek, thin optical glass caustic rim (never overly thick/washed out)
    float rimWidth = mix(0.009, 0.038, u_softness);
    float topRim = exp(-pow((sd - halfWidth * 0.88) / rimWidth, 2.0));
    float botRim = exp(-pow((sd + halfWidth * 0.88) / (rimWidth * 1.4), 2.0)) * 0.45;

    // Chromatic glass refraction shift across the ribbon thickness
    float normPos = clamp(sd / max(halfWidth, 0.001), -1.0, 1.0);
    float refractT = clamp(
      (fi / 4.0) * 0.66 + (normPos * 0.20 + 0.20) + 0.10 * frostWave,
      0.0, 1.0
    );
    vec3 glassTint = samplePaletteLinear(refractT, c0, c1, c2, c3);
    vec3 refractedShift = samplePaletteLinear(clamp(refractT + 0.14 * normPos, 0.0, 1.0), c1, c2, c3, c0);

    // Subtle frosted internal illumination
    float sheen = smoothstep(-0.75, 0.95, normPos) * 0.18 * u_contrast;
    vec3 ribbonBody = mix(col, mix(glassTint, refractedShift, 0.38), 0.58);
    ribbonBody = screenBlend(ribbonBody, mix(c0, vec3(0.95), 0.45) * sheen);

    // Soft glass shadow underneath each overlapping ribbon for genuine 3D depth
    float shadow = exp(-pow((sd + halfWidth * 1.10) / (edgeBlur * 2.2 + 0.045), 2.0)) * 0.18 * u_contrast;
    col *= (1.0 - shadow);

    // Composite translucent glass sheet
    col = mix(col, ribbonBody, inside * (0.68 + 0.14 * (fi / 4.0)));

    // Crisp luminous optical rim using non-clipping screen blend
    vec3 rimCol = mix(glassTint, vec3(1.0), 0.55);
    float rimGlow = (topRim * 0.36 + botRim * 0.16) * (0.45 + 0.45 * u_contrast);
    col = screenBlend(col, rimCol * rimGlow);
  }

  float cScale = mix(0.86, 1.24, clamp(u_contrast * 0.5, 0.0, 1.0));
  col = (col - 0.48) * cScale + 0.48;
  return clamp(col, 0.0, 1.0);
}

// -------------------------------------------------------------------------
// MANDATORY ANTI-BANDING: Triangular-PDF Interleaved Gradient Noise Dithering
// Evaluated in exact global pixel coordinates (100% tile-invariant at 8K!)
// -------------------------------------------------------------------------
float ign(vec2 pixelCoord) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(pixelCoord, magic.xy)));
}

vec3 applyTriangularDither(vec3 srgbColor, vec2 globalPixelCoord, float strength) {
  if (strength <= 0.001) return srgbColor;

  vec2 gc = mod(globalPixelCoord, 4096.0);

  float r1 = ign(gc);
  float r2 = ign(gc + vec2(47.0, 17.0));
  float g1 = ign(gc + vec2(13.0, 89.0));
  float g2 = ign(gc + vec2(71.0, 31.0));
  float b1 = ign(gc + vec2(97.0, 53.0));
  float b2 = ign(gc + vec2(29.0, 67.0));

  vec3 tri = vec3(r1 + r2 - 1.0, g1 + g2 - 1.0, b1 + b2 - 1.0);
  return clamp(srgbColor + tri * (1.25 / 255.0) * strength, 0.0, 1.0);
}

void main() {
  vec2 globalFragCoord = u_tileOffset + gl_FragCoord.xy;
  float minDim = min(u_fullResolution.x, u_fullResolution.y);
  vec2 p = (globalFragCoord - 0.5 * u_fullResolution) / minDim;

  p = rot2d(u_rotation) * p * u_scale;

  vec3 c0 = srgbToLinear(u_color0);
  vec3 c1 = srgbToLinear(u_color1);
  vec3 c2 = srgbToLinear(u_color2);
  vec3 c3 = srgbToLinear(u_color3);

  vec3 linearCol;
  if (u_mode == 0) {
    linearCol = renderEtherealSilk(p, c0, c1, c2, c3);
  } else if (u_mode == 1) {
    linearCol = renderLiquidMarble(p, c0, c1, c2, c3);
  } else if (u_mode == 2) {
    linearCol = renderAuroraMist(p, c0, c1, c2, c3);
  } else {
    linearCol = renderFrostedRibbons(p, c0, c1, c2, c3);
  }

  vec3 srgbCol = linearToSrgb(linearCol);
  srgbCol = applyTriangularDither(srgbCol, globalFragCoord, u_dither);

  fragColor = vec4(srgbCol, 1.0);
}
`;

  global.StockFlowShaders = {
    PATTERN_MODES,
    VERTEX_SHADER,
    FRAGMENT_SHADER
  };
})(window);
