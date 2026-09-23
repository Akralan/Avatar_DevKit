
${NOISE_GLSL}

uniform sampler2D uNormalTexture;
uniform sampler2D uDepthTexture;

uniform vec2 uResolution;
uniform float uGridColumns;
uniform float uDotRadius;
uniform float uDotSoftness;
uniform float uBaseOpacity;
uniform float uAmbient;
uniform float uNormalInfluence;
uniform float uEdgeInfluence;
uniform float uBackgroundOpacity;
uniform float uOpacity;
uniform float uTime;

/** Rayon du front de propagation, en hauteurs de sujet. */
uniform float uRevealRadius;
/** Germes, en UV écran — reprojetés à chaque frame, ils suivent la pose. */
uniform vec2 uSeeds[SEED_COUNT];
/** Hauteur écran du sujet, en fractions de largeur de cadre. */
uniform float uSubjectHeight;
/** Emprise verticale du sujet en UV (bas, haut) : l'axe du corps. */
uniform vec2 uSubjectSpan;
/** Décharges : (x depuis l'axe médian, y sur l'axe, rayon, amplitude). */
uniform vec4 uDischarges[DISCHARGE_COUNT];

/** Bornes de la diagonale écran sur l'emprise projetée du sujet (min, max). */
uniform vec2 uGradientRange;
uniform vec3 uDotColorStart;
uniform vec3 uDotColorEnd;
uniform vec3 uGridDotColor;
uniform vec3 uLightDirection;

varying vec2 vUv;

// Toutes les mesures du front sont en hauteurs de sujet : le front garde la
// même allure quelle que soit la taille à laquelle le corps est cadré.
const float FRONT_BAND = 0.05;   // adoucissement de la limite révélé/éteint
const float FRONT_JITTER = 0.05; // bruit par cellule — sinon le front est un cercle parfait
const float FRONT_CREST = 0.11;  // épaisseur de la crête qui suit le front
const float FRONT_SWELL = 0.45;  // grossissement du dot sur la crête
const float FRONT_GLOW = 0.35;   // renfort d'opacité sur la crête

// --- Décharges ---------------------------------------------------------------
// Deux échelles, et la distinction est tout l'effet :
//   · la **zone** est continue et lente — elle dit *où* l'énergie passe ;
//   · le **glitch** est tiré par cellule et par palier de temps — il dit
//     *lesquelles* des cellules réagissent, et à quelle intensité chacune.
// Tout ce qui est visible se joue au dot. La zone ne fait que doser.

const float ZONE_WARP = 0.32;       // irrégularité du contour, en rayons
const float ZONE_WARP_SCALE = 9.0;
const float ZONE_DRIFT = 0.6;
const float VEIN_SCALE = 7.0;       // modulation lente interne à la zone
const float VEIN_DRIFT = 0.4;
const float ZONE_GLOW = 0.22;
const float ZONE_TINT = 0.28;

const float GLITCH_RATE = 22.0;     // redistributions par seconde
const float GLITCH_DENSITY = 0.9;  // part des dots qui décrochent, au cœur de la zone
const float GLITCH_JITTER = 0.55;   // déplacement dans la cellule
const float GLITCH_SIZE = 0.9;      // modulation de taille, signée
const float GLITCH_TINT = 0.5;

/**
 * Modulation d'opacité, signée et volontairement forte. C'est l'effet qui porte
 * tout le reste : sur la peau éclairée l'opacité sature déjà à 1, un dot qui
 * « brûle » ne peut donc pas se voir — seul un dot qui **s'éteint** se
 * remarque. Le grésillement se lit en négatif.
 */
const float GLITCH_FLICKER = 1.4;

const float HALO_SCALE = 2.6;       // rayon du halo, en rayons de dot
const float HALO_CAP = 0.45;        // ... plafonné à la cellule : un halo reste rond
const float HALO_ALPHA = 0.45;

/**
 * Plafond du rayon d'un dot, crête et décharge comprises. Au-delà d'une
 * demi-cellule les dots se touchent : la trame se referme en aplat et tout ce
 * qui faisait lire « matrice de points » disparaît au moment précis où l'effet
 * est censé se remarquer.
 */
const float DOT_RADIUS_CAP = 0.44;

// Fond du render target : profondeur laissée à sa valeur de clear (1.0).
float sampleBodyMask(vec2 uv) {
  return 1.0 - step(0.99999, texture2D(uDepthTexture, uv).x);
}

float hash(vec2 cell) {
  return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
}

/**
 * Intensité cumulée des décharges en un point du corps. Noyau gaussien à
 * contour bruité : la réponse décroît continûment depuis le centre — d'où le
 * « proportionnel au centre » de tous les effets — et la zone n'est jamais un
 * disque, ce qui se verrait immédiatement.
 */
