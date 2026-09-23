import { storeThumbnail, getThumbnail, listMissingThumbnails } from "./thumbnails";

const VIGNETTE = "data:image/webp;base64,AAAA";

test("une vignette capturée est relue depuis le cache", async () => {
  await storeThumbnail("wireframe", VIGNETTE);

  expect(await getThumbnail("wireframe")).toBe(VIGNETTE);
});

test("une vignette jamais capturée renvoie null au lieu de jeter", async () => {
  expect(await getThumbnail("jamais-visite")).toBeNull();
});

test("recapturer remplace la vignette au lieu d'en accumuler", async () => {
  await storeThumbnail("hologram", "data:image/webp;base64,AAAA");
  await storeThumbnail("hologram", "data:image/webp;base64,BBBB");

  expect(await getThumbnail("hologram")).toBe("data:image/webp;base64,BBBB");
});

test("seuls les modules sans vignette restent à préchauffer", async () => {
  await storeThumbnail("dot-matrix", VIGNETTE);

  const manquants = await listMissingThumbnails();

  expect(manquants).not.toContain("dot-matrix");
  expect(manquants).toContain("reveal");
});

test("le préchauffage ne propose que des modules réellement déclarés", async () => {
  // Une vignette orpheline (module supprimé depuis) ne doit pas ressusciter
  // dans la liste des choses à faire.
  const manquants = await listMissingThumbnails();

  expect(manquants).not.toContain("jamais-visite");
});
