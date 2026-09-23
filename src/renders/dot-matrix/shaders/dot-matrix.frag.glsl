
#include <packing>

uniform sampler2D uNormalTexture;
uniform sampler2D uDepthTexture;
uniform sampler2D uGlyphAtlas;

uniform vec2 uResolution;
uniform float uGridColumns;
uniform float uDotRadius;
uniform float uDotSoftness;
uniform float uBaseOpacity;
uniform float uAmbient;
uniform float uNormalInfluence;
uniform float uDepthInfluence;
uniform float uEdgeInfluence;
uniform float uBackgroundOpacity;
uniform float uNear;
uniform float uFar;
uniform float uMode;
uniform float uDither;
uniform float uGlyphCount;
/** Bornes de la diagonale écran sur l'emprise projetée du sujet (min, max). */
uniform vec2 uGradientRange;
uniform vec3 uDotColorStart;
uniform vec3 uDotColorEnd;
uniform vec3 uGridDotColor;
uniform vec3 uLightDirection;

varying vec2 vUv;

// Fond du render target : profondeur laissée à sa valeur de clear (1.0).
float sampleBodyMask(vec2 uv) {
  return 1.0 - step(0.99999, texture2D(uDepthTexture, uv).x);
}

// Bayer 4x4 analytique : GLSL ES 1.00 interdit l'indexation dynamique d'un
// tableau en fragment shader, la version « matrix[index] » ne compile pas.
float bayer2(vec2 cell) {
  cell = floor(cell);
  return fract(cell.x * 0.5 + cell.y * cell.y * 0.75);
}

float bayer4(vec2 cell) {
  return bayer2(cell * 0.5) * 0.25 + bayer2(cell);
}

// Rampe de glyphes du plus clair au plus dense : l'indice encode l'ombrage,
// l'atlas est une bande horizontale de tuiles carrées.
float sampleGlyph(vec2 cellLocal, float level) {
  float index = floor(level * (uGlyphCount - 1.0) + 0.5);
  vec2 local = cellLocal + 0.5;
  return texture2D(
    uGlyphAtlas,
    vec2((index + local.x) / uGlyphCount, local.y)
  ).a;
}

void main() {
  float aspect = uResolution.x / uResolution.y;

  // Lignes dérivées de l'aspect ratio pour garder des cellules carrées.
  vec2 gridSize = vec2(uGridColumns, uGridColumns / aspect);

  vec2 gridPosition = vUv * gridSize;
  vec2 cellLocal = fract(gridPosition) - 0.5;

  // Toutes les données 3D sont échantillonnées au centre de la cellule : c'est
  // ce qui rend la grille indépendante de la géométrie du corps.
  vec2 cellIndex = floor(gridPosition);
  vec2 sampleUv = (cellIndex + 0.5) / gridSize;

  float rawDepth = texture2D(uDepthTexture, sampleUv).x;
  float bodyMask = 1.0 - step(0.99999, rawDepth);

  // MeshNormalMaterial encode les normales vue en 0..1.
  vec3 normal = normalize(
    texture2D(uNormalTexture, sampleUv).xyz * 2.0 - 1.0
  );
  float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);

  // near/far sont serrés autour du sujet (cf. renderer) : la profondeur
  // linéarisée s'étale donc réellement sur le corps.
  float viewZ = perspectiveDepthToViewZ(rawDepth, uNear, uFar);
  float linearDepth = viewZToOrthographicDepth(viewZ, uNear, uFar);
  float proximity = 1.0 - clamp(linearDepth, 0.0, 1.0);

  // Contour détecté sur la grille elle-même, pas sur le mesh.
  vec2 texel = 1.0 / gridSize;
  float neighborAverage = (
    sampleBodyMask(sampleUv - vec2(texel.x, 0.0)) +
    sampleBodyMask(sampleUv + vec2(texel.x, 0.0)) +
    sampleBodyMask(sampleUv + vec2(0.0, texel.y)) +
    sampleBodyMask(sampleUv - vec2(0.0, texel.y))
  ) * 0.25;
  float edge = bodyMask * (1.0 - neighborAverage);

  float shading =
    uAmbient +
    diffuse * uNormalInfluence +
    proximity * uDepthInfluence +
    edge * uEdgeInfluence;

  float bodyOpacity = bodyMask * clamp(uBaseOpacity + shading, 0.0, 1.0);

  if (uDither > 0.5) {
    // Re-multiplié par bodyMask : bayer4 vaut 0 sur une cellule sur seize, ce
    // qui allumerait des dots parasites dans le fond.
    bodyOpacity = bodyMask * step(bayer4(cellIndex), bodyOpacity);
  }

  float backgroundOpacity = (1.0 - bodyMask) * uBackgroundOpacity;
  float presence = max(bodyOpacity, backgroundOpacity);

  float softness = max(uDotSoftness, 0.001);
  float alpha;

  if (uMode > 1.5) {
    // ASCII : c'est la densité du glyphe qui porte l'ombrage, pas l'opacité —
    // moduler les deux au même rythme réduit les caractères en bouillie.
    // L'ombrage est renormalisé sur son amplitude utile, sinon la rampe se
    // tasse sur ses derniers glyphes et tout le corps vire au « @ ».
    float level = bodyMask * clamp(
      shading / max(uAmbient + uNormalInfluence, 0.001),
      0.0,
      1.0
    );
    alpha = sampleGlyph(cellLocal, level) * mix(0.55, 1.0, level);
  } else if (uMode > 0.5) {
    // Barres : c'est la longueur qui révèle le volume, l'épaisseur reste fixe.
    float halfWidth = mix(0.06, 0.44, clamp(shading * bodyMask, 0.0, 1.0));
    vec2 distanceToBox = abs(cellLocal) - vec2(halfWidth, uDotRadius * 0.3);
    float outside = length(max(distanceToBox, 0.0));
    alpha = (1.0 - smoothstep(0.0, softness, outside)) * presence;
  } else {
    // Dots : taille strictement constante, seule l'opacité varie.
    float dotMask = 1.0 - smoothstep(
      uDotRadius,
      uDotRadius + softness,
      length(cellLocal)
    );
    alpha = dotMask * presence;
  }

  if (alpha < 0.002) discard;

  // Dégradé sur la diagonale écran, haut gauche → bas droite : il appartient
  // au cadre, pas au sujet, et ne tourne donc pas avec lui. Évalué au centre
  // de la cellule comme le reste — un dot = une couleur pleine.
  float diagonal = (sampleUv.x + (1.0 - sampleUv.y)) * 0.5;

  // Ramené sur l'emprise écran du sujet (uniform recalculé par le renderer) :
  // sur un corps haut et étroit, la diagonale plein cadre resterait coincée
  // au milieu de la plage et aucune des deux couleurs ne serait atteinte.
  float gradient = clamp(
    (diagonal - uGradientRange.x) /
      max(uGradientRange.y - uGradientRange.x, 0.0001),
    0.0,
    1.0
  );
  vec3 bodyColor = mix(uDotColorStart, uDotColorEnd, gradient);

  // bodyMask est binaire : ce mix sélectionne, il n'interpole pas.
  gl_FragColor = vec4(mix(uGridDotColor, bodyColor, bodyMask), alpha);
}
