import { vi } from "vitest";

const load = vi.fn();
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load = load;
  },
}));

const { loadSubject, SubjectLoadError } = await import("./load-subject");

const DESCRIPTOR = {
  id: "male_body",
  label: "male_body",
  url: "/models/male_body.glb",
  origin: "livré" as const,
  locked: true,
};

test("un GLB introuvable remonte une erreur qui nomme le sujet", async () => {
  load.mockImplementation((_url, _ok, _progress, fail) => fail(new Error("404")));

  await expect(loadSubject(DESCRIPTOR)).rejects.toThrow(SubjectLoadError);
  await expect(loadSubject(DESCRIPTOR)).rejects.toThrow(/male_body/);
});

test("l'erreur cite l'URL, pour qu'un asset mal placé se diagnostique seul", async () => {
  load.mockImplementation((_url, _ok, _progress, fail) => fail(new Error("404")));

  await expect(loadSubject(DESCRIPTOR)).rejects.toThrow(/\/models\/male_body\.glb/);
});

test("l'erreur conserve la cause d'origine pour le débogage", async () => {
  const cause = new Error("réseau coupé");
  load.mockImplementation((_url, _ok, _progress, fail) => fail(cause));

  await expect(loadSubject(DESCRIPTOR)).rejects.toMatchObject({ cause });
});
