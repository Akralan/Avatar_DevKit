import * as THREE from "three";

// Shader hologramme — approche « best practices Three.js », PAS une traduction
// littérale du graph Blender (impossible à transposer proprement par fragment :
// le nœud Bevel→courbure produit du bruit d'écran). Objectif : même DA / même
// vibe qu'un hologramme propre, rendu ultra smooth, 100 % mobile-friendly
// (uniquement du Fresnel + un hash — zéro dérivée d'écran, zéro passe en plus).
//
// Recette : corps émissif teal translucide + liseré Fresnel doux (glow vert) +
// contour lumineux net + teinte verticale subtile + grain fin procédural.
// L'alpha est piloté par le Fresnel (translucide face caméra, opaque au bord)
// et JAMAIS par la hauteur → fini la « tête en verre ».
//
// NOTE : les noms de params sont conservés (le panneau de réglage abandonné les
// type-check encore) mais leur sémantique a changé — voir commentaires. Un
// renommage propre + reconstruction du panneau est un refacto à proposer à part.

export type HologramParams = {
  bodyColor: string; // corps émissif teal (base)
  bodyStrength: number;
  rimGreenColor: string; // liseré Fresnel principal (glow)
  rimGreenStrength: number;
  vGradientColor: string; // teinte verticale subtile (couleur uniquement)
  vGradientStrength: number; // dosage de la teinte (0 = off)
  outerRimColor: string; // contour lumineux net (silhouette)
  outerRimStrength: number;

  bodyFresnelBlend: number; // exposant Fresnel du liseré principal (forme)
  edgeFadeBlend: number; // plancher du relief (creux : 0 = noir, 1 = plat)
  edgeFadePower: number; // exposant Fresnel de l'alpha (forme translucidité)
  outerRimBlend: number; // exposant Fresnel du contour (finesse)
  outerRimStart: number; // bande smoothstep du contour — bas
  outerRimEnd: number; // bande smoothstep du contour — haut

  curvAmount: number; // exposant Fresnel global (dureté générale)
  curvStart: number; // bande smoothstep du liseré principal — bas
  curvEnd: number; // bande smoothstep du liseré principal — haut

  vGradientFlip: boolean; // sens de la teinte verticale
  alphaEnable: number; // 0 = opaque, 1 = translucidité hologramme
  baseAlpha: number; // translucidité du corps face caméra (plancher)
  grainAmount: number; // intensité du grain fin procédural
};

// Linéaire Blender → hex sRGB (pour les color pickers). Conversion exacte
// refaite par THREE.Color au runtime ; ces hex ne sont que des défauts.
const HEX = (r: number, g: number, b: number) =>
  `#${new THREE.Color()
    .setRGB(r, g, b, THREE.LinearSRGBColorSpace)
    .getHexString(THREE.SRGBColorSpace)}`;

// Bloom éteint : hologramme mat, zéro halo. Pass conservé dans le pipeline,
// réactivable plus tard pour le seul contour si besoin.
export const BLOOM_DEFAULTS = { strength: 0.0, radius: 0.4, threshold: 0.85 };

// Features shader optionnelles (phase 2). Toutes OFF → le rendu est
// strictement identique au checkpoint `base`. Chaque preset en active un
// sous-ensemble. Pilotées par uniforms (constant par draw → branche GPU
// gratuite, zéro passe en plus sauf bloom).
export type HologramFeatures = {
  halo: number; // B2 : glow Fresnel additif doux (0 = off)
  invRamp: boolean; // A4 : corps = rampe ombre→lumière (couleurs inversées)
  shadowColor: string; // A4 : couleur des creux (relief = 0)
  lightColor: string; // A4 : couleur des reliefs (relief = 1)
  scanline: number; // B4 : scanlines animées (0 = off)
  bayerDither: boolean; // C1 : trame Bayer ordonnée (sinon IGN actuelle)
};

export const HOLOGRAM_FEATURES_OFF: HologramFeatures = {
  halo: 0,
  invRamp: false,
  shadowColor: "#000000",
  lightColor: "#ffffff",
  scanline: 0,
  bayerDither: false,
};

export const HOLOGRAM_DEFAULTS: HologramParams = {
  bodyColor: HEX(0.2223, 0.784, 1.0),
  bodyStrength: 2.0,
  rimGreenColor: HEX(0.2894, 1.0, 0.6179),
  rimGreenStrength: 3.0,
  vGradientColor: HEX(0.5306, 0.8932, 1.0),
  vGradientStrength: 0.45,
  outerRimColor: HEX(0.7, 0.95, 1.0),
  outerRimStrength: 6.0,

  bodyFresnelBlend: 2.5,
  edgeFadeBlend: 0.04, // plancher relief : creux quasi noirs
  edgeFadePower: 1.2,
  outerRimBlend: 4.0,
  outerRimStart: 0.6,
  outerRimEnd: 1.0,

  curvAmount: 1.6, // contraste/dureté du relief lighting inversé
  curvStart: 0.2,
  curvEnd: 0.95,

  vGradientFlip: false,
  alphaEnable: 1.0,
  baseAlpha: 0.7, // dither : ~70% des pixels gardés face caméra (fantôme léger)
  grainAmount: 0.1,
};

