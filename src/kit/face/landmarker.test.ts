import { vi } from "vitest";

const createFromOptions = vi.fn().mockResolvedValue({ mocked: true });
const forVisionTasks = vi.fn().mockResolvedValue("fileset");

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks },
  FaceLandmarker: { createFromOptions },
}));

test("le landmarker reprend les options validées du pipeline", async () => {
  const { createFaceLandmarker } = await import("./landmarker");
  await createFaceLandmarker();

  expect(createFromOptions).toHaveBeenCalledWith("fileset", {
    baseOptions: {
      modelAssetPath: "/models/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    // Indispensable : la frontalisation du masque facial s'appuie sur cette
    // matrice de pose. Ce n'est pas une option par défaut.
    outputFacialTransformationMatrixes: true,
  });
});

test("le WASM est servi par l'application, jamais depuis un CDN", async () => {
  const { createFaceLandmarker } = await import("./landmarker");
  await createFaceLandmarker();

  const [wasmRoot] = forVisionTasks.mock.calls[0];
  expect(wasmRoot).not.toMatch(/^https?:/);
});

test("le WASM est servi par une route stable, pas depuis node_modules", async () => {
  // node_modules n'existe qu'en développement : un chemin qui pointe dedans
  // produit un `vite build` cassé sans que rien ne le signale.
  const { createFaceLandmarker, MEDIAPIPE_WASM_PATH } = await import("./landmarker");
  await createFaceLandmarker();

  expect(MEDIAPIPE_WASM_PATH).toBe("/mediapipe/wasm");
  expect(forVisionTasks.mock.calls[0][0]).not.toMatch(/node_modules/);
});
