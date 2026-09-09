precision highp float;

uniform sampler2D uText;     // lockup: white glyphs, coverage in .a
uniform sampler2D uField;    // heat in .r
uniform vec2 uResolution;
uniform vec2 uTextScale;     // fraction of screen the lockup occupies
uniform float uTime;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 289.13))) * 43758.545);
}

float glyph(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uText, uv).a;
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uResolution;

  float heat = clamp(texture2D(uField, uv).r, 0.0, 1.0);

  // heat gradient — the direction the metal flows
  float hL = texture2D(uField, uv - vec2(px.x, 0.0)).r;
  float hR = texture2D(uField, uv + vec2(px.x, 0.0)).r;
  float hD = texture2D(uField, uv - vec2(0.0, px.y)).r;
  float hU = texture2D(uField, uv + vec2(0.0, px.y)).r;
  vec2 grad = vec2(hR - hL, hU - hD);

  // ---- lockup coordinates -------------------------------------------
  vec2 tuv = (uv - 0.5) / uTextScale + 0.5;

  // molten displacement: pushed along the heat gradient, plus a boil
  float flow = heat * heat;
  vec2 boil = vec2(
    sin(uv.y * 26.0 + uTime * 1.7),
    cos(uv.x * 22.0 - uTime * 1.9)
  ) * 0.0022 * flow;
  vec2 disp = grad * flow * 2.6 + boil;

  // chromatic split across the flow direction, only where hot
  vec2 ca = normalize(grad + vec2(1e-5)) * heat * 0.011;

  float tr = glyph(tuv - disp + ca);
  float tg = glyph(tuv - disp);
  float tb = glyph(tuv - disp - ca);

  // pseudo-normal from the glyph edge + heat, for a liquid-metal read
  float e = 0.0016;
  float nx = glyph(tuv + vec2(e, 0.0)) - glyph(tuv - vec2(e, 0.0));
  float ny = glyph(tuv + vec2(0.0, e)) - glyph(tuv - vec2(0.0, e));
  vec3 n = normalize(vec3(-(nx * 2.4 + grad.x * 7.0), -(ny * 2.4 + grad.y * 7.0), 1.0));

  // chrome matcap, faked from the normal
  float t = n.y * 0.5 + 0.5;
  vec3 chrome = mix(vec3(0.06, 0.07, 0.09), vec3(0.93, 0.95, 1.0), smoothstep(0.12, 0.5, t));
  chrome = mix(chrome, vec3(1.0), smoothstep(0.60, 0.64, t));          // sky highlight band
  chrome += pow(max(0.0, n.x), 4.0) * 0.35;                            // side kick
  chrome += pow(max(0.0, -n.x), 6.0) * 0.15;

  // rest state: normal black wordmark. only the cursor's heat turns it to chrome.
  vec3 ink = vec3(0.065, 0.065, 0.05);
  vec3 letter = mix(ink, chrome, smoothstep(0.05, 0.5, heat));

  // paper
  float grain = (hash(uv * uResolution * 0.5) - 0.5) * 0.028;
  float vig = smoothstep(1.2, 0.15, distance(uv, vec2(0.5)));
  vec3 paper = vec3(0.937, 0.930, 0.902) + grain - (1.0 - vig) * 0.03;

  // compose: green channel carries the body, r/b add the fringe
  vec3 col = mix(paper, letter, tg);
  col.r = mix(col.r, letter.r, max(tr - tg, 0.0));
  col.b = mix(col.b, letter.b, max(tb - tg, 0.0));
  col.r -= max(tg - tr, 0.0) * 0.35;
  col.b -= max(tg - tb, 0.0) * 0.35;

  gl_FragColor = vec4(col, 1.0);
}
