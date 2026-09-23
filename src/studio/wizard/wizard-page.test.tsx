import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

const startBody = vi.fn();
const getBodyStatus = vi.fn();
const graft = vi.fn();
vi.mock("../../kit/avatar/api", () => ({ startBody, getBodyStatus, graft }));

const savePersonalSubject = vi.fn();
vi.mock("../../kit/avatar/personal-subject", () => ({ savePersonalSubject }));

const capturePoster = vi.fn();
vi.mock("../../kit/avatar/poster", () => ({ capturePoster }));

// L'étape visage a ses propres tests : ici on ne veut que son signal de sortie.
vi.mock("./face-step", () => ({
  FaceStep: ({ onCaptured }: { onCaptured: (glb: Blob) => void }) => (
    <button type="button" onClick={() => onCaptured(new Blob(["face"]))}>
      simuler la capture
    </button>
  ),
}));

const { WizardPage } = await import("./wizard-page");

function afficher() {
  render(
    <MemoryRouter>
      <WizardPage />
    </MemoryRouter>,
  );
}

const photo = () => new File(["x"], "face.jpg", { type: "image/jpeg" });

beforeEach(() => {
  startBody.mockResolvedValue("abc123");
  getBodyStatus.mockResolvedValue({ status: "SUCCEEDED", progress: 100 });
  graft.mockResolvedValue(new Blob(["avatar"]));
  capturePoster.mockResolvedValue(null);
  savePersonalSubject.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

test("le parcours s'ouvre sur l'étape photo", () => {
  afficher();

  expect(screen.getByLabelText(/photo/i)).toBeInTheDocument();
});

test("les quatre étapes du parcours sont annoncées d'emblée", () => {
  // On attend une minute de calcul : savoir où l'on en est fait la différence
  // entre patienter et croire que c'est planté.
  afficher();

  const etapes = screen.getAllByRole("listitem").map((item) => item.textContent);

  expect(etapes).toHaveLength(4);
  expect(etapes[0]).toMatch(/photo/i);
  expect(etapes[1]).toMatch(/visage/i);
  expect(etapes[2]).toMatch(/greffe/i);
  expect(etapes[3]).toMatch(/sujet/i);
});

test("déposer une photo lance la génération du corps et passe au visage", async () => {
  // Le recouvrement : le corps se fabrique pendant qu'on cadre son visage.
  afficher();

  await userEvent.upload(screen.getByLabelText(/photo/i), photo());

  await waitFor(() => expect(startBody).toHaveBeenCalled());
  expect(await screen.findByRole("button", { name: /simuler la capture/i })).toBeInTheDocument();
});

test("la greffe part quand le corps et le visage sont tous deux prêts", async () => {
  afficher();
  await userEvent.upload(screen.getByLabelText(/photo/i), photo());
  await screen.findByRole("button", { name: /simuler la capture/i });

  await userEvent.click(screen.getByRole("button", { name: /simuler la capture/i }));

  await waitFor(() => expect(graft).toHaveBeenCalledWith("abc123", expect.any(Blob), {}));
});

test("l'avatar greffé est rangé sur l'appareil", async () => {
  afficher();
  await userEvent.upload(screen.getByLabelText(/photo/i), photo());
  await screen.findByRole("button", { name: /simuler la capture/i });

  await userEvent.click(screen.getByRole("button", { name: /simuler la capture/i }));

  await waitFor(() => expect(savePersonalSubject).toHaveBeenCalled());
});

test("un poster illisible n'empêche pas de ranger l'avatar", async () => {
  // Le poster est décoratif, l'avatar ne l'est pas.
  capturePoster.mockRejectedValue(new Error("rendu impossible"));
  afficher();
  await userEvent.upload(screen.getByLabelText(/photo/i), photo());
  await screen.findByRole("button", { name: /simuler la capture/i });

  await userEvent.click(screen.getByRole("button", { name: /simuler la capture/i }));

  await waitFor(() => expect(savePersonalSubject).toHaveBeenCalled());
});

test("une greffe qui échoue affiche le message du backend", async () => {
  graft.mockRejectedValue(new Error("Aucun visage détecté sur la photo"));
  afficher();
  await userEvent.upload(screen.getByLabelText(/photo/i), photo());
  await screen.findByRole("button", { name: /simuler la capture/i });

  await userEvent.click(screen.getByRole("button", { name: /simuler la capture/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Aucun visage détecté sur la photo");
});
