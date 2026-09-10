precision highp float;

// Procedural face-on spiral galaxy — baked once to a texture (see bakeWormhole).
// Cool blue-grey swirled filaments on a logarithmic spiral, rose-pink HII knots,
// a dense star field, dark dust lanes, a compact hot core. The disc mesh leans it
// back and spins it (the reference model is a rotating textured plane).

varying vec2 vUv;

#define ARMS 2.0
#define TWIST 2.2

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

void main() {
  vec2 uv = (vUv - 0.5) * 2.0; // -1..1
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // spiral phase — winds with radius. Sampling noise on vec2(cos,sin) of this
  // phase (radius encoded in the circle radius) keeps it seamless across a = +-PI.
  float ang = a + TWIST * log(r + 0.05);
  vec2 warp = vec2(fbm(uv * 2.0 + 3.0), fbm(uv * 2.0 - 1.0)) * 0.30;

  float disc = smoothstep(1.12, 0.10, r) * smoothstep(0.0, 0.055, r);
  float body = disc * smoothstep(1.05, 0.12, r);

  vec2 sc = vec2(cos(ang), sin(ang));
  vec2 c1 = sc * (1.0 + r * 7.0);
  vec2 c2 = sc * (1.0 + r * 15.0);
  vec2 c3 = sc * (1.0 + r * 24.0);
  vec2 c4 = sc * (1.0 + r * 12.0);
  vec2 c5 = sc * (1.0 + r * 9.0);

  float f1 = fbm(c1 * 2.2 + warp.x);
  float f2 = fbm(c2 * 1.3 + vec2(0.0, 4.0));
  float filaments = clamp((0.55 * f1 + 0.45 * f2) * 1.75 - 0.38, 0.0, 1.0);
  float armBroad = 0.35 + 0.65 * (0.5 + 0.5 * cos(ang * ARMS + 0.4));
  float density = body * (0.16 + 1.5 * filaments * armBroad);

  float arcs = smoothstep(0.60, 0.78, fbm(c3 * 1.1)) * body * smoothstep(1.0, 0.14, r);
  float dust = smoothstep(0.55, 0.82, fbm(c4 * 1.6 + vec2(1.7, -2.0))) * body * smoothstep(0.95, 0.20, r) * 0.85;

  vec3 steel = vec3(0.33, 0.39, 0.52);
  vec3 pale = vec3(0.63, 0.68, 0.82);
  float lum = clamp(density * 1.35, 0.0, 1.0);
  vec3 col = mix(steel, pale, lum) * density;
  col += vec3(0.74, 0.80, 0.96) * arcs * 0.55;
  col *= 1.0 - 0.9 * dust;

  float hii = smoothstep(0.64, 0.80, fbm(c5 * 1.4 + vec2(9.0, -3.0))) * smoothstep(0.95, 0.12, r) * body * (0.35 + filaments);
  col += vec3(0.98, 0.42, 0.55) * hii * 1.25;

  // star field — jittered grid, denser on the arms and toward the core
  float sdens = 0.30 + 1.7 * density + 1.5 * smoothstep(0.5, 0.0, r);
  vec2 cell = uv * 300.0;
  vec2 ci = floor(cell);
  float star = 0.0;
  vec3 starCol = vec3(0.0);
  if (hash21(ci) < 0.11 * sdens) {
    vec2 jit = (vec2(hash21(ci + 2.1), hash21(ci + 6.7)) - 0.5) * 0.7;
    float d = length(fract(cell) - 0.5 - jit);
    float mag = hash21(ci + 1.7);
    star = smoothstep(0.28, 0.0, d) * (0.25 + 0.9 * mag * mag);
    starCol = mix(vec3(1.0, 0.88, 0.78), vec3(0.80, 0.87, 1.0), hash21(ci + 4.3)) * star;
  }
  col += starCol * disc * 1.15;

  // compact hot core
  float hot = smoothstep(0.045, 0.0, r);
  vec3 coreCol = mix(vec3(1.0, 0.90, 0.74), vec3(1.0, 0.99, 0.97), hot);
  float core = smoothstep(0.12, 0.0, r);
  col += coreCol * (pow(core, 1.7) * 1.7 + smoothstep(0.26, 0.0, r) * 0.22);

  col *= max(smoothstep(1.18, 0.5, r), core); // vignette to black, keep the core

  float fs = step(0.9975, hash21(ci + 19.0)) * smoothstep(0.78, 1.25, r);
  col += vec3(0.70, 0.75, 0.92) * fs * 0.40;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
