import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/** Même fichier que celui qu'utilise le backend : les points détectés dans le
 *  navigateur doivent correspondre à ceux qu'attend la greffe. */
export const FACE_MODEL_PATH = "/models/face_landmarker.task";

/** Peuplé par `scripts/copy-mediapipe-wasm.mjs` au postinstall. Pointer
 *  directement dans node_modules marcherait en dev et casserait le build. */
export const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";

export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);

  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}
