import { buildFaceGlb, FACE_EDGE_ERODE, FACE_TEX_MAX } from "./build-face-glb";
import { FACE_TRIANGULATION, FACE_VERTEX_COUNT } from "./face-triangulation";

function landmarks(count = FACE_VERTEX_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    x: 0.5 + Math.cos(i) * 0.12,
    y: 0.5 + Math.sin(i) * 0.18,
    z: Math.cos(i * 0.5) * 0.02,
  }));
}

function texture(width = 1024, height = 768) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // jsdom n'encode pas de JPEG : on fournit une charge utile valide en base64.
  canvas.toDataURL = () => "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  return canvas;
}

/** Relit le GLB produit. C'est le seul moyen de vérifier la géométrie sans la
 *  rendre — et un masque mal formé ne lève aucune erreur, il greffe de travers. */
async function lire(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binOffset = 20 + jsonLength + 8;

  const lireAccessor = (index: number) => {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const composantes = accessor.type === "VEC3" ? 3 : 2;
    return new Float32Array(
      buffer,
      binOffset + (bufferView.byteOffset ?? 0),
      accessor.count * composantes,
    );
  };

  const primitive = json.meshes[0].primitives[0];
  return {
    json,
    positions: lireAccessor(primitive.attributes.POSITION),
    uvs: lireAccessor(primitive.attributes.TEXCOORD_0),
  };
}

test("la triangulation canonique compte exactement 898 triangles", () => {
  expect(FACE_TRIANGULATION.length).toBe(898 * 3);
});

test("le blob produit est un glTF binaire", async () => {
  const blob = buildFaceGlb(landmarks(), texture(), null);
  const magie = new Uint8Array(await blob.slice(0, 4).arrayBuffer());

  expect(String.fromCharCode(...magie)).toBe("glTF");
  expect(blob.type).toBe("model/gltf-binary");
});

test("le maillage porte exactement 478 sommets et 2694 indices", async () => {
  const { json, positions } = await lire(buildFaceGlb(landmarks(), texture(), null));

  expect(positions).toHaveLength(FACE_VERTEX_COUNT * 3);
  expect(json.accessors[2].count).toBe(898 * 3);
});

test("des landmarks incomplets sont refusés avant l'envoi au backend", () => {
  expect(() => buildFaceGlb(landmarks(300), texture(), null)).toThrow(/incomplets/);
});

test("le ratio de la photo est compensé, sinon le visage part écrasé", async () => {
  // p.x est normalisé par la largeur, p.y par la hauteur : sans correction, le
  // visage sort écrasé horizontalement.
  const points = landmarks();
  const large = await lire(buildFaceGlb(points, texture(1024, 768), null));
  const carre = await lire(buildFaceGlb(points, texture(1024, 1024), null));

  const etendue = (p: Float32Array) =>
    Math.max(...Array.from({ length: FACE_VERTEX_COUNT }, (_, i) => Math.abs(p[i * 3])));

  expect(etendue(large.positions) / etendue(carre.positions)).toBeCloseTo(1024 / 768, 2);
});

test("les UV restent dans la photo, jamais au-delà", async () => {
  const { uvs } = await lire(buildFaceGlb(landmarks(), texture(), null));

  expect(Math.min(...uvs)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...uvs)).toBeLessThanOrEqual(1);
});

test("la texture est plafonnée pour ne pas faire sauter le conteneur backend", () => {
  // Le rastériseur du backend décode la texture en numpy brut : une image 4K
  // fait sauter le conteneur en mémoire.
  expect(FACE_TEX_MAX).toBe(1024);
});

test("le contour est rentré vers l'intérieur du visage", () => {
  // Sans cette érosion, les triangles de bordure échantillonnent le fond
  // derrière la tête au lieu de la peau.
  expect(FACE_EDGE_ERODE).toBeGreaterThan(0);
  expect(FACE_EDGE_ERODE).toBeLessThan(0.2);
});

test("le matériau est non éclairé et double face, comme les visages ARCore", async () => {
  const { json } = await lire(buildFaceGlb(landmarks(), texture(), null));

  expect(json.materials[0].extensions).toHaveProperty("KHR_materials_unlit");
  expect(json.materials[0].doubleSided).toBe(true);
});
