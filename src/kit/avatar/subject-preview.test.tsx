import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

const loadSubject = vi.fn();
vi.mock("../load-subject", () => ({ loadSubject }));

const renderers: RendererStub[] = [];

class RendererStub {
  public setPixelRatio = vi.fn();
  public setSize = vi.fn();
  public setClearColor = vi.fn();
  public render = vi.fn();
  public dispose = vi.fn();

  public constructor() {
    renderers.push(this);
  }
}

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: RendererStub };
});

const { SubjectPreview } = await import("./subject-preview");
const THREE = await import("three");

beforeEach(() => {
  renderers.length = 0;
  loadSubject.mockResolvedValue({
    id: "apercu",
    label: "aperçu",
    group: new THREE.Group(),
    size: new THREE.Vector3(0.6, 1.8, 0.4),
  });
});

test("l'aperçu monte un canvas", async () => {
  render(<SubjectPreview src="blob:devkit/1" />);

  await waitFor(() => expect(document.querySelector("canvas")).toBeInTheDocument());
});

test("démonter l'aperçu libère le contexte WebGL", async () => {
  // Le wizard en monte un par étape : sans libération, quelques allers-retours
  // épuiseraient le plafond de contextes du navigateur.
  const { unmount } = render(<SubjectPreview src="blob:devkit/1" />);
  await waitFor(() => expect(renderers).toHaveLength(1));

  unmount();

  expect(renderers[0].dispose).toHaveBeenCalledOnce();
});

test("un GLB illisible est annoncé, pas affiché comme un cadre vide", async () => {
  loadSubject.mockRejectedValue(new Error("GLB corrompu"));

  render(<SubjectPreview src="blob:devkit/casse" />);

  expect(await screen.findByRole("alert")).toBeInTheDocument();
});
