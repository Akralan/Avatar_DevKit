import * as THREE from "three";
import { THUMBNAILS_STORE, withStore } from "./db";
import { frameCamera } from "./framing";
import { loadSubject } from "./load-subject";
import { listSubjects } from "./subjects";
import { THUMBNAIL_FORMAT, THUMBNAIL_QUALITY } from "./thumbnails";

/**
 * Les aperçus de sujets partagent le magasin des vignettes de rendus, mais pas
 * leur espace de noms : un identifiant peut très bien désigner les deux, et
 * l'un effacerait l'autre.
 */
const PREFIX = "subject:";

const SIZE = 480;

export async function getSubjectThumbnail(id: string): Promise<string | null> {
  const stored = await withStore<string | undefined>(THUMBNAILS_STORE, "readonly", (store) =>
    store.get(PREFIX + id),
  );

  return stored ?? null;
}

export async function storeSubjectThumbnail(id: string, dataUrl: string): Promise<void> {
  await withStore(THUMBNAILS_STORE, "readwrite", (store) => store.put(dataUrl, PREFIX + id));
}

/**
 * Rend les aperçus manquants, un par un dans un seul contexte WebGL réutilisé —
 * même contrainte que pour les vignettes de rendus : les navigateurs plafonnent
 * le nombre de contextes simultanés.
 *
 * Le rendu est volontairement neutre : c'est le corps qu'on regarde, pas un
 * effet. Aucune erreur ne remonte, un sujet illisible perd son aperçu.
 */
export async function warmSubjectThumbnails(): Promise<void> {
  const subjects = await listSubjects();
  const missing: typeof subjects = [];

  for (const subject of subjects) {
    if (!(await getSubjectThumbnail(subject.id))) missing.push(subject);
  }
  if (!missing.length) return;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return; // pas de WebGL : la page affichera des cadres vides
  }

  try {
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);

    for (const descriptor of missing) {
      try {
        const subject = await loadSubject(descriptor);

        const scene = new THREE.Scene();
        const material = new THREE.MeshStandardMaterial({
          color: 0x8b95a5,
          roughness: 0.85,
          metalness: 0,
        });
        subject.group.traverse((child) => {
          if (child instanceof THREE.Mesh) child.material = material;
        });

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
        const dataUrl = canvas.toDataURL(THUMBNAIL_FORMAT, THUMBNAIL_QUALITY);
        material.dispose();

        await storeSubjectThumbnail(descriptor.id, dataUrl);
      } catch {
        // Un sujet illisible perd son aperçu, pas la page.
      }
    }
  } finally {
    renderer.dispose();
  }
}
