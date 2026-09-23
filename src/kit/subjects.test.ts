import { vi } from "vitest";
import { DEFAULT_SUBJECT_ID, listSubjects } from "./subjects";

/** Vite sert `index.html` en repli pour tout chemin inconnu : un fichier absent
 *  répond donc 200, mais en `text/html`. C'est le type qui tranche, pas le code. */
function repondAvec(type: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === "content-type" ? type : null) },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

test("le corps de référence est toujours livré et verrouillé", async () => {
  repondAvec("text/html");
  const subjects = await listSubjects();

  expect(subjects.map((subject) => subject.id)).toContain("male_body");
  expect(subjects.every((subject) => subject.locked)).toBe(true);
});

test("le sujet par défaut est le modèle neutre", async () => {
  repondAvec("text/html");
  const subjects = await listSubjects();

  expect(subjects.find((subject) => subject.id === DEFAULT_SUBJECT_ID)?.url).toBe(
    "/models/male_body.glb",
  );
});

test("un corps optionnel présent sur le disque rejoint la liste", async () => {
  repondAvec("model/gltf-binary");

  expect((await listSubjects()).map((subject) => subject.id)).toContain("rubens");
});

test("un corps optionnel absent du clone ne rejoint pas la liste", async () => {
  // Il n'est pas versionné : un étudiant qui clone ne l'a pas. Le lister
  // quand même lui donnerait un sujet qui échoue au chargement.
  repondAvec("text/html");

  expect((await listSubjects()).map((subject) => subject.id)).not.toContain("rubens");
});

test("un réseau muet ne fait pas disparaître le corps de référence", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("hors ligne")));

  expect((await listSubjects()).map((subject) => subject.id)).toEqual(["male_body"]);
});

// ── Le sujet personnel, généré depuis une photo ──────────────────────────────

const { deletePersonalSubject, savePersonalSubject } = await import(
  "./avatar/personal-subject"
);

afterEach(async () => {
  await deletePersonalSubject();
});

test("le sujet personnel rejoint la liste une fois généré, et lui seul est déverrouillé", async () => {
  repondAvec("text/html");
  await savePersonalSubject(new Blob(["glb"]), null);

  const subjects = await listSubjects();
  const personnel = subjects.find((subject) => subject.origin === "personnel");

  expect(personnel?.id).toBe("personnel");
  expect(personnel?.locked).toBe(false);
  expect(subjects.filter((subject) => subject.locked)).toHaveLength(subjects.length - 1);
});

test("le sujet personnel vient en dernier, après les corps de référence", async () => {
  repondAvec("text/html");
  await savePersonalSubject(new Blob(["glb"]), null);

  expect((await listSubjects()).at(-1)?.origin).toBe("personnel");
});

test("un corps non versionné présent cohabite avec le sujet personnel", async () => {
  // Les trois sources doivent se composer : livré, optionnel présent, personnel.
  repondAvec("model/gltf-binary");
  await savePersonalSubject(new Blob(["glb"]), null);

  expect((await listSubjects()).map((subject) => subject.id)).toEqual([
    "male_body",
    "rubens",
    "personnel",
  ]);
});

test("deux appels sur le même avatar réutilisent la même URL d'objet", async () => {
  // Sans mémoïsation, chaque montage d'écran épinglerait à nouveau les ~60 Mo
  // de l'avatar en mémoire, sans jamais les relâcher.
  repondAvec("text/html");
  await savePersonalSubject(new Blob(["glb"]), null);

  const premier = (await listSubjects()).at(-1)!.url;
  const second = (await listSubjects()).at(-1)!.url;

  expect(second).toBe(premier);
});
