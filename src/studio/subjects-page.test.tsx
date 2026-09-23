import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SubjectsPage } from "./subjects-page";

function renderPage() {
  render(
    <MemoryRouter>
      <SubjectsPage />
    </MemoryRouter>,
  );
}

test("les deux sujets livrés avec le repo sont présentés", async () => {
  renderPage();

  expect(await screen.findByText("male_body")).toBeInTheDocument();
  expect(await screen.findByText("Corps réel")).toBeInTheDocument();
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
