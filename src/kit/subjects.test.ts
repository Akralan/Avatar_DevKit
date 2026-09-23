import { DEFAULT_SUBJECT_ID, listSubjects } from "./subjects";

test("les deux sujets livrés sont présents et verrouillés", async () => {
  const subjects = await listSubjects();

  expect(subjects).toHaveLength(2);
  expect(subjects.every((subject) => subject.locked)).toBe(true);
  expect(subjects.map((subject) => subject.id)).toEqual(["male_body", "rubens"]);
});

test("le sujet par défaut est le modèle neutre", async () => {
  const subjects = await listSubjects();
  const found = subjects.find((subject) => subject.id === DEFAULT_SUBJECT_ID);

  expect(found?.url).toBe("/models/male_body.glb");
});

test("les deux sujets livrés se déclarent comme tels", async () => {
  const subjects = await listSubjects();

  expect(subjects.every((subject) => subject.origin === "livré")).toBe(true);
});
