import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SubjectDescriptor } from "./subjects";
import type { Subject } from "./types";

/** Nomme le sujet et son URL : un asset mal placé doit se diagnostiquer sans
 *  ouvrir l'onglet réseau. */
export class SubjectLoadError extends Error {
  public constructor(descriptor: SubjectDescriptor, cause: unknown) {
    super(
      `Le sujet « ${descriptor.label} » n'a pas pu être chargé depuis ${descriptor.url}. ` +
        `Vérifiez que le fichier existe dans public/models/.`,
    );
    this.name = "SubjectLoadError";
    this.cause = cause;
  }
}

interface LoadedGltf {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export async function loadSubject(descriptor: SubjectDescriptor): Promise<Subject> {
  const loader = new GLTFLoader();

  const gltf = await new Promise<LoadedGltf>((resolve, reject) => {
    loader.load(
      descriptor.url,
      (loaded) => resolve(loaded as LoadedGltf),
      undefined,
      (error) => reject(new SubjectLoadError(descriptor, error)),
    );
  });

  const group = gltf.scene;
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());

  // Recentrage sur l'origine : tout le kit (cadrage, orbit) suppose un sujet
  // centré, et les GLB arrivent avec des origines arbitraires.
  group.position.sub(box.getCenter(new THREE.Vector3()));

  const [firstClip] = gltf.animations;
  const mixer = firstClip ? new THREE.AnimationMixer(group) : undefined;
  if (mixer && firstClip) mixer.clipAction(firstClip).play();

  return { id: descriptor.id, label: descriptor.label, group, size, mixer };
}
