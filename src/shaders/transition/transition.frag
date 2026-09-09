precision highp float;

uniform sampler2D tPrev;   // frozen last frame of the room we are leaving
uniform float uProgress;   // 0 -> 1
uniform float uAspect;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec4 prev = texture2D(tPrev, vUv);

  // diagonal sweep, roughened so the edge is not a clean line
  vec2 uv = vUv;
  uv.x *= uAspect;
  float gradient = (uv.x + uv.y) / (1.0 + uAspect);
  gradient += (noise(vUv * 6.0) - 0.5) * 0.35;

  float edge = 0.16;
  float mask = smoothstep(uProgress - edge, uProgress + edge, gradient);

  // the leaving frame holds, then tears away along the sweep
  gl_FragColor = vec4(prev.rgb, prev.a * (1.0 - mask));
}
