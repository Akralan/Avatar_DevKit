import { vi } from "vitest";
import { SUBJECT_STORE, withStore } from "../db";
import {
  deletePersonalSubject,
  getPersonalSubject,
  PERSONAL_SUBJECT_ID,
  QuotaError,
  savePersonalSubject,
} from "./personal-subject";

/** Nombre d'enregistrements dans le magasin des sujets. L'invariant « un seul »
 *  se lit là, et non dans le contenu des blobs : le clonage structuré de
 *  fake-indexeddb ne restitue pas leur prototype. */
const compterSujets = () =>
  withStore<number>(SUBJECT_STORE, "readonly", (store) => store.count());

afterEach(async () => {
  vi.restoreAllMocks();
  await deletePersonalSubject();
});

test("il n'y a jamais qu'un seul sujet personnel", async () => {
  await savePersonalSubject(new Blob(["premier"]), null);
  await savePersonalSubject(new Blob(["second"]), null);

  expect(await compterSujets()).toBe(1);
});

test("aucun sujet personnel tant que rien n'a été généré", async () => {
  expect(await getPersonalSubject()).toBeNull();
});

test("le sujet personnel porte sa date de création", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);

  expect((await getPersonalSubject())!.createdAt).toBeGreaterThan(0);
});

test("supprimer le rend introuvable", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);

  await deletePersonalSubject();

  expect(await getPersonalSubject()).toBeNull();
});

test("une écriture qui dépasse le quota ne détruit pas l'existant", async () => {
  await savePersonalSubject(new Blob(["ancien"]), null);
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });

  const avant = (await getPersonalSubject())!.createdAt;

  await expect(savePersonalSubject(new Blob(["trop gros"]), null)).rejects.toThrow(QuotaError);

  const apres = await getPersonalSubject();
  expect(apres).not.toBeNull();
  expect(apres!.createdAt).toBe(avant);
});

test("le message de quota dit quoi faire, pas seulement que ça a raté", async () => {
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });

  await expect(savePersonalSubject(new Blob(["glb"]), null)).rejects.toThrow(
    /navigation privée|espace/i,
  );
});

test("l'identifiant du sujet personnel est stable", () => {
  // Il sert de clé d'URL (`?s=`) : le changer périmerait tous les liens.
  expect(PERSONAL_SUBJECT_ID).toBe("personnel");
});