// ── Registry de presets (phase 2 — variantes) ────────────────────────────
// Commutable via `?v=<clé>` sur /test-twin. `base` = checkpoint figé
// (NE PAS modifier — c'est le point de comparaison). Les variantes clonent
// `HOLOGRAM_DEFAULTS` et ne surchargent que le strict nécessaire.

export type HologramPreset = {
  label: string;
  params: HologramParams;
  features: HologramFeatures;
  bloom: typeof BLOOM_DEFAULTS;
};

// Rampe « couleurs inversées » partagée (A4) : creux vert-noir profond →
// reliefs cyan clair. C'est ce qui recrée la profondeur sculpturale Blender.
const RAMP_SHADOW = HEX(0.004, 0.045, 0.05);
const RAMP_LIGHT = HEX(0.45, 0.92, 1.0);

export const HOLOGRAM_PRESETS: Record<string, HologramPreset> = {
  // Checkpoint actuel — fantôme tramé smooth. Référence de comparaison.
  base: {
    label: "Base (checkpoint)",
    params: HOLOGRAM_DEFAULTS,
    features: HOLOGRAM_FEATURES_OFF,
    bloom: BLOOM_DEFAULTS,
  },

  // V1 « Deep » = A1 (creux noirs + falloff dur) + A4 (rampe inversée) +
  // B2 (halo Fresnel in-shader). 100 % shader, zéro coût de passe.
  deep: {
    label: "V1 — Deep (profondeur + halo)",
    params: {
      ...HOLOGRAM_DEFAULTS,
      bodyStrength: 1.5, // la rampe encode déjà la luminance
      edgeFadeBlend: 0.0, // creux quasi noirs
      curvAmount: 3.0, // falloff de relief plus dur
      vGradientStrength: 0.15, // teinte verticale discrète (rampe domine)
    },
    features: {
      ...HOLOGRAM_FEATURES_OFF,
      invRamp: true,
      shadowColor: RAMP_SHADOW,
      lightColor: RAMP_LIGHT,
      halo: 0.6,
    },
    bloom: BLOOM_DEFAULTS,
  },

  // V2 « Projected » = A1 + rampe inversée + bloom sélectif (B1) sur le seul
  // liseré/contour surexposé → sensation lumière projetée. + de coût (1 passe).
  projected: {
    label: "V2 — Projected (rampe + bloom sélectif)",
    params: {
      ...HOLOGRAM_DEFAULTS,
      bodyStrength: 1.5,
      edgeFadeBlend: 0.01,
      curvAmount: 2.5,
      vGradientStrength: 0.15,
    },
    features: {
      ...HOLOGRAM_FEATURES_OFF,
      invRamp: true,
      shadowColor: RAMP_SHADOW,
      lightColor: RAMP_LIGHT,
      halo: 0.3,
    },
    bloom: { strength: 0.6, radius: 0.5, threshold: 0.85 },
  },

  // V3 « Digital » = A1 + trame Bayer (C1) + scanlines animées (B4).
  // Parti pris hologramme digital assumé. 100 % shader.
  digital: {
    label: "V3 — Digital (Bayer + scanlines)",
    params: {
      ...HOLOGRAM_DEFAULTS,
      edgeFadeBlend: 0.02,
      curvAmount: 2.5,
      grainAmount: 0.15,
    },
    features: {
      ...HOLOGRAM_FEATURES_OFF,
      bayerDither: true,
      scanline: 0.25,
    },
    bloom: BLOOM_DEFAULTS,
  },
};

export const DEFAULT_PRESET = "base";

export function resolvePreset(key: string | undefined): HologramPreset {
  return HOLOGRAM_PRESETS[key ?? ""] ?? HOLOGRAM_PRESETS[DEFAULT_PRESET];
}

const VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = mat3(modelMatrix) * normal;
  vViewDir = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec3 uBody;        uniform float uBodyStr;
uniform vec3 uRimGreen;    uniform float uRimGreenStr;
uniform vec3 uVGrad;       uniform float uVGradStr;
uniform vec3 uOuterRim;    uniform float uOuterRimStr;

