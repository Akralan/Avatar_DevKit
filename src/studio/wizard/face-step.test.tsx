import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const createFaceLandmarker = vi.fn();
vi.mock("../../kit/face/landmarker", () => ({
  createFaceLandmarker,
  FACE_MODEL_PATH: "/models/face_landmarker.task",
}));

vi.mock("../../kit/avatar/subject-preview", () => ({
  SubjectPreview: () => <div data-testid="apercu" />,
}));

const { FaceStep } = await import("./face-step");

function camera(comportement: "ok" | "refusee" | "absente") {
  const getUserMedia = vi.fn();

  if (comportement === "ok") {
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  } else {
    const nom = comportement === "refusee" ? "NotAllowedError" : "NotFoundError";
    getUserMedia.mockRejectedValue(new DOMException(nom, nom));
  }

  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
  return getUserMedia;
}

beforeEach(() => {
  createFaceLandmarker.mockResolvedValue({
    detectForVideo: () => ({ faceLandmarks: [], facialTransformationMatrixes: [] }),
    close: vi.fn(),
  });
});

afterEach(() => vi.unstubAllGlobals());

test("une caméra refusée est annoncée avec le geste à faire", async () => {
  camera("refusee");

  render(<FaceStep onCaptured={vi.fn()} localFace={false} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(/autoris/i);
});

test("l'absence de caméra propose le mode test au lieu d'un cul-de-sac", async () => {
  camera("absente");

  render(<FaceStep onCaptured={vi.fn()} localFace={false} />);

  expect(await screen.findByRole("button", { name: /visage de test/i })).toBeInTheDocument();
});

test("le bouton de capture reste inactif tant qu'aucun visage n'est détecté", async () => {
  camera("ok");

  render(<FaceStep onCaptured={vi.fn()} localFace={false} />);

  expect(await screen.findByRole("button", { name: /prendre la photo/i })).toBeDisabled();
});

test("le mode test n'ouvre pas la caméra du tout", () => {
  // Le backend ignorera le masque envoyé : demander la caméra ne servirait
  // qu'à faire clignoter un voyant pour rien.
  const getUserMedia = camera("ok");

  render(<FaceStep onCaptured={vi.fn()} localFace />);

  expect(getUserMedia).not.toHaveBeenCalled();
});

test("le mode test remet un masque au wizard sans passer par la caméra", async () => {
  camera("ok");
  const onCaptured = vi.fn();
  render(<FaceStep onCaptured={onCaptured} localFace />);

  await userEvent.click(screen.getByRole("button", { name: /visage de test/i }));

  expect(onCaptured).toHaveBeenCalledOnce();
});

test("le détecteur est libéré au démontage", async () => {
  // Il tient un contexte WASM et le flux caméra : le laisser vivre garderait
  // le voyant de la webcam allumé après avoir quitté l'écran.
  const close = vi.fn();
  const stop = vi.fn();
  createFaceLandmarker.mockResolvedValue({
    detectForVideo: () => ({ faceLandmarks: [], facialTransformationMatrixes: [] }),
    close,
  });
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  });

  const { unmount } = render(<FaceStep onCaptured={vi.fn()} localFace={false} />);
  // Le détecteur naît de façon asynchrone : attendre le bouton ne garantit pas
  // qu'il existe déjà.
  await waitFor(() => expect(createFaceLandmarker).toHaveBeenCalled());
  await waitFor(() => {});

  unmount();

  expect(close).toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
});
