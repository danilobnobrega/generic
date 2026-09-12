precision highp float;

// The chapter tunnel — the automatic ride after the wormhole. One tube, one
// shader: four looks (dark faceted metal, green digital wireframe grid, purple
// fractal energy, red fractal energy) that the TS sequencer crossfades between
// (uLookA -> uLookB by uBlend). Being one continuous surface is what makes the
// transitions seamless — never a cut between separate objects.
//
// Realism note (lusion.co's own tunnel scene, reverse-engineered): what sells
// their material isn't clever noise math, it's a MATCAP — a per-pixel normal
// looked up against a pre-lit studio capture, so brightness tracks a light
// direction instead of being random per cell — plus a cinematic grade (filmic
// tonemap, split tone, vignette) over the final image. Both are cheap and don't
// need an external texture: proceduralMatcap() below fakes the studio capture
// with math, and grade() at the end of main() is the LUT-style pass.

varying vec2 vUv; // x = around the tube (0..1), y = along its length (0..1)

uniform float uTime;
uniform float uLookA;
uniform float uLookB;
uniform float uBlend;
uniform vec2 uResolution;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}

// a studio-lit material capture, faked with math instead of a texture: darker
// toward the rim (like light falling off a sphere), a hard specular hotspot up
// and to the left (the classic 3-point-light position), a soft cool rim
// opposite it. Indexed by a fake surface normal exactly like a real matcap is.
vec3 proceduralMatcap(vec2 nrm, vec3 base, vec3 hot) {
  vec2 c = nrm * 0.5; // nrm already -1..1-ish; keep the hotspot readable
  float r = length(c);
  vec3 col = base * mix(0.22, 1.0, smoothstep(0.55, 0.05, r));
  float spec = smoothstep(0.30, 0.0, length(c - vec2(-0.22, 0.20)));
  col += hot * spec;
  float rim = smoothstep(0.26, 0.0, length(c - vec2(0.26, -0.24)));
  col += vec3(0.55, 0.65, 0.85) * rim * 0.35;
  return col;
}

// ---- look 0: dark faceted metal, lit like real panels, neon cracks -------
vec3 lookMetal(vec2 uv, float t) {
  vec2 p = vec2(uv.x * 10.0, uv.y * 3.0 - t * 0.6);
  vec2 gi = floor(p);
  float minD = 1e9;
  vec2 minCell = gi;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = gi + vec2(float(x), float(y));
      vec2 o = vec2(hash21(g), hash21(g + 7.7));
      float d = length(g + o - p);
      if (d < minD) { minD = d; minCell = g; }
    }
  }
  // each facet gets a fixed random tilt — a real (fake) surface normal, not a
  // random colour — so the matcap lookup below reads as actual panels catching
  // light at different angles, the way the reference does
  vec2 facetN = vec2(hash21(minCell + 2.2), hash21(minCell + 5.5)) * 2.0 - 1.0;
  float rough = 0.55 + 0.45 * hash21(minCell + 1.3);

  vec3 steel = vec3(0.05, 0.055, 0.07);
  vec3 hot = vec3(1.0, 0.97, 0.9);
  vec3 col = proceduralMatcap(facetN, steel, hot) * rough;

  float crack = smoothstep(0.16, 0.02, minD);
  vec3 crackCol = mix(vec3(1.0, 0.18, 0.14), vec3(0.15, 0.85, 0.95), step(0.5, hash21(minCell)));
  col += crackCol * crack * 1.4;
  return col;
}

// ---- look 1: green digital wireframe grid --------------------------------
vec3 lookGrid(vec2 uv, float t) {
  float along = uv.y * 10.0 - t * 1.2;
  float ring = smoothstep(0.06, 0.0, abs(fract(along) - 0.5) - 0.46);
  float around = uv.x * 24.0;
  float radial = smoothstep(0.06, 0.0, abs(fract(around) - 0.5) - 0.46);
  float dotL = step(0.94, fract(around)) * step(0.9, fract(along));
  float g = max(max(ring, radial) * 0.55, dotL);
  // a soft glow riding under the crisp lines — reads less like flat vector art
  float glow = exp(-abs(fract(along) - 0.5) * 8.0) * 0.25;
  return vec3(0.12, 1.0, 0.32) * (g + glow);
}

// ---- looks 2 & 3: fractal swirl energy, shared pattern / different palette
vec3 lookEnergy(vec2 uv, float t, vec3 colA, vec3 colB, vec3 hot) {
  vec2 p = vec2(uv.x * 6.2831853, uv.y * 4.0 - t * 0.8);
  vec2 warp = vec2(fbm(p * 0.6 + 3.0), fbm(p * 0.6 - 1.0));
  float n = fbm(p * 1.4 + warp * 2.0);
  float bands = fbm(vec2(p.x * 2.0, p.y * 3.0 - t * 1.4));
  float v = pow(clamp(n * 0.6 + bands * 0.4, 0.0, 1.0), 1.4);
  vec3 col = mix(colA, colB, v);
  col += hot * smoothstep(0.72, 0.86, bands) * 0.8;
  return col;
}

vec3 look(float idx, vec2 uv, float t) {
  if (idx < 0.5) return lookMetal(uv, t);
  if (idx < 1.5) return lookGrid(uv, t);
  if (idx < 2.5) return lookEnergy(uv, t, vec3(0.05, 0.02, 0.12), vec3(0.38, 0.16, 0.58), vec3(0.85, 0.55, 1.0));
  return lookEnergy(uv, t, vec3(0.10, 0.01, 0.01), vec3(0.55, 0.08, 0.05), vec3(1.0, 0.45, 0.25));
}

// the "LUT" pass: filmic tonemap + a cool-shadow/warm-highlight split tone +
// vignette. Cheap, no texture, but it's what actually reads as "graded", not raw.
vec3 grade(vec3 c, vec2 fragCoord) {
  c = c / (c + vec3(0.9));
  c = mix(c, smoothstep(0.0, 1.0, c), 0.35);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c * vec3(0.92, 0.97, 1.08), c * vec3(1.06, 1.0, 0.9), smoothstep(0.15, 0.75, l));
  vec2 uv = fragCoord / uResolution;
  float vig = 1.0 - smoothstep(0.25, 0.95, length(uv - 0.5));
  c *= mix(0.55, 1.0, vig);
  return c;
}

void main() {
  vec3 a = look(uLookA, vUv, uTime);
  vec3 b = look(uLookB, vUv, uTime);
  vec3 col = mix(a, b, uBlend);
  col = grade(col, gl_FragCoord.xy);
  gl_FragColor = vec4(col, 1.0);
}
