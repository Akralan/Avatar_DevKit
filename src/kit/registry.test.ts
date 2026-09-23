import { getRenderModule, listRenderModules } from "./registry";

test("les modules du dossier renders sont découverts sans index", () => {
  const ids = listRenderModules().map((module) => module.id);

  expect(ids).toContain("wireframe");
});

test("un id inconnu ne fait pas planter l'appelant", () => {
  expect(getRenderModule("nexistepas")).toBeUndefined();
});

test("un id connu renvoie son module", () => {
  expect(getRenderModule("wireframe")?.id).toBe("wireframe");
});

test("les modules sont triés par titre, pour un ordre de galerie stable", () => {
  const titles = listRenderModules().map((module) => module.title);

  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "fr")));
});
