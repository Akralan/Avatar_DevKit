// Bruit procédural de la révélation. Trois briques standard : simplex noise
// (Ashima Arts, MIT), fBm, puis domain warping — c'est cette dernière étape,
// et elle seule, qui transforme des taches en veines.
//
// Extrait de `noise.ts`, où il vivait dans un gabarit TypeScript.

// Octaves du fBm. 2 suffisent : le grain est vu à travers une enveloppe
// étroite, les octaves suivantes coûtent sans se voir. La borne d'une boucle
// doit être constante à la compilation en GLSL ES 1.00, d'où le #define.
#define FBM_OCTAVES 2

// Déplacement du domaine, en unités de bruit. Au-delà de ~0.8, les volutes se
// replient sur elles-mêmes et le champ redevient du bruit.
#define WARP_STRENGTH 0.6


vec3 revealMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 revealMod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 revealPermute(vec3 x) { return revealMod289(((x * 34.0) + 1.0) * x); }

// Simplex noise 2D — Ashima Arts / Ian McEwan, MIT. Sortie dans ~[-1, 1].
float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,  // (3 - sqrt(3)) / 6
    0.366025403784439,  // (sqrt(3) - 1) / 2
    -0.577350269189626, // -1 + 2 * C.x
    0.024390243902439   // 1 / 41
  );

  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = revealMod289(i);
  vec3 p = revealPermute(
    revealPermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  // Normalisation des gradients, approximée : sqrt inverse au premier ordre.
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;

  return 130.0 * dot(m, g);
}

/** fBm : lacunarité 2, gain 0.5 — le spectre en 1/f des textures naturelles. */
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int octave = 0; octave < FBM_OCTAVES; octave++) {
    value += amplitude * snoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }

  return value;
}

/** fBm à domaine déformé : des veines, là où le fBm nu ne donne que des taches. */
float warpedFbm(vec2 p) {
  vec2 offset = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  return fbm(p + WARP_STRENGTH * offset);
}
