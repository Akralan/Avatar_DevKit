import { FACE_TRIANGULATION, FACE_VERTEX_COUNT } from "./face-triangulation";

/**
 * Reconstruction du masque facial au format **exact** qu'attend la greffe
 * (`backend/pipeline/texture_swap.py`) : 478 sommets en ordre canonique
 * MediaPipe, 898 triangles, UV = projection orthographique du maillage
 * frontalisé, une seule texture.
 *
 * S'en écarter ne produit pas une erreur. Ça produit une greffe de travers.
 */

/**
 * Côté maximal de la texture envoyée au backend. La webcam capture jusqu'en 4K,
 * mais le rastériseur backend décode l'image en tableau numpy brut (~25-33 Mo
 * en 4K, multiplié par ses copies de travail) : le conteneur saute en mémoire.
 *
 * C'est une protection serveur, pas un réglage de qualité — les landmarks étant
 * normalisés, réduire la texture ne touche ni le repérage ni les UV.
 */
export const FACE_TEX_MAX = 1024;

/**
 * Rentrée des UV du contour vers l'intérieur (0.07 = 7 %). Empêche la texture
 * de déborder sur le fond derrière le visage : les triangles de bordure
 * échantillonnent la peau, jamais l'arrière-plan.
 */
export const FACE_EDGE_ERODE = 0.07;

const TRIANGLES = Uint16Array.from(FACE_TRIANGULATION);

/**
 * Sommets du contour : extrémités des arêtes n'appartenant qu'à UN seul
 * triangle, c'est-à-dire les bords ouverts de la silhouette. Dérivé une fois de
 * la triangulation.
 */
const FACE_BOUNDARY = (() => {
  const compte = new Map<number, number>();
  const cle = (a: number, b: number) => (a < b ? a * 100000 + b : b * 100000 + a);

  for (let t = 0; t < TRIANGLES.length; t += 3) {
    const [a, b, c] = [TRIANGLES[t], TRIANGLES[t + 1], TRIANGLES[t + 2]];
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = cle(x, y);
      compte.set(k, (compte.get(k) ?? 0) + 1);
    }
  }

  const bord = new Set<number>();
  for (const [k, n] of compte) {
    if (n === 1) {
      bord.add(Math.floor(k / 100000));
      bord.add(k % 100000);
    }
  }

  return bord;
})();

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

/**
 * Frontalisation : la matrice de transformation faciale donne la pose 3D de la
 * tête. On applique l'inverse de sa rotation au nuage de points pour ramener le
 * visage de face — les écartements œil/nez/bouche cessent d'être écrasés par
 * l'angle, et l'orientation devient canonique. Quasi identité si l'on est déjà
 * de face, donc sans risque.
 */
function frontaliser(pos: Float32Array, matrix: number[] | null): void {
  if (!matrix || matrix.length < 16) return;

  const normaliser = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  // Colonnes de rotation (matrice col-major), normalisées pour retirer l'échelle.
  const c0 = normaliser([matrix[0], matrix[1], matrix[2]]);
  const c1 = normaliser([matrix[4], matrix[5], matrix[6]]);
  const c2 = normaliser([matrix[8], matrix[9], matrix[10]]);

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < FACE_VERTEX_COUNT; i += 1) {
    cx += pos[i * 3];
    cy += pos[i * 3 + 1];
    cz += pos[i * 3 + 2];
  }
  cx /= FACE_VERTEX_COUNT;
  cy /= FACE_VERTEX_COUNT;
  cz /= FACE_VERTEX_COUNT;

  // R transposée (lignes = c0, c1, c2) appliquée au nuage centré.
  for (let i = 0; i < FACE_VERTEX_COUNT; i += 1) {
    const x = pos[i * 3] - cx;
    const y = pos[i * 3 + 1] - cy;
    const z = pos[i * 3 + 2] - cz;

    pos[i * 3] = c0[0] * x + c0[1] * y + c0[2] * z + cx;
    pos[i * 3 + 1] = c1[0] * x + c1[1] * y + c1[2] * z + cy;
    pos[i * 3 + 2] = c2[0] * x + c2[1] * y + c2[2] * z + cz;
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const aligner = (n: number) => (n + 3) & ~3;

function decoderJpeg(canvas: HTMLCanvasElement): Uint8Array {
  const base64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
  const binaire = atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);

  return octets;
}

