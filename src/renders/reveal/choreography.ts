// Déroulé de la révélation. Fonction pure : c'est ici, et nulle part ailleurs,
// qu'est écrit ce que l'animation fait à un instant donné. Le renderer se
// contente de l'interroger à chaque frame et de pousser le résultat dans les
// uniforms.

/**
 * Hauteur du sujet, en mailles, sur toute la première moitié de la
 * chorégraphie. C'est ce qui fixe la silhouette basse résolution : ~40 dots,
 * proche de la limite basse à laquelle un corps humain reste lisible. Trois
 * mailles de moins et il ne reste qu'une constellation qu'on ne lit que si on
 * sait déjà ce qu'on regarde — le cou et les mains partent les premiers.
 *
 * Le départ s'indexe sur le **sujet**, l'arrivée sur le **pixel** : la figure
 * basse résolution est ainsi la même partout, et la trame finale a partout la
 * même texture. Un pas de départ fixé en px donnerait, lui, deux fois plus de
 * dots sur un grand écran que sur un petit.
 */
const START_SUBJECT_ROWS = 16;

/**
 * Pas d'arrivée selon la finesse du rendu. 2.9 px est le pas validé à l'œil sur
 * /twin-2D (348 colonnes sur ~1000 px de large), au même plafond de pixel ratio
 * qu'ici — c'est donc bien le même rendu, pas une transposition. Sur un écran
 * à 1 dppx, ce pas donnerait un dot de deux pixels séparé du suivant par un
 * seul : du moiré plutôt qu'une trame.
 *
 * L'argument est le pixel ratio **du rendu** (déjà plafonné), pas celui de
 * l'écran : c'est lui qui décide du nombre de pixels réels par dot.
 */
export function resolveFinalPitch(renderPixelRatio: number): number {
  return renderPixelRatio >= 1.5 ? 2.9 : 3.6;
}

// Rayon du dot en fraction de cellule. Il grandit pendant que le pas rétrécit :
// à rayon constant, un dot de 0.34 sur une cellule de ~50 px ferait une bille
// de 34 px au départ. Le produit des deux donne un diamètre qui décroît de
// ~11 px à ~2 px — le dot se resserre, il ne disparaît pas d'un coup.
const START_DOT_RADIUS = 0.11;
const FINAL_DOT_RADIUS = 0.34;

/**
 * Rayon du front à l'arrivée, en hauteurs de sujet. Les pieds sont à ~0.49 du
 * germe de bassin, les mains à ~0.38 de celui de poitrine, et le bruit de front
 * ajoute ~0.03 : le corps est entièrement allumé dès 0.52.
 *
 * On va sciemment au-delà, d'une épaisseur de crête : le front doit **sortir**
 * du sujet. S'il s'arrêtait à la couverture, les dernières cellules servies —
 * les pieds — resteraient à l'intérieur de sa crête et garderaient le
 * gonflement du passage pour toujours.
 */
const FULL_REVEAL_RADIUS = 0.63;

// Cinq temps. Les germes se posent, se laissent voir seuls, se répandent, la
// silhouette basse résolution tient une seconde de lecture, puis se précise.
// Les deux paliers sont ce qui rend la montée en résolution lisible : sans eux
// l'œil n'a aucun état de départ auquel comparer l'état d'arrivée.
const FADE_IN_MS = 320;
const SEED_HOLD_MS = 400;
const SPREAD_MS = 900;
const LOW_RES_HOLD_MS = 360;
const SHARPEN_MS = 3000;

const SPREAD_START_MS = FADE_IN_MS + SEED_HOLD_MS;
const SHARPEN_START_MS = SPREAD_START_MS + SPREAD_MS + LOW_RES_HOLD_MS;

/**
 * Fin de la propagation : la silhouette basse résolution est complète, le
 * sujet 2D a pris le relais du modèle 3D et peut être manipulé. Rien après ce
 * point ne pilote la pose, le drag en est donc seul maître — pas de rotation
 * scriptée qui lutterait contre le doigt.
 */
const INTERACTIVE_FROM_MS = SPREAD_START_MS + SPREAD_MS;

export const REVEAL_DURATION_MS = SHARPEN_START_MS + SHARPEN_MS;

// La trame de fond n'existe qu'à la fin : présente dès l'ouverture, elle
// noierait les quatre germes dans un damier gris.
const BACKGROUND_FADE_START = 0.55;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const easeInOutCubic = (progress: number): number =>
  progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;

export interface RevealStage {
  /** Largeur du cadre en px CSS — c'est elle qui convertit un pas en colonnes. */
  widthPx: number;
  /** Hauteur écran du sujet, en px CSS : l'unité du pas de départ. */
  subjectHeightPx: number;
  finalPitchPx: number;
}

export interface RevealFrame {
  /** Fondu d'ouverture, appliqué dans le shader. */
  opacity: number;
  gridColumns: number;
  dotRadius: number;
  /** Rayon du front de propagation, en hauteurs de sujet. */
  revealRadius: number;
  /** Montée de la trame de fond, 0..1 — pondérée par le look, pas une opacité. */
  backgroundFade: number;
  /** Le drag peut prendre la main. */
  interactive: boolean;
  finished: boolean;
}

/** État visuel à un instant donné. */
export function resolveRevealFrame(
  elapsedMs: number,
  stage: RevealStage,
): RevealFrame {
  const spread = clamp01((elapsedMs - SPREAD_START_MS) / SPREAD_MS);
  const sharpening = clamp01((elapsedMs - SHARPEN_START_MS) / SHARPEN_MS);
  const eased = easeInOutCubic(sharpening);

  // Interpolation géométrique du pas, pas linéaire : l'œil lit une densité en
  // rapport, pas en écart. D'une cinquantaine de px à trois, un lerp linéaire
  // passerait la première moitié du temps entre 50 et 26 px — deux images
  // presque identiques — puis avalerait tout le reste dans un souffle.
  const startPitch = Math.max(stage.subjectHeightPx / START_SUBJECT_ROWS, 1);
  const pitch = startPitch * (stage.finalPitchPx / startPitch) ** eased;

  return {
    opacity: clamp01(elapsedMs / FADE_IN_MS),
    gridColumns: stage.widthPx / pitch,
    dotRadius: START_DOT_RADIUS + (FINAL_DOT_RADIUS - START_DOT_RADIUS) * eased,
    revealRadius: FULL_REVEAL_RADIUS * easeInOutCubic(spread),
    backgroundFade: clamp01(
      (eased - BACKGROUND_FADE_START) / (1 - BACKGROUND_FADE_START),
    ),
    interactive: elapsedMs >= INTERACTIVE_FROM_MS,
    finished: elapsedMs >= REVEAL_DURATION_MS,
  };
}
