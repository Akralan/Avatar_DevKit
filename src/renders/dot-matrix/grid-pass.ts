import * as THREE from "three";
import FULLSCREEN_VERTEX_SHADER from "./shaders/fullscreen.vert.glsl";
import DOT_MATRIX_FRAGMENT_SHADER from "./shaders/dot-matrix.frag.glsl";
import { GLYPH_COUNT } from "./glyph-atlas";
import type { DotMatrixMode, Twin2DConfig } from "./config";

export interface GridPass {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
}

const MODE_INDEX: Record<DotMatrixMode, number> = {
  dots: 0,
  bars: 1,
  ascii: 2,
};

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
function toShaderColor(target: THREE.Color, hex: string): THREE.Color {
  return target.setStyle(hex, THREE.LinearSRGBColorSpace);
}

/** Quad plein écran : c'est lui, et lui seul, qui produit l'image visible. */
export function createGridPass(glyphAtlas: THREE.Texture): GridPass {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const material = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: DOT_MATRIX_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uNormalTexture: { value: null },
      uDepthTexture: { value: null },
      uGlyphAtlas: { value: glyphAtlas },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uGridColumns: { value: 120 },
      uDotRadius: { value: 0.26 },
      uDotSoftness: { value: 0.08 },
      uBaseOpacity: { value: 0.2 },
      uAmbient: { value: 0.18 },
      uNormalInfluence: { value: 0.62 },
      uDepthInfluence: { value: 0.2 },
      uEdgeInfluence: { value: 0.18 },
      uBackgroundOpacity: { value: 0.015 },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
      uMode: { value: 0 },
      uDither: { value: 0 },
      uGlyphCount: { value: GLYPH_COUNT },
      uGradientRange: { value: new THREE.Vector2(0, 1) },
      uDotColorStart: { value: new THREE.Color() },
      uDotColorEnd: { value: new THREE.Color() },
      uGridDotColor: { value: new THREE.Color() },
      uLightDirection: { value: LIGHT_DIRECTION },
    },
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return { scene, camera, material, mesh };
}

export function applyGridConfig(pass: GridPass, config: Twin2DConfig): void {
  const uniforms = pass.material.uniforms;

  uniforms.uMode.value = MODE_INDEX[config.mode];
  uniforms.uGridColumns.value = config.gridColumns;
  uniforms.uDotRadius.value = config.dotRadius;
  uniforms.uDotSoftness.value = config.dotSoftness;
  uniforms.uBaseOpacity.value = config.baseOpacity;
  uniforms.uAmbient.value = config.ambient;
  uniforms.uNormalInfluence.value = config.normalInfluence;
  uniforms.uDepthInfluence.value = config.depthInfluence;
  uniforms.uEdgeInfluence.value = config.edgeInfluence;
  uniforms.uBackgroundOpacity.value = config.backgroundOpacity;
  uniforms.uDither.value = config.dither ? 1 : 0;

  toShaderColor(uniforms.uDotColorStart.value as THREE.Color, config.dotColorStart);
  toShaderColor(uniforms.uDotColorEnd.value as THREE.Color, config.dotColorEnd);
  toShaderColor(uniforms.uGridDotColor.value as THREE.Color, config.gridDotColor);
}

export function disposeGridPass(pass: GridPass): void {
  pass.mesh.geometry.dispose();
  pass.material.dispose();
}
