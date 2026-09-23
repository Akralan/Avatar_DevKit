import * as THREE from "three";

export interface OffscreenPass {
  /** Normales encodées en RGB. Ce rendu n'est jamais affiché. */
  target: THREE.WebGLRenderTarget;
  depthTexture: THREE.DepthTexture;
  normalMaterial: THREE.MeshNormalMaterial;
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

/**
 * Passe d'analyse hors écran : le sujet 3D est rendu en normales + profondeur
 * dans une cible qu'on n'affiche jamais. Un quad plein écran échantillonne
 * ensuite ces buffers **au centre de chaque cellule** pour en tirer une
 * opacité.
 *
 * C'est la technique centrale du devkit, et le piège principal : la sortie
 * visible est un raster 2D aligné à l'écran, **jamais** un nuage de points 3D.
 * Remplacer ce pipeline par des `THREE.Points` collés aux sommets est l'erreur
 * classique — la grille cesserait alors d'être rectiligne.
 *
 * Elle vit dans le kit, et non recopiée dans chaque module : c'est exactement
 * ce qu'un contributeur a besoin de réutiliser pour écrire son propre rendu.
 */
export function createOffscreenPass(
  _renderer: THREE.WebGLRenderer,
  { width, height }: { width: number; height: number },
): OffscreenPass {
  const depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.generateMipmaps = false;

  // NearestFilter partout : le shader lit le centre exact d'une cellule, une
  // interpolation linéaire mélangerait corps et fond sur les contours.
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    depthTexture,
  });

  const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.FrontSide });

  return {
    target,
    depthTexture,
    normalMaterial,

    render(renderer, scene, camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    },

    setSize(nextWidth, nextHeight) {
      // Réutiliser la cible plutôt qu'en allouer une par redimensionnement :
      // un glissement de fenêtre en produirait des dizaines, toutes vivantes.
      target.setSize(nextWidth, nextHeight);
      depthTexture.image.width = nextWidth;
      depthTexture.image.height = nextHeight;
      depthTexture.needsUpdate = true;
    },

    dispose() {
      target.dispose();
      depthTexture.dispose();
      normalMaterial.dispose();
    },
  };
}