export function buildFaceGlb(
  landmarks: NormalizedLandmark[],
  texture: HTMLCanvasElement,
  matrix: number[] | null,
): Blob {
  if (landmarks.length < FACE_VERTEX_COUNT) {
    throw new Error(
      `Repères faciaux incomplets : ${landmarks.length} au lieu de ${FACE_VERTEX_COUNT}.`,
    );
  }

  const pos = new Float32Array(FACE_VERTEX_COUNT * 3);
  const uv = new Float32Array(FACE_VERTEX_COUNT * 2);

  // La photo est en paysage : `p.x` est normalisé par la largeur, `p.y` par la
  // hauteur. On rétablit les proportions réelles en multipliant X et Z (z est à
  // l'échelle de x chez MediaPipe) par le ratio — sinon le visage sort écrasé
  // horizontalement, donc étiré verticalement.
  const aspect = texture.width / texture.height;

  for (let i = 0; i < FACE_VERTEX_COUNT; i += 1) {
    const p = landmarks[i];
    pos[i * 3] = (p.x - 0.5) * aspect;
    pos[i * 3 + 1] = -(p.y - 0.5); // Y vers le haut
    pos[i * 3 + 2] = -(p.z ?? 0) * aspect; // Z vers l'avant
  }

  frontaliser(pos, matrix);

  // UV = projection orthographique du maillage **frontalisé** sur la photo,
  // schéma exact des visage.glb Android : corr(U, x) = +1, corr(V, y) = −1.
  // On inverse la construction des positions : les UV retombent pile sur le
  // visage, mais régularisées par la pose. La silhouette devient une ellipse
  // orthographique au lieu d'un contour en perspective qui déborde sur les
  // oreilles quand la tête est un peu tournée.
  for (let i = 0; i < FACE_VERTEX_COUNT; i += 1) {
    uv[i * 2] = clamp01(pos[i * 3] / aspect + 0.5);
    uv[i * 2 + 1] = clamp01(0.5 - pos[i * 3 + 1]);
  }

  // Anti-débordement : on rentre les UV du contour vers le centre du visage.
  if (FACE_EDGE_ERODE > 0 && FACE_BOUNDARY.size) {
    let ucx = 0;
    let ucy = 0;
    for (let i = 0; i < FACE_VERTEX_COUNT; i += 1) {
      ucx += uv[i * 2];
      ucy += uv[i * 2 + 1];
    }
    ucx /= FACE_VERTEX_COUNT;
    ucy /= FACE_VERTEX_COUNT;

    for (const i of FACE_BOUNDARY) {
      uv[i * 2] = ucx + (uv[i * 2] - ucx) * (1 - FACE_EDGE_ERODE);
      uv[i * 2 + 1] = ucy + (uv[i * 2 + 1] - ucy) * (1 - FACE_EDGE_ERODE);
    }
  }

  // Bornes de l'accessor POSITION, mesurées APRÈS frontalisation.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < FACE_VERTEX_COUNT; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = pos[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const image = decoderJpeg(texture);

  const posLen = pos.byteLength;
  const uvLen = uv.byteLength;
  const idxLen = TRIANGLES.byteLength;

  const oPos = 0;
  const oUv = aligner(oPos + posLen);
  const oIdx = aligner(oUv + uvLen);
  const oImg = aligner(oIdx + idxLen);
  const binLen = aligner(oImg + image.byteLength);

  const bin = new Uint8Array(binLen);
  bin.set(new Uint8Array(pos.buffer), oPos);
  bin.set(new Uint8Array(uv.buffer), oUv);
  bin.set(new Uint8Array(TRIANGLES.buffer), oIdx);
  bin.set(image, oImg);

  const gltf = {
    asset: { version: "2.0", generator: "MyTwin-face" },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 1 },
            indices: 2,
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        // Non éclairé et double face, comme les visages produits par ARCore :
        // la peau vient de la photo, aucune lumière ne doit s'y ajouter.
        extensions: { KHR_materials_unlit: {} },
        doubleSided: true,
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{}],
    images: [{ bufferView: 3, mimeType: "image/jpeg" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: FACE_VERTEX_COUNT, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: FACE_VERTEX_COUNT, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: TRIANGLES.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: oPos, byteLength: posLen, target: 34962 },
      { buffer: 0, byteOffset: oUv, byteLength: uvLen, target: 34962 },
      { buffer: 0, byteOffset: oIdx, byteLength: idxLen, target: 34963 },
      { buffer: 0, byteOffset: oImg, byteLength: image.byteLength },
    ],
    buffers: [{ byteLength: binLen }],
  };

  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = aligner(json.length) - json.length;
  const jsonLen = json.length + jsonPad;
  const total = 12 + 8 + jsonLen + 8 + binLen;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let o = 0;

  dv.setUint32(o, 0x46546c67, true); // « glTF »
  o += 4;
  dv.setUint32(o, 2, true); // version
  o += 4;
  dv.setUint32(o, total, true);
  o += 4;

  dv.setUint32(o, jsonLen, true);
  o += 4;
  dv.setUint32(o, 0x4e4f534a, true); // « JSON »
  o += 4;
  out.set(json, o);
  o += json.length;
  for (let i = 0; i < jsonPad; i += 1) out[o++] = 0x20; // padding en espaces

  dv.setUint32(o, binLen, true);
  o += 4;
  dv.setUint32(o, 0x004e4942, true); // « BIN\0 »
  o += 4;
  out.set(bin, o);

  return new Blob([out], { type: "model/gltf-binary" });
}
