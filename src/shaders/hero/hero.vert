uniform vec2 uPointer;   // -1..1, position of the cursor on the sheet
uniform float uTime;
uniform float uEnter;    // 0..1 intro reveal

varying vec2 vUv;
varying float vDent;

void main() {
  vUv = uv;
  vec3 p = position;

  // the sheet dips under the cursor
  vec2 m = uPointer * vec2(8.0, 5.0);
  float d = distance(p.xy, m);
  float dent = exp(-d * d * 0.5) * 0.9 * uEnter;

  // barely-there resting motion, so a still sheet is not quite dead
  float breathe = sin(p.x * 1.4 + uTime * 0.35) * 0.03
                + cos(p.y * 1.7 - uTime * 0.28) * 0.03;

  p.z -= dent;
  p.z += breathe * uEnter;

  vDent = dent;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
