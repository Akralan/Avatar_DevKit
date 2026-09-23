// Rendu dot-matrix : quantification d'un vrai humain 3D sur une grille écran.
//
// La source est réellement 3D, mais la représentation visible n'est PAS un
// nuage de points 3D : c'est un raster 2D fixe de primitives, piloté par les
// buffers produits par la passe hors écran du kit. La géométrie fournit
// l'anatomie, la projection, l'occlusion et le mouvement ; le shader écran
// traduit ça en opacité sur une matrice rectiligne.
//
// Ne jamais remplacer ce pipeline par des `THREE.Points` — c'est l'erreur
// classique, et la grille cesserait d'être rectiligne.

/** Primitive dessinée dans chaque cellule de la grille écran. */
export type DotMatrixMode = "dots" | "bars" | "ascii";

export const DOT_MATRIX_MODES: readonly DotMatrixMode[] = ["dots", "bars", "ascii"];

export interface Twin2DConfig {
  mode: DotMatrixMode;
  /** Colonnes de la grille écran. Les lignes en découlent (cellules carrées). */
  gridColumns: number;
  /** Rayon du dot dans la cellule (0.5 = dot jointif). */
  dotRadius: number;
  /** Adoucissement du bord de la primitive. */
  dotSoftness: number;
  /** Niveau d'opacité général avant ombrage. */
  baseOpacity: number;
  /** Plancher d'ombrage : garantit la lisibilité des zones non éclairées. */
  ambient: number;
  /** Poids de l'éclairage diffus dérivé de la normale (révèle le volume). */
  normalInfluence: number;
  /** Poids de la profondeur linéarisée (modulation avant/arrière). */
  depthInfluence: number;
  /** Renfort du contour détecté sur la grille elle-même. */
  edgeInfluence: number;
  /** Matrice de fond, hors silhouette. 0 = fond vide. */
  backgroundOpacity: number;
  /** Rotation Y automatique (rad/s). 0 = figé. */
  rotationSpeed: number;
  /** Quantification Bayer 4×4 de l'opacité (rendu raster « old school »). */
  dither: boolean;
  /** Départ du dégradé du corps, en haut à gauche du cadre. */
  dotColorStart: string;
  /** Arrivée du dégradé du corps, en bas à droite du cadre. */
  dotColorEnd: string;
  /** Dots hors silhouette : neutres, ils ne doivent pas concurrencer le corps. */
  gridDotColor: string;
}

// Dégradé repris de la direction artistique MyTwin. Ces couleurs vivent dans
// des uniforms WebGL : elles ne passent par aucun jeton CSS.
const DOT_COLOR_START = "#79f0d1";
const DOT_COLOR_END = "#68cfdf";
const GRID_DOT_COLOR = "#94a3b8";


// Réglages validés à l'œil : grille dense, dots petits et doux, silhouette
// portée par l'ambiant et le contour plutôt que par la lumière rasante, sujet
// immobile. Ne pas les « rééquilibrer » sans repasser devant l'écran.
export const DEFAULT_TWIN_2D_CONFIG: Twin2DConfig = {
  mode: "dots",
  gridColumns: 260,
  dotRadius: 0.22,
  dotSoftness: 0.15,
  baseOpacity: 0.05,
  ambient: 0.46,
  normalInfluence: 0.53,
  depthInfluence: 0,
  edgeInfluence: 0.55,
  backgroundOpacity: 0.035,
  rotationSpeed: 0,
  dither: false,
  dotColorStart: DOT_COLOR_START,
  dotColorEnd: DOT_COLOR_END,
  gridDotColor: GRID_DOT_COLOR,
};
