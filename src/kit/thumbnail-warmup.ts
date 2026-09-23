import * as THREE from "three";
import { frameCamera } from "./framing";
import { loadSubject } from "./load-subject";
import { getRenderModule } from "./registry";
import { DEFAULT_SUBJECT_ID, listSubjects } from "./subjects";
import { listMissingThumbnails, storeThumbnail, THUMBNAIL_FORMAT, THUMBNAIL_QUALITY } from "./thumbnails";

const SIZE = 480;

/** Deux bonds de cinq secondes : assez pour qu'un rendu chorégraphié soit
 *  arrivé à son état final au moment de la capture. */
const WARMUP_FRAMES = [5, 5];

/**
 * Remet le renderer dans un état neutre entre deux modules.
 *
 * Le préchauffage réutilise **un seul** contexte WebGL pour tous les rendus, et
 * un module a parfaitement le droit de configurer le renderer à sa guise :
 * `hologram` y pose un tone mapping AgX et une exposition basse. Sans cette
 * remise à zéro, les vignettes des modules rendus ensuite sortiraient sombres
 * et délavées, sans que rien ne le signale.
 */
export function resetRendererState(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(null);
}

/**
 * Génère les vignettes manquantes **une par une dans un seul contexte WebGL
 * réutilisé**. Un canvas par tuile est exclu : les navigateurs plafonnent à une
 * poignée de contextes simultanés, et la galerie en demanderait autant qu'elle
 * a de rendus.
 *
 * Aucune erreur ne remonte : un module qui ne compile pas doit laisser sa tuile
 * sans image, pas casser la galerie des autres.
 */
export async function warmMissingThumbnails(): Promise<void> {
  const missing = await listMissingThumbnails();
  if (!missing.length) return;

  const subjects = await listSubjects();
  const descriptor =
    subjects.find((candidate) => candidate.id === DEFAULT_SUBJECT_ID) ?? subjects[0];
  if (!descriptor) return;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return; // pas de WebGL : la galerie s'affichera sans vignettes
  }

  try {
    const subject = await loadSubject(descriptor);

    for (const id of missing) {
      const module = getRenderModule(id);
      if (!module) continue;

      resetRendererState(renderer);

      try {
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        const instance = module.create({ canvas, renderer, camera, subject });
        instance.setConfig(module.defaultConfig);

        renderer.setPixelRatio(1);
        renderer.setSize(SIZE, SIZE, false);
        frameCamera(camera, subject.size);
        instance.resize(SIZE, SIZE, 1);

        let elapsed = 0;
        for (const delta of WARMUP_FRAMES) {
          elapsed += delta;
          instance.frame({ delta, elapsed, rotation: 0, reduceMotion: false });
        }

        // Lu immédiatement après le rendu, dans la même tâche : le buffer de
        // dessin est vidé dès que le navigateur compose.
        const dataUrl = canvas.toDataURL(THUMBNAIL_FORMAT, THUMBNAIL_QUALITY);
        instance.dispose();

        await storeThumbnail(id, dataUrl);
      } catch {
        // Un rendu cassé perd sa vignette, pas la galerie.
      }
    }
  } catch {
    // Sujet illisible : pas de vignettes, mais rien ne casse.
  } finally {
    renderer.dispose();
  }
}

/** Lance le préchauffage quand le navigateur n'a rien de mieux à faire. */
export function scheduleWarmup(): () => void {
  const start = () => void warmMissingThumbnails();

  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(start, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }

  const handle = setTimeout(start, 400);
  return () => clearTimeout(handle);
}
