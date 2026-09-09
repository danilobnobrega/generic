precision highp float;

uniform vec3 uPaper;
uniform float uEnter;

varying vec2 vUv;
varying float vDent;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  // paper grain
  float grain = (hash(vUv * 900.0) - 0.5) * 0.03;

  // soft page vignette
  float vig = smoothstep(1.15, 0.15, distance(vUv, vec2(0.5)));

  // the dent reads as a shallow grey depression
  vec3 col = uPaper + grain - vDent * 0.20 - (1.0 - vig) * 0.035;

  // intro: the sheet fades up from flat white
  col = mix(vec3(1.0), col, clamp(uEnter, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
