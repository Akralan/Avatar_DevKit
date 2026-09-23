import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

// Les aperçus se rendent en WebGL, absent de jsdom : on fournit le résultat.
vi.mock("../kit/subject-thumbnails", () => ({
  getSubjectThumbnail: async () => "data:image/webp;base64,APERCU",
  warmSubjectThumbnails: async () => {},
}));

const { SubjectsPage } = await import("./subjects-page");

function renderPage() {
  render(
    <MemoryRouter>
      <SubjectsPage />
    </MemoryRouter>,
  );
}

test("le sujet livré avec le repo est présenté", async () => {
  renderPage();

  expect(await screen.findByText("male_body")).toBeInTheDocument();

});

test("un sujet livré n'offre ni suppression ni refonte", async () => {
  renderPage();
  await screen.findByText("male_body");

  expect(screen.queryByRole("button", { name: /supprimer/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /refaire/i })).not.toBeInTheDocument();
});

test("choisir un sujet ouvre un atelier sur ce sujet", async () => {
  renderPage();

  const liens = await screen.findAllByRole("link", { name: /ouvrir un atelier/i });

  expect(liens[0]).toHaveAttribute("href", "/render/wireframe?s=male_body");
});

test("un aperçu du corps est affiché, pas un cadre vide", async () => {
  // Sans image, on ne voit littéralement pas les sujets : deux rectangles gris.
  renderPage();

  const apercus = await screen.findAllByRole("img");

  expect(apercus.length).toBeGreaterThanOrEqual(1);
});

test("le troisième emplacement est annoncé, même avant que la génération existe", async () => {
  // Le laisser absent fait croire à une panne ; un bouton mort fait pire.
  renderPage();

  expect(await screen.findByText("Le vôtre")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /générer/i })).not.toBeInTheDocument();
});
