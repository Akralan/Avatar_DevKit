import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

vi.mock("../kit/thumbnail-warmup", () => ({ scheduleWarmup: () => () => {} }));

const { GalleryPage } = await import("./gallery-page");

function renderGallery() {
  render(
    <MemoryRouter>
      <GalleryPage />
    </MemoryRouter>,
  );
}

test("chaque rendu découvert a sa tuile, qui mène à son atelier", () => {
  renderGallery();

  expect(screen.getByRole("link", { name: /Fil de fer/ })).toHaveAttribute(
    "href",
    "/render/wireframe",
  );
  expect(screen.getByRole("link", { name: /Matrice de points/ })).toHaveAttribute(
    "href",
    "/render/dot-matrix",
  );
  expect(screen.getByRole("link", { name: /Révélation/ })).toHaveAttribute(
    "href",
    "/render/reveal",
  );
});

test("la commande de création est visible sans avoir lu le README", () => {
  renderGallery();

  expect(screen.getByText("npm run new:render")).toBeInTheDocument();
});

test("les créations et les références partagent la même grille", () => {
  // Le travail d'un contributeur a le même statut que le code livré : pas de
  // section « vos rendus » reléguée en bas de page.
  renderGallery();

  const grilles = screen.getAllByRole("list");

  expect(grilles).toHaveLength(1);
  expect(within(grilles[0]).getAllByRole("listitem").length).toBeGreaterThanOrEqual(4);
});

test("une pastille distingue ce qui est livré de ce qui est ajouté", () => {
  renderGallery();

  expect(screen.getAllByText("référence").length).toBeGreaterThanOrEqual(4);
});
