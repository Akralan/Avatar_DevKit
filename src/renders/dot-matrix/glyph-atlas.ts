import * as THREE from "three";

// Rampe classique du rendu ASCII, du plus clair au plus dense : l'indice de
// tuile encode directement le niveau d'ombrage échantillonné par le shader.
const GLYPH_RAMP = " .:-=+*#%@";

// Tuile volontairement proche de la taille d'affichage d'une cellule (~10-20px
// selon la densité de grille) : rendre à 128px puis réduire ferait scintiller
// les glyphes au filtrage.
const TILE_SIZE = 32;

export const GLYPH_COUNT = GLYPH_RAMP.length;

/**
 * Atlas horizontal des glyphes, généré au runtime dans un canvas 2D : le blanc
 * plein sur fond transparent donne une couverture exploitable dans le canal
 * alpha, sans dépendre d'une police web ni d'un asset à builder.
 */
export function createGlyphAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE * GLYPH_COUNT;
  canvas.height = TILE_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Contexte 2D indisponible pour l'atlas de glyphes.");
  }

  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${Math.round(TILE_SIZE * 0.78)}px ui-monospace, SFMono-Regular, Menlo, monospace`;

  for (let index = 0; index < GLYPH_COUNT; index += 1) {
    context.fillText(
      GLYPH_RAMP[index],
      index * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE / 2,
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  return texture;
}