uniform float uBodyFresnelBlend; // exposant Fresnel liseré principal
uniform float uEdgeFadeBlend;    // plancher du relief (creux sombres)
uniform float uEdgeFadePow;      // exposant Fresnel de l'alpha
uniform float uOuterRimBlend;    // exposant Fresnel du contour
uniform float uOuterRimStart;
uniform float uOuterRimEnd;

uniform float uCurvAmount;       // exposant Fresnel global (dureté)
uniform float uCurvStart;
uniform float uCurvEnd;

uniform float uBboxMinY;
uniform float uBboxSizeY;
uniform float uVGradFlip;
uniform float uAlphaEnable;
uniform float uBaseAlpha;
uniform float uGrain;

// Features phase 2 (toutes neutres à 0/off → rendu = checkpoint base).
uniform float uHalo;       // B2 : intensité du halo Fresnel additif
uniform float uInvRamp;    // A4 : 1 = corps via rampe ombre→lumière
uniform vec3  uShadowCol;  // A4 : couleur des creux
uniform vec3  uLightCol;   // A4 : couleur des reliefs
uniform float uScanline;   // B4 : intensité des scanlines
uniform float uBayer;      // C1 : 1 = trame Bayer, sinon IGN
uniform float uTime;       // animation scanlines

varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

