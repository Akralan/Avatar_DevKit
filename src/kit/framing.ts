import * as THREE from "three";

/**
 * Distance caméra pour qu'une sphère de `radius` tienne dans un champ de
 * `fovDeg`. `margin` > 1 recule (sujet plus petit), < 1 rapproche.
 */
export function fitDistance(radius: number, fovDeg: number, margin: number): number {
  const halfFov = (fovDeg / 2) * (Math.PI / 180);
  return (radius / Math.sin(halfFov)) * margin;
}

/**
 * Cadre la caméra sur un sujet centré à l'origine.
 *
 * Contraint sur les **deux** axes : ne cadrer que la hauteur suffit en
 * paysage, mais en portrait le champ horizontal est plus étroit que
 * l'envergure des bras, et les mains sortent du cadre. Le résultat dépend donc
 * de l'aspect ratio — à rejouer à chaque redimensionnement, pas seulement au
 * chargement du sujet.
 */
export function frameCamera(
  camera: THREE.PerspectiveCamera,
  size: THREE.Vector3,
  { margin = 1.15 }: { margin?: number } = {},
): void {
  const radius = size.length() / 2;

  const vertical = fitDistance(radius, camera.fov, margin);
  const horizontalFov =
    2 *
    Math.atan(Math.tan((camera.fov / 2) * (Math.PI / 180)) * camera.aspect) *
    (180 / Math.PI);
  const horizontal = fitDistance(radius, horizontalFov, margin);

  const distance = Math.max(vertical, horizontal);
  camera.position.set(0, 0, distance);

  // Plans serrés autour du sujet : avec un `far` lointain, la profondeur
  // linéarisée devient quasi constante sur le corps et les rendus qui la
  // modulent n'ont plus rien à moduler.
  camera.near = Math.max(0.01, distance - radius * 1.5);
  camera.far = distance + radius * 1.5;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
