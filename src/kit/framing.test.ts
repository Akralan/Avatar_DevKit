import * as THREE from "three";
import { fitDistance, frameCamera } from "./framing";

test("un sujet deux fois plus grand demande deux fois plus de recul", () => {
  expect(fitDistance(2, 35, 1)).toBeCloseTo(fitDistance(1, 35, 1) * 2, 10);
});

test("une marge de 1 place la sphère exactement dans le champ", () => {
  // À 35° de FOV vertical, une sphère de rayon 1 tient pile à d = 1/sin(17,5°).
  expect(fitDistance(1, 35, 1)).toBeCloseTo(1 / Math.sin((35 / 2) * (Math.PI / 180)), 10);
});

test("une marge supérieure à 1 éloigne la caméra", () => {
  expect(fitDistance(1, 35, 1.15)).toBeGreaterThan(fitDistance(1, 35, 1));
});

test("un cadre en portrait recule plus qu'un cadre en paysage", () => {
  // Ne cadrer que la hauteur suffit en paysage ; en portrait, le champ
  // horizontal est plus étroit que l'envergure des bras et les mains sortent.
  const size = new THREE.Vector3(1.6, 1.8, 0.4);

  const paysage = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  frameCamera(paysage, size);
  const portrait = new THREE.PerspectiveCamera(35, 9 / 16, 0.1, 100);
  frameCamera(portrait, size);

  expect(portrait.position.z).toBeGreaterThan(paysage.position.z);
});

test("le plan proche reste devant le sujet, jamais derrière la caméra", () => {
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  frameCamera(camera, new THREE.Vector3(0.2, 0.2, 0.2));

  expect(camera.near).toBeGreaterThan(0);
  expect(camera.far).toBeGreaterThan(camera.near);
});