float dischargeField(vec2 bodyPoint) {
  float total = 0.0;

  for (int index = 0; index < DISCHARGE_COUNT; index++) {
    vec4 discharge = uDischarges[index];
    if (discharge.w <= 0.0) continue;

    float radius = max(discharge.z, 0.0001);
    vec2 offset = bodyPoint - discharge.xy;
    // Hors de portée du noyau : sortir avant le bruit, qui coûte cher et ne
    // servirait à rien sur la quasi-totalité du corps.
    if (dot(offset, offset) > radius * radius * 6.25) continue;

    float warp = snoise(
      bodyPoint * ZONE_WARP_SCALE + discharge.xy * 53.0 + uTime * ZONE_DRIFT
    );
    float distance = length(offset) / radius + warp * ZONE_WARP;
    total += discharge.w * exp(-distance * distance * 2.2);
  }

  return min(total, 1.0);
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

  float bodyMask = 1.0 - step(0.99999, texture2D(uDepthTexture, sampleUv).x);

  // MeshNormalMaterial encode les normales vue en 0..1.
  vec3 normal = normalize(
    texture2D(uNormalTexture, sampleUv).xyz * 2.0 - 1.0
  );
  float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);

  // Contour détecté sur la grille elle-même, pas sur le mesh.
  vec2 texel = 1.0 / gridSize;
  float neighborAverage = (
    sampleBodyMask(sampleUv - vec2(texel.x, 0.0)) +
    sampleBodyMask(sampleUv + vec2(texel.x, 0.0)) +
    sampleBodyMask(sampleUv + vec2(0.0, texel.y)) +
    sampleBodyMask(sampleUv - vec2(0.0, texel.y))
  ) * 0.25;
  float edge = bodyMask * (1.0 - neighborAverage);

  // --- Front de propagation -------------------------------------------------
  // Distances ramenées en fractions de largeur de cadre : en UV bruts, un
  // déplacement vertical et un déplacement horizontal ne valent pas le même
  // nombre de pixels et le front sortirait en ellipse.
  float subjectHeight = max(uSubjectHeight, 0.0001);
  vec2 point = vec2(sampleUv.x, sampleUv.y / aspect);

  float seedDistance = 1000.0;
  for (int index = 0; index < SEED_COUNT; index++) {
    vec2 seed = vec2(uSeeds[index].x, uSeeds[index].y / aspect);
    seedDistance = min(seedDistance, length(point - seed));
  }
  seedDistance += (hash(cellIndex) - 0.5) * FRONT_JITTER * subjectHeight;

  float radius = uRevealRadius * subjectHeight;
  float band = FRONT_BAND * subjectHeight;
  float reveal = 1.0 - smoothstep(radius - band, radius, seedDistance);

  // Les germes eux-mêmes sont désignés par leur cellule, pas par un rayon
  // plancher : à rayon comparable à la maille, un germe tombé près d'un coin
  // de cellule en allume deux ou quatre à la fois, et l'ouverture ne compte
  // plus quatre dots.
  for (int index = 0; index < SEED_COUNT; index++) {
    vec2 seedCell = floor(uSeeds[index] * gridSize);
    reveal = max(
      reveal,
      step(
        abs(seedCell.x - cellIndex.x) + abs(seedCell.y - cellIndex.y),
        0.5
      )
    );
  }

  // Crête : le dot grossit et s'appuie au passage du front, puis retombe.
  float crest = clamp(
    1.0 - (radius - seedDistance) / (FRONT_CREST * subjectHeight),
    0.0,
    1.0
  ) * reveal;

  // --- Décharge sur la peau -------------------------------------------------
  // Coordonnées du corps, isotropes et en hauteurs de sujet : x depuis l'axe
  // médian, y de 0 aux pieds à 1 au crâne. La boîte du sujet est centrée sur le
  // point que la caméra vise, donc son axe tombe à u = 0.5.
  float bodyAxis =
    (sampleUv.y - uSubjectSpan.x) / max(uSubjectSpan.y - uSubjectSpan.x, 0.0001);
  vec2 bodyPoint = vec2((sampleUv.x - 0.5) / subjectHeight, bodyAxis);

  // Le corps seul est parcouru : la trame de fond n'a rien à conduire.
  float zone = dischargeField(bodyPoint) * bodyMask;

  float glitch = 0.0;    // intensité propre à CETTE cellule
  float flicker = 0.0;   // signé : certains dots s'éteignent, d'autres brûlent
  float sizeShift = 0.0; // signé aussi

  if (zone > 0.001) {
    // Veines : une modulation lente par-dessus le tirage par cellule. Sans
    // elle, la zone grésille de façon parfaitement homogène et lit « bruit »
    // plutôt que « courant ».
    float veins = clamp(
      warpedFbm(bodyPoint * VEIN_SCALE + uTime * VEIN_DRIFT) * 0.5 + 0.5,
      0.0,
      1.0
    );
    zone *= 0.55 + 0.45 * veins;

    // Deux tirages par cellule : sa sensibilité, fixe, qui fait que deux dots
    // voisins ne réagissent jamais pareil ; et son tirage du moment,
    // redistribué par paliers, qui fait grésiller la zone au lieu de l'allumer
    // d'un bloc. Le temps est quantifié : le grésillement ne dépend pas de la
    // fréquence d'images, et l'accrochage par paliers lit « numérique » là où
    // un mouvement continu lirait « flottement ».
    float sensitivity = hash(cellIndex);
    // Palier de temps, replié : le hachage est un sin(dot(...)), et un
    // argument qui grandit sans fin finirait par en épuiser la précision — le
    // grésillement se mettrait à baver au bout de quelques minutes.
    float tick = mod(floor(uTime * GLITCH_RATE), 1024.0);
    float roll = hash(cellIndex + tick * 1.7);

    float intensity = zone * mix(0.35, 1.0, sensitivity);
    // Seules les cellules dont le tirage passe le seuil décrochent : au cœur
    // de la zone la plupart réagissent, sur ses bords presque aucune.
    glitch = intensity * step(1.0 - intensity * GLITCH_DENSITY, roll);

    // Trois tirages indépendants pour les trois réponses. Réutiliser le tirage
    // qui a servi de seuil corrélerait chaque réponse au fait d'avoir
    // décroché : le dot ne pourrait plus que s'éclaircir, jamais s'éteindre, et
    // l'effet disparaîtrait sous la saturation.
    float fade = hash(cellIndex.yx + tick * 3.1);
    float wobble = hash(cellIndex + tick * 7.3);
    float sway = hash(cellIndex.yx - tick * 2.9);

    flicker = (fade - 0.6) * GLITCH_FLICKER * glitch;
    sizeShift = (wobble - 0.4) * GLITCH_SIZE * glitch;
    cellLocal += (vec2(wobble, sway) - 0.5) * GLITCH_JITTER * glitch;
  }

  // --- Rendu de la cellule --------------------------------------------------
  float shading =
    uAmbient + diffuse * uNormalInfluence + edge * uEdgeInfluence;

  float bodyOpacity = bodyMask * reveal * clamp(
    (uBaseOpacity + shading) * (1.0 + FRONT_GLOW * crest + ZONE_GLOW * zone),
    0.0,
    1.0
  );
  // Le clignotement s'applique **après** la saturation : appliqué avant, il
  // serait avalé par le clamp partout où la peau est déjà pleinement opaque,
  // c'est-à-dire presque partout.
  bodyOpacity = clamp(bodyOpacity * (1.0 + flicker), 0.0, 1.0);

  // La trame de fond ignore le front : elle n'appartient pas au sujet et monte
  // sur sa propre fenêtre, une fois la silhouette en place.
  float backgroundOpacity = (1.0 - bodyMask) * uBackgroundOpacity;
  float presence = max(bodyOpacity, backgroundOpacity);

  float dotRadius = clamp(
    uDotRadius * (1.0 + FRONT_SWELL * crest + sizeShift),
    0.02,
    DOT_RADIUS_CAP
  );
  float softness = max(uDotSoftness, 0.001);
  float distanceToCenter = length(cellLocal);
  float dotMask = 1.0 - smoothstep(
    dotRadius,
    dotRadius + softness,
    distanceToCenter
  );

  // Halo : un second disque, plus large et très pâle, derrière le dot — et
  // derrière lui seul, pas derrière la zone. Plafonné à la cellule, au-delà il
  // déborde en carré et on perd la rondeur.
  float halo = 0.0;
  if (glitch > 0.001) {
    float haloRadius = min(dotRadius * HALO_SCALE, HALO_CAP);
    halo = (1.0 - smoothstep(
      haloRadius,
      haloRadius + softness * 3.0,
      distanceToCenter
    )) * glitch * HALO_ALPHA;
  }

  float alpha = max(dotMask, halo) * presence * uOpacity;
  if (alpha < 0.002) discard;

  // Dégradé sur la diagonale écran, haut gauche → bas droite : il appartient
  // au cadre, pas au sujet, et ne tourne donc pas avec lui. Évalué au centre
  // de la cellule comme le reste — un dot = une couleur pleine.
  float diagonal = (sampleUv.x + (1.0 - sampleUv.y)) * 0.5;

  // Ramené sur l'emprise écran du sujet (uniform recalculé par le renderer) :
  // sur un corps haut et étroit, la diagonale plein cadre resterait coincée au
  // milieu de la plage et aucune des deux couleurs ne serait atteinte.
  float gradient = clamp(
    (diagonal - uGradientRange.x) /
      max(uGradientRange.y - uGradientRange.x, 0.0001),
    0.0,
    1.0
  );
  vec3 bodyColor = mix(uDotColorStart, uDotColorEnd, gradient);
  // L'énergie ramène la cellule vers le vert vif — franchement là où le dot a
  // décroché, à peine sur le reste de la zone.
  bodyColor = mix(
    bodyColor,
    uDotColorStart,
    clamp(zone * ZONE_TINT + glitch * GLITCH_TINT, 0.0, 1.0)
  );

  // bodyMask est binaire : ce mix sélectionne, il n'interpole pas.
  gl_FragColor = vec4(mix(uGridDotColor, bodyColor, bodyMask), alpha);
}
