precision highp float;

uniform vec2 uResolution;
uniform sampler2D uTex;
uniform float uHasTex;     // 1 once the concrete texture has loaded
uniform float uTexMix;     // 0 = off-white paper, 1 = concrete (scroll-driven)
uniform float uViewAspect; // uResolution.x / uResolution.y
uniform float uTexAspect;  // texture width / height

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 289.13))) * 43758.545);
}

void main() {
  vec2 uv = vUv;
  float m = uHasTex * clamp(uTexMix, 0.0, 1.0); // 0 -> paper, 1 -> concrete

  // paper: off-white + a faint radial vignette
  vec3 paper = vec3(0.937, 0.930, 0.902);
  paper -= (1.0 - smoothstep(1.2, 0.15, distance(uv, vec2(0.5)))) * 0.03;

  // concrete: cover-fit the texture without distorting it. NO radial vignette here
  // — the door-cube faces can sample past the 0..1 edge and clamp-stretch it, which
  // reads as a bowed dark band.
  vec2 c = uv - 0.5;
  if (uViewAspect > uTexAspect) c.y *= uTexAspect / uViewAspect;
  else c.x *= uViewAspect / uTexAspect;
  vec3 concrete = texture2D(uTex, c + 0.5).rgb;

  vec3 base = mix(paper, concrete, m);
  float grain = (hash(uv * uResolution * 0.5) - 0.5) * mix(0.028, 0.012, m);

  gl_FragColor = vec4(base + grain, 1.0);
}