// Hash 2D bon marché → grain fin. Bruit écran stable (pas d'animation : on
// veut une signature hologramme discrète, pas du scintillement).
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// Interleaved Gradient Noise (Jimenez) — dither fin et stable par pixel.
// Sert de seuil à la transparence tramée : pas de blend → pas de tri.
float dither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Bayer ordonné (C1) — version analytique sans tableau (GLSL1 / mobile-safe).
// Look « écran digital » : trame régulière au lieu du bruit IGN.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N; // GLB Blender : normales inversées + DoubleSide
  vec3 V = normalize(vViewDir);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fres = 1.0 - ndv; // 0 face caméra → 1 au bord rasant (rim/alpha)

  // Relief « lighting inversé » — le charme du rendu Blender. Toute la surface
  // est sculptée par N·V : lumineuse face caméra, sombre (teal profond, vers
  // noir) là où elle se détourne — creux, flancs, plis. Smooth, vue-dépendant
  // (suit la rotation), zéro dérivée d'écran. uCurvAmount = contraste,
  // uEdgeFadeBlend = plancher (noirceur des creux).
  float relief = mix(uEdgeFadeBlend, 1.0, pow(ndv, max(uCurvAmount, 1e-3)));

  // Corps : soit teal × relief (base), soit rampe inversée ombre→lumière
  // (A4) — c'est la rampe qui recrée la profondeur sculpturale « couleurs
  // inversées » du rendu Blender (creux sombres, reliefs clairs).
  vec3 body = mix(uShadowCol, uLightCol, relief);
  vec3 col = mix(uBody * relief, body, uInvRamp) * uBodyStr;

  // Teinte verticale subtile (couleur seulement, jamais l'alpha).
  float genZ = clamp((vWorldPos.y - uBboxMinY) / max(uBboxSizeY, 1e-5), 0.0, 1.0);
  genZ = mix(genZ, 1.0 - genZ, uVGradFlip);
  col = mix(col, uVGrad * uBodyStr * relief, genZ * uVGradStr);

  // Liseré Fresnel principal : glow vert/cyan large et doux (smoothstep).
  float rim = smoothstep(
    uCurvStart, uCurvEnd, pow(fres, max(uBodyFresnelBlend, 1e-3)));
  col = mix(col, uRimGreen * uRimGreenStr, rim);

  // Contour lumineux net : liseré fin franc à la silhouette.
  float outer = smoothstep(
    uOuterRimStart, uOuterRimEnd, pow(fres, max(uOuterRimBlend, 1e-3)));
  col = mix(col, uOuterRim * uOuterRimStr, outer);

  // B2 — halo Fresnel additif doux : lueur projetée large autour de la
  // silhouette, in-shader (zéro passe). Neutre à uHalo = 0.
  col += uRimGreen * (uHalo * pow(fres, 2.0));

  // B4 — scanlines animées : fines bandes horizontales lentes (signature
  // projection holo). Neutre à uScanline = 0.
  float sl = 0.5 + 0.5 * sin((gl_FragCoord.y - uTime * 50.0) * 0.6);
  col *= 1.0 - uScanline * (1.0 - sl);

  // Grain fin procédural — signature hologramme, modulation neutre en moyenne.
  float g = hash21(gl_FragCoord.xy);
  col *= 1.0 - uGrain * (0.5 - g);

  // Alpha hologramme : translucide face caméra, plus opaque au bord/contour.
  float a = mix(uBaseAlpha, 1.0, pow(fres, max(uEdgeFadePow, 1e-3)));
  a = max(a, outer);
  a = clamp(a, 0.0, 1.0);
  a = mix(1.0, a, uAlphaEnable);

  // Transparence TRAMÉE (screen-door) : on reste opaque pour le GPU
  // (depthWrite, pas de blend) → tri de profondeur parfait, zéro artefact,
  // order-independent, mobile-friendly. Chaque pixel est binaire (gardé/
  // rejeté) selon un seuil stable → effet fantôme + trame « projection ».
  float threshold = mix(
    dither(gl_FragCoord.xy), bayer4(gl_FragCoord.xy), uBayer);
  if (a < threshold) discard;

  gl_FragColor = vec4(col, 1.0);
}
`;

const lin = (hex: string) => {
  const c = new THREE.Color().setHex(
    parseInt(hex.replace("#", ""), 16),
    THREE.SRGBColorSpace,
  );
  return new THREE.Vector3(c.r, c.g, c.b);
};

// Réapplique tous les params sur un matériau existant (réglage live).
export function applyHologramParams(
  m: THREE.ShaderMaterial,
  p: HologramParams,
): void {
  const u = m.uniforms;
  u.uBody.value.copy(lin(p.bodyColor));
  u.uBodyStr.value = p.bodyStrength;
  u.uRimGreen.value.copy(lin(p.rimGreenColor));
  u.uRimGreenStr.value = p.rimGreenStrength;
  u.uVGrad.value.copy(lin(p.vGradientColor));
  u.uVGradStr.value = p.vGradientStrength;
  u.uOuterRim.value.copy(lin(p.outerRimColor));
  u.uOuterRimStr.value = p.outerRimStrength;
  u.uBodyFresnelBlend.value = p.bodyFresnelBlend;
  u.uEdgeFadeBlend.value = p.edgeFadeBlend;
  u.uEdgeFadePow.value = p.edgeFadePower;
  u.uOuterRimBlend.value = p.outerRimBlend;
  u.uOuterRimStart.value = p.outerRimStart;
  u.uOuterRimEnd.value = p.outerRimEnd;
  u.uCurvAmount.value = p.curvAmount;
  u.uCurvStart.value = p.curvStart;
  u.uCurvEnd.value = p.curvEnd;
  u.uVGradFlip.value = p.vGradientFlip ? 1 : 0;
  u.uAlphaEnable.value = p.alphaEnable;
  u.uBaseAlpha.value = p.baseAlpha;
  u.uGrain.value = p.grainAmount;
}

export function createHologramMaterial(
  p: HologramParams = HOLOGRAM_DEFAULTS,
  f: HologramFeatures = HOLOGRAM_FEATURES_OFF,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    // Opaque : z-buffer GPU → tri de profondeur parfait, zéro artefact de
    // transparence (cf. fragment). DoubleSide conservé pour les normales
    // inversées de certains meshes du GLB.
    depthWrite: true,
    uniforms: {
      uBody: { value: lin(p.bodyColor) },
      uBodyStr: { value: p.bodyStrength },
      uRimGreen: { value: lin(p.rimGreenColor) },
      uRimGreenStr: { value: p.rimGreenStrength },
      uVGrad: { value: lin(p.vGradientColor) },
      uVGradStr: { value: p.vGradientStrength },
      uOuterRim: { value: lin(p.outerRimColor) },
      uOuterRimStr: { value: p.outerRimStrength },
      uBodyFresnelBlend: { value: p.bodyFresnelBlend },
      uEdgeFadeBlend: { value: p.edgeFadeBlend },
      uEdgeFadePow: { value: p.edgeFadePower },
      uOuterRimBlend: { value: p.outerRimBlend },
      uOuterRimStart: { value: p.outerRimStart },
      uOuterRimEnd: { value: p.outerRimEnd },
      uCurvAmount: { value: p.curvAmount },
      uCurvStart: { value: p.curvStart },
      uCurvEnd: { value: p.curvEnd },
      uBboxMinY: { value: -0.5 },
      uBboxSizeY: { value: 1.0 },
      uVGradFlip: { value: p.vGradientFlip ? 1 : 0 },
      uAlphaEnable: { value: p.alphaEnable },
      uBaseAlpha: { value: p.baseAlpha },
      uGrain: { value: p.grainAmount },
      uHalo: { value: f.halo },
      uInvRamp: { value: f.invRamp ? 1 : 0 },
      uShadowCol: { value: lin(f.shadowColor) },
      uLightCol: { value: lin(f.lightColor) },
      uScanline: { value: f.scanline },
      uBayer: { value: f.bayerDither ? 1 : 0 },
      uTime: { value: 0 },
    },
  });
}
