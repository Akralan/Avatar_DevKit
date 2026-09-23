import { DEFAULT_SUBJECT_ID, listSubjects } from "./subjects";

test("le corps de référence livré est présent et verrouillé", async () => {
  const subjects = await listSubjects();

  expect(subjects).toHaveLength(1);
  expect(subjects.map((subject) => subject.id)).toEqual(["male_body"]);
  expect(subjects.every((subject) => subject.locked)).toBe(true);
});

test("le sujet par défaut est le modèle neutre", async () => {
  const subjects = await listSubjects();
  const found = subjects.find((subject) => subject.id === DEFAULT_SUBJECT_ID);

  expect(found?.url).toBe("/models/male_body.glb");
});

test("aucun sujet livré ne pointe vers un corps réel identifiable", async () => {
  // Le dépôt est public : un scan de corps nommé n'y a pas sa place.
  const subjects = await listSubjects();

  expect(subjects.every((subject) => subject.url.includes("male_body"))).toBe(true);
});
