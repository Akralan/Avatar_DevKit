import { vi } from "vitest";

const loadSubject = vi.fn();
vi.mock("../load-subject", () => ({ loadSubject }));

class RendererStub {
  public setPixelRatio = vi.fn();
  public setSize = vi.fn();
  public setClearColor = vi.fn();
  public render = vi.fn();
  public dispose = vi.fn();
}

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: RendererStub };
});

const { capturePoster } = await import("./poster");
const THREE = await import("three");

function sujetFactice() {
  return {
    id: "personnel",
    label: "Le vôtre",
    group: new THREE.Group(),
    size: new THREE.Vector3(0.6, 1.8, 0.4),
  };
}

function interceptToBlob() {
  const appels: (string | undefined)[] = [];
  HTMLCanvasElement.prototype.toBlob = function (callback, type) {
    appels.push(type);
    callback(new Blob(["image"], { type: type ?? "image/png" }));
  };
  return appels;
}

test("le poster est une image à canal alpha, pas une copie du GLB", async () => {
  // WebP et non JPEG : le rendu se fait sur un fond transparent, que le JPEG
  // cuirait en noir faute d'alpha. Le poster doit se poser sur le fond que
  // lui donne le CSS, quel que soit le thème.
  loadSubject.mockResolvedValue(sujetFactice());
  const types = interceptToBlob();

  const poster = await capturePoster(new Blob(["glb"]));

  expect(types[0]).toBe("image/webp");
  expect(poster?.type).toBe("image/webp");
});

test("un GLB illisible ne fait pas échouer l'enregistrement de l'avatar", async () => {
  // Le poster est décoratif. L'avatar, non : son échec ne doit jamais
  // empêcher de ranger le corps qu'on vient d'attendre une minute.
  loadSubject.mockRejectedValue(new Error("GLB corrompu"));

  await expect(capturePoster(new Blob(["pas un glb"]))).resolves.toBeNull();
});

test("l'URL d'objet du GLB est révoquée, même quand le rendu échoue", async () => {
  // Le GLB pèse ~60 Mo : une URL laissée derrière l'épingle en mémoire.
  loadSubject.mockRejectedValue(new Error("GLB corrompu"));
  const revoke = vi.spyOn(URL, "revokeObjectURL");

  await capturePoster(new Blob(["glb"]));

  expect(revoke).toHaveBeenCalled();
});
