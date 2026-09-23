import { getThumbnail, storeThumbnail } from "./thumbnails";
import { getSubjectThumbnail, storeSubjectThumbnail } from "./subject-thumbnails";

test("un aperçu de sujet se relit après avoir été rangé", async () => {
  await storeSubjectThumbnail("male_body", "data:image/webp;base64,SUJET");

  expect(await getSubjectThumbnail("male_body")).toBe("data:image/webp;base64,SUJET");
});

test("un sujet sans aperçu renvoie null au lieu de jeter", async () => {
  expect(await getSubjectThumbnail("jamais-vu")).toBeNull();
});

test("les aperçus de sujets n'écrasent pas les vignettes de rendus", async () => {
  // `wireframe` est à la fois un id de rendu et un id possible de sujet : sans
  // espace de noms séparé, l'un effacerait l'autre.
  await storeThumbnail("collision", "data:image/webp;base64,RENDU");
  await storeSubjectThumbnail("collision", "data:image/webp;base64,SUJET");

  expect(await getThumbnail("collision")).toBe("data:image/webp;base64,RENDU");
  expect(await getSubjectThumbnail("collision")).toBe("data:image/webp;base64,SUJET");
});
