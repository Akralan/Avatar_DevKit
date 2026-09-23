// Révélation du Twin « 2D » : quatre germes se posent sur le sujet, un front
// de propagation remplit la silhouette en basse résolution, puis la trame monte
// en résolution jusqu'au rendu de référence.
//
// Comme `../dot-matrix/`, la source est un vrai humain 3D mais la sortie
// visible est un raster 2D : le modèle est rendu hors écran en normales +
// profondeur, et un quad plein écran quantifie ces buffers sur une grille
// écran. Ne jamais remplacer ce pipeline par des `THREE.Points` — la grille
// cesserait d'être rectiligne.
//
// Quatrième implémentation du Twin, isolée des trois autres (`../basic/`,
// `../shader/`, `../dot-matrix/`) : aucun import croisé dans un sens ou dans
// l'autre, cf. docs/features/twin.md.


// Dégradé de la DA. Ces couleurs vivent dans des uniforms WebGL, pas dans du
// JSX — les tokens Tailwind ne s'appliquent pas ici.
const DOT_COLOR_START = "#00dba1";
const DOT_COLOR_END = "#00bad6";
const GRID_DOT_COLOR = "#94a3b8";

/**
 * Ombrage figé à l'œil sur /twin-2D : silhouette portée par l'ambiant et le
 * contour plutôt que par la lumière rasante. Ne pas « rééquilibrer » ces
 * valeurs sans repasser par le panneau de /twin-2D.
 *
 * Le rayon des dots est absent : c'est une valeur animée, cf. `choreography`.
 */
export const REVEAL_LOOK = {
  dotSoftness: 0.15,
  baseOpacity: 0.06,
  ambient: 0.26,
  normalInfluence: 1.5,
  edgeInfluence: 1,
  /** Trame neutre hors silhouette, à pleine résolution. */
  backgroundOpacity: 0.035,
  dotColorStart: DOT_COLOR_START,
  dotColorEnd: DOT_COLOR_END,
  gridDotColor: GRID_DOT_COLOR,
} as const;

/**
 * Ancres anatomiques des germes, **en fractions de la hauteur du sujet** sur
 * les deux axes, origine au centre de sa boîte (donc ~ le bassin) : y = +0.5
 * est le sommet du crâne, y = -0.5 la plante des pieds.
 *
 * Les deux axes sont normalisés par la hauteur, jamais par la largeur de la
 * boîte : celle-ci est l'envergure des bras, et un x en fractions de largeur
 * placerait les épaules quelque part au milieu des avant-bras.
 *
 * Toutes sur l'axe médian entre le crâne et le bassin, espacées d'au moins deux
 * mailles de départ. Un germe n'allume que la cellule qui le porte, et c'est le
 * **centre** de cette cellule qui décide s'il y a du corps dessous : à la maille
 * de départ, une demi-cellule vaut ~0.06 hauteur de sujet, soit plus que la
 * demi-largeur d'une cuisse et autant que celle d'une épaule. Hors de ce
 * segment — entre les jambes sous l'entrejambe, au bord d'une épaule — le germe
 * tombe dans le vide et le dot n'apparaît jamais.
 *
 * Le corps se remplit donc du buste vers les extrémités : les mains et les
 * pieds sont les derniers servis, ce qui est aussi l'ordre le plus lisible.
 */
export const REVEAL_SEEDS = [
  { x: 0, y: 0.43 }, // crâne
  { x: 0, y: 0.27 }, // poitrine
  { x: 0, y: 0.13 }, // abdomen
  { x: 0, y: -0.01 }, // bassin
] as const;

// Câblé en `#define` dans le fragment shader : GLSL ES 1.00 exige une borne de
// boucle constante à la compilation.
export const REVEAL_SEED_COUNT = REVEAL_SEEDS.length;

/** Pose Y du sujet à l'ouverture, en radians : trois-quarts de référence. */
export const INITIAL_ROTATION = 0.35;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
