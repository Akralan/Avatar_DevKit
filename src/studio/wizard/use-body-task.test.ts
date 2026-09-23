import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

const startBody = vi.fn();
const getBodyStatus = vi.fn();
vi.mock("../../kit/avatar/api", () => ({ startBody, getBodyStatus }));

const { useBodyTask, COLD_START_HINT_MS } = await import("./use-body-task");

const photo = () => new File(["x"], "face.jpg", { type: "image/jpeg" });

beforeEach(() => {
  startBody.mockResolvedValue("abc123");
  getBodyStatus.mockResolvedValue({ status: "IN_PROGRESS", progress: 38 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test("la génération du corps commence dès la photo, sans attendre le visage", async () => {
  // C'est le recouvrement qui rend l'attente supportable : les deux étapes ne
  // s'additionnent pas.
  const { result } = renderHook(() => useBodyTask());

  act(() => result.current.start([photo()], {}));

  await waitFor(() => expect(result.current.taskId).toBe("abc123"));
});

test("la progression remontée par le backend est exposée telle quelle", async () => {
  const { result } = renderHook(() => useBodyTask());

  act(() => result.current.start([photo()], {}));

  await waitFor(() => expect(result.current.progress).toBe(38));
});

test("une erreur du backend remonte son message au lieu d'une barre figée", async () => {
  startBody.mockRejectedValue(new Error("Maximum 4 images."));
  const { result } = renderHook(() => useBodyTask());

  act(() => result.current.start([photo()], {}));

  await waitFor(() => expect(result.current.error).toBe("Maximum 4 images."));
});

test("un backend en démarrage à froid n'immobilise pas l'interface sans explication", async () => {
  // Le conteneur scale à zéro : la première requête après inactivité charge
  // rembg et mediapipe. Une barre immobile sans mot ressemble à une panne.
  vi.useFakeTimers();
  let resoudre: (id: string) => void = () => {};
  startBody.mockReturnValue(new Promise<string>((r) => (resoudre = r)));

  const { result } = renderHook(() => useBodyTask());
  act(() => result.current.start([photo()], {}));

  expect(result.current.hint).toBeNull();
  act(() => void vi.advanceTimersByTime(COLD_START_HINT_MS + 10));

  expect(result.current.hint).toMatch(/démarre/i);
  resoudre("abc");
});

test("le sondage s'arrête au démontage, pas seulement à la fin de la tâche", async () => {
  const { result, unmount } = renderHook(() => useBodyTask());
  act(() => result.current.start([photo()], {}));
  await waitFor(() => expect(getBodyStatus).toHaveBeenCalled());

  unmount();
  const appels = getBodyStatus.mock.calls.length;
  await new Promise((r) => setTimeout(r, 60));

  expect(getBodyStatus.mock.calls.length).toBe(appels);
});

test("une tâche terminée arrête le sondage d'elle-même", async () => {
  getBodyStatus.mockResolvedValue({ status: "SUCCEEDED", progress: 100 });
  const { result } = renderHook(() => useBodyTask());

  act(() => result.current.start([photo()], {}));

  await waitFor(() => expect(result.current.ready).toBe(true));
});
