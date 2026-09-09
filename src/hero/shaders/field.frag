precision highp float;

uniform sampler2D uPrev;
uniform vec2 uPointer;      // 0..1, texture space
uniform vec2 uPrevPointer;
uniform float uAspect;
uniform float uDown;
uniform float uActive;      // 0 when pointer has never moved / left the window

varying vec2 vUv;

// distance from point p to segment a-b
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;

  // decay + gentle upward drift, like heat rising off the strokes
  float prev = texture2D(uPrev, uv).r * 0.955;
  float drift = texture2D(uPrev, uv + vec2(0.0, 0.0018)).r * 0.955;
  float f = mix(prev, drift, 0.28);

  // paint along the cursor's travel this frame
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec2 a = vec2(uPrevPointer.x * uAspect, uPrevPointer.y);
  vec2 b = vec2(uPointer.x * uAspect, uPointer.y);
  float d = segDist(p, a, b);
  float brush = smoothstep(0.13, 0.0, d) * (0.55 + uDown * 0.45) * uActive;

  f = max(f, brush);

  gl_FragColor = vec4(clamp(f, 0.0, 1.0), 0.0, 0.0, 1.0);
}
