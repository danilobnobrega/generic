precision highp float;

uniform vec2 uResolution;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 289.13))) * 43758.545);
}

void main() {
  vec2 uv = vUv;

  // the off-white ground the sign is mounted on — grain + a faint vignette
  float grain = (hash(uv * uResolution * 0.5) - 0.5) * 0.028;
  float vig = smoothstep(1.2, 0.15, distance(uv, vec2(0.5)));
  vec3 paper = vec3(0.937, 0.930, 0.902) + grain - (1.0 - vig) * 0.03;

  gl_FragColor = vec4(paper, 1.0);
}
