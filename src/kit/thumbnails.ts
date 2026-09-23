import { THUMBNAILS_STORE, withStore } from "./db";
import { listRenderModules } from "./registry";

/** WebP à 0.8 : une tuile de galerie, pas une planche contact. */
export const THUMBNAIL_FORMAT = "image/webp";
export const THUMBNAIL_QUALITY = 0.8;

export async function getThumbnail(id: string): Promise<string | null> {
  const stored = await withStore<string | undefined>(THUMBNAILS_STORE, "readonly", (store) =>
    store.get(id),
  );

  return stored ?? null;
}

/**
 * Range une vignette déjà produite. L'appelant est responsable de l'avoir
 * lue juste après un rendu : le buffer de dessin WebGL est vidé dès que le
 * navigateur compose, et une lecture différée rendrait une image vide.
 */
export async function storeThumbnail(id: string, dataUrl: string): Promise<void> {
  await withStore(THUMBNAILS_STORE, "readwrite", (store) => store.put(dataUrl, id));
}

/**
 * Les rendus qui n'ont pas encore de vignette. Une vignette orpheline — module
 * supprimé depuis — n'y figure pas : la liste décrit du travail à faire, pas
 * l'état de la base.
 */
export async function listMissingThumbnails(): Promise<string[]> {
  const stored = await withStore<IDBValidKey[]>(THUMBNAILS_STORE, "readonly", (store) =>
    store.getAllKeys(),
  );
  const connus = new Set(stored.map(String));

  return listRenderModules()
    .map((module) => module.id)
    .filter((id) => !connus.has(id));
}
