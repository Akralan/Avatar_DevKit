import * as THREE from "three";
import { REVEAL_LOOK, REVEAL_SEED_COUNT } from "./config";
import { MAX_DISCHARGES } from "./discharges";
import FULLSCREEN_VERTEX_SHADER from "./shaders/fullscreen.vert.glsl";
import REVEAL_FRAGMENT_SHADER from "./shaders/reveal.frag.glsl";
import type { RevealFrame } from "./choreography";

export interface RevealPass {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
}

// Lumière exprimée en espace vue : MeshNormalMaterial encode des normales vue.
// Trois-quarts haut-gauche, la direction la plus lisible pour révéler le volume
// d'un corps debout.
const LIGHT_DIRECTION = new THREE.Vector3(-0.45, 0.65, 0.65).normalize();

/**
 * Le shader écrit sa couleur telle quelle, sans passer par l'encodage de
 * sortie de three (réservé aux matériaux intégrés). On charge donc l'uniform
 * avec les composantes sRGB brutes — les convertir en linéaire assombrirait
 * tout le rendu.
 */
function shaderColor(hex: string): THREE.Color {
  return new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
}

/** Quad plein écran : c'est lui, et lui seul, qui produit l'image visible. */
export function createRevealPass(): RevealPass {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const material = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: REVEAL_FRAGMENT_SHADER,
    // GLSL ES 1.00 exige une borne de boucle constante à la compilation : le
    // nombre de germes et celui des décharges sont des constantes du shader,
    // pas des uniforms.
    defines: { SEED_COUNT: REVEAL_SEED_COUNT, DISCHARGE_COUNT: MAX_DISCHARGES },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uNormalTexture: { value: null },
      uDepthTexture: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uGridColumns: { value: 32 },
      uDotRadius: { value: 0.11 },
      uDotSoftness: { value: REVEAL_LOOK.dotSoftness },
      uBaseOpacity: { value: REVEAL_LOOK.baseOpacity },
      uAmbient: { value: REVEAL_LOOK.ambient },
      uNormalInfluence: { value: REVEAL_LOOK.normalInfluence },
      uEdgeInfluence: { value: REVEAL_LOOK.edgeInfluence },
      uBackgroundOpacity: { value: 0 },
      uOpacity: { value: 0 },
      uRevealRadius: { value: 0 },
      uSeeds: {
        value: Array.from(
          { length: REVEAL_SEED_COUNT },
          () => new THREE.Vector2(),
        ),
      },
      uSubjectHeight: { value: 1 },
      uSubjectSpan: { value: new THREE.Vector2(0, 1) },
      uDischarges: {
        value: Array.from(
          { length: MAX_DISCHARGES },
          () => new THREE.Vector4(0, 0, 1, 0),
        ),
      },
      uTime: { value: 0 },
      uGradientRange: { value: new THREE.Vector2(0, 1) },
      uDotColorStart: { value: shaderColor(REVEAL_LOOK.dotColorStart) },
      uDotColorEnd: { value: shaderColor(REVEAL_LOOK.dotColorEnd) },
      uGridDotColor: { value: shaderColor(REVEAL_LOOK.gridDotColor) },
      uLightDirection: { value: LIGHT_DIRECTION },
    },
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return { scene, camera, material, mesh };
}

/** Pousse l'état de la chorégraphie dans les uniforms. Appelé à chaque frame. */
export function applyRevealFrame(pass: RevealPass, frame: RevealFrame): void {
  const uniforms = pass.material.uniforms;

  uniforms.uOpacity.value = frame.opacity;
  uniforms.uGridColumns.value = frame.gridColumns;
  uniforms.uDotRadius.value = frame.dotRadius;
  uniforms.uRevealRadius.value = frame.revealRadius;
  uniforms.uBackgroundOpacity.value =
    frame.backgroundFade * REVEAL_LOOK.backgroundOpacity;
}

export function disposeRevealPass(pass: RevealPass): void {
  pass.mesh.geometry.dispose();
  pass.material.dispose();
}
