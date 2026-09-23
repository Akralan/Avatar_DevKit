import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

// Les aperçus se rendent en WebGL, absent de jsdom : on fournit le résultat.
vi.mock("../kit/subject-thumbnails", () => ({
  getSubjectThumbnail: async () => "data:image/webp;base64,APERCU",
  warmSubjectThumbnails: async () => {},
}));

const { SubjectsPage } = await import("./subjects-page");
const { deletePersonalSubject, getPersonalSubject, savePersonalSubject } = await import(
  "../kit/avatar/personal-subject"
);

function renderPage() {
  render(
    <MemoryRouter>
      <SubjectsPage />
    </MemoryRouter>,
  );
}

const emplacement = (nom: string | RegExp) =>
  screen.getByRole("listitem", { name: nom as string });

afterEach(async () => {
  await deletePersonalSubject();
});

test("le corps livré avec le dépôt est présenté", async () => {
  renderPage();

  expect(await screen.findByText("male_body")).toBeInTheDocument();
});

test("un aperçu du corps est affiché, pas un cadre vide", async () => {
  renderPage();

  expect((await screen.findAllByRole("img")).length).toBeGreaterThanOrEqual(1);
});

test("l'emplacement vide invite à générer", async () => {
  renderPage();

  expect(await screen.findByRole("link", { name: /générer/i })).toHaveAttribute(
    "href",
    "/sujets/nouveau",
  );
});

test("un corps livré n'offre ni suppression ni refonte", async () => {
  renderPage();
  await screen.findByText("male_body");

  expect(screen.queryByRole("button", { name: /supprimer/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /refaire/i })).not.toBeInTheDocument();
});

test("choisir un sujet ouvre un atelier sur ce sujet", async () => {
  renderPage();

  const liens = await screen.findAllByRole("link", { name: /ouvrir un atelier/i });

  expect(liens[0]).toHaveAttribute("href", "/render/wireframe?s=male_body");
});

test("une fois généré, le sujet personnel offre de le refaire et de le supprimer", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);
  renderPage();

  expect(await screen.findByRole("link", { name: /refaire/i })).toHaveAttribute(
    "href",
    "/sujets/nouveau",
  );
  expect(screen.getByRole("button", { name: /supprimer/i })).toBeInTheDocument();
});

test("supprimer demande confirmation avant d'effacer", async () => {
  // Refaire coûte une minute de calcul et une nouvelle séance photo.
  await savePersonalSubject(new Blob(["glb"]), null);
  renderPage();

  await userEvent.click(await screen.findByRole("button", { name: /supprimer/i }));

  expect(screen.getByRole("dialog")).toHaveTextContent(/finitif/i);
});

test("annuler la confirmation laisse l'avatar en place", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /supprimer/i }));

  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /annuler/i }));

  expect(await getPersonalSubject()).not.toBeNull();
});

test("confirmer la suppression efface bien l'avatar", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /supprimer/i }));

  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: /supprimer/i }),
  );

  await waitFor(async () => expect(await getPersonalSubject()).toBeNull());
});

void emplacement;
