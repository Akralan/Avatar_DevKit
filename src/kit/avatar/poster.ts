import * as THREE from "three";
import { frameCamera } from "../framing";
import { loadSubject } from "../load-subject";

const SIZE = 320;
// WebP et non JPEG : le rendu est fait sur un fond transparent, et le JPEG,
// qui n'a pas d'alpha, le cuirait en noir. Le poster serait alors une tache
// sombre dans une carte claire. En WebP il garde son alpha et se pose sur le
// fond que lui donne le CSS, quel que soit le thème.
const FORMAT = "image/webp";
const QUALITY = 0.8;

/**
 * Vignette d'un avatar fraîchement greffé, pour la carte du sujet personnel.
 *
 * **Renvoie `null` plutôt que de jeter.** Le poster est décoratif ; l'avatar ne
 * l'est pas. Son échec ne doit jamais empêcher de ranger un corps qu'on vient
 * d'attendre une minute.
 */
export async function capturePoster(glb: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(glb);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  let renderer: THREE.WebGLRenderer | undefined;

  try {
    const subject = await loadSubject({
      id: "poster",
      label: "avatar",
      url,
      origin: "personnel",
      locked: false,
    });

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(subject.group);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 6, 8);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    frameCamera(camera, subject.size, { margin: 1.05 });

    renderer.render(scene, camera);

    // Lu dans la même tâche que le rendu : le buffer de dessin est vidé dès
    // que le navigateur compose.
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), FORMAT, QUALITY);
    });
  } catch {
    return null;
  } finally {
    renderer?.dispose();
    URL.revokeObjectURL(url);
  }
}
