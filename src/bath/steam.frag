precision highp float;

uniform sampler2D uScene;
uniform float uProgress; // 0 = fully fogged (looks like flat white), 1 = clear
uniform float uTime;
uniform vec2 uRes;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec3 scene = texture2D(uScene, uv).rgb;

  float aspect = uRes.x / uRes.y;
  vec2 q = vec2(uv.x * aspect, uv.y);

  // slow upward-drifting steam, domain-warped for a wispy feel
  float t = uTime * 0.02;
  float warp = fbm(q * 1.3 - vec2(0.0, t * 1.6));
  float wisp = fbm(q * 2.2 + vec2(warp, -t * 3.0));
  float billow = fbm(q * 0.9 + vec2(t * 0.4, -t * 0.7));

  // the "cleared" front rises from below the frame to above it with scroll
  float front = uProgress * 1.7 - 0.4;
  float soft = 0.20 + billow * 0.22;
  float wobble = (wisp - 0.5) * 0.5;
  float fog = smoothstep(front - soft, front + soft, uv.y + wobble);

  // even the fogged area is never a dead flat white — it churns, and stays just
  // shy of opaque so there's a faint sense of something behind it
  float density = fog * (0.86 + 0.08 * (0.5 + 0.5 * billow));
  density = clamp(density, 0.0, 0.93);

  // steam scatters the room light — a touch brighter where the scene is lit
  float lit = clamp(dot(scene, vec3(0.333)) - 0.55, 0.0, 0.35);
  vec3 steamCol = vec3(0.955, 0.955, 0.948) + lit * 0.35 + (fbm(q * 4.0 + t) - 0.5) * 0.015;

  vec3 col = mix(scene, steamCol, density);
  gl_FragColor = vec4(col, 1.0);
}
