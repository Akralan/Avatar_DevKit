import * as THREE from "three";
import { REVEAL_SEEDS } from "./config";
import type { RevealPass } from "./reveal-pass";

// Réutilisés à chaque frame : pas d'allocation dans la boucle de rendu.
const SCRATCH_HALF = new THREE.Vector3();
const SCRATCH_POINT = new THREE.Vector3();

/** Point local du sujet → UV écran (origine en bas à gauche, comme les UV). */
function toScreenUv(
  point: THREE.Vector3,
  matrixWorld: THREE.Matrix4,
  camera: THREE.Camera,
): THREE.Vector3 {
  return point
    .applyMatrix4(matrixWorld)
    .project(camera)
    .multiplyScalar(0.5)
    .addScalar(0.5);
}

/**
 * Reprojette le sujet dans les uniforms du quad, à chaque frame rendue : douze
 * projections, c'est gratuit, et ça évite au shader toute connaissance de la
 * scène 3D.
 *
 * - **Bornes du dégradé** : la diagonale écran est ramenée sur l'emprise du
 *   sujet. Sans ça, un corps haut et étroit n'occupe que la portion centrale
 *   de la diagonale plein cadre et n'atteint jamais les deux couleurs.
 * - **Hauteur du sujet**, en fractions de largeur de cadre : c'est l'unité
 *   dans laquelle le shader mesure le front de propagation, ce qui lui donne
 *   la même allure quelle que soit la taille à laquelle le corps est cadré.
 * - **Emprise verticale** en UV : l'axe pieds → crâne que les courants
 *   remontent ou redescendent.
 * - **Germes** : posés en fractions de hauteur sur la boîte du sujet, ils
 *   suivent la pose — donc le drag — sans que personne ait à les recalculer.
 */
export function projectSubject(
  pass: RevealPass,
  camera: THREE.Camera,
  matrixWorld: THREE.Matrix4,
  size: THREE.Vector3,
  aspect: number,
): void {
  const uniforms = pass.material.uniforms;
  // La boîte est centrée sur l'origine du groupe (cf. `centerModel`) : la
  // matrice du groupe suffit à porter n'importe lequel de ses points en scène.
  const half = SCRATCH_HALF.copy(size).multiplyScalar(0.5);

  let minDiagonal = Infinity;
  let maxDiagonal = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let corner = 0; corner < 8; corner += 1) {
    const uv = toScreenUv(
      SCRATCH_POINT.set(
        corner & 1 ? half.x : -half.x,
        corner & 2 ? half.y : -half.y,
        corner & 4 ? half.z : -half.z,
      ),
      matrixWorld,
      camera,
    );

    const diagonal = (uv.x + (1 - uv.y)) * 0.5;
    minDiagonal = Math.min(minDiagonal, diagonal);
    maxDiagonal = Math.max(maxDiagonal, diagonal);
    minV = Math.min(minV, uv.y);
    maxV = Math.max(maxV, uv.y);
  }

  uniforms.uGradientRange.value.set(minDiagonal, maxDiagonal);
  uniforms.uSubjectSpan.value.set(minV, maxV);
  // Un écart vertical d'UV ne vaut pas le même nombre de pixels qu'un écart
  // horizontal : la division par l'aspect ramène les deux à la même aune.
  uniforms.uSubjectHeight.value = (maxV - minV) / aspect;

  const seeds = uniforms.uSeeds.value as THREE.Vector2[];
  for (let index = 0; index < REVEAL_SEEDS.length; index += 1) {
    const seed = REVEAL_SEEDS[index];
    const uv = toScreenUv(
      // Les deux axes de l'ancre sont normalisés par la hauteur du sujet, cf.
      // `REVEAL_SEEDS` : la largeur de sa boîte est l'envergure des bras.
      SCRATCH_POINT.set(seed.x * size.y, seed.y * size.y, 0),
      matrixWorld,
      camera,
    );

    seeds[index].set(uv.x, uv.y);
  }
}
