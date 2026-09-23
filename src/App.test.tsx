import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";

test("la navigation expose les deux galeries", () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("link", { name: "Rendus" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Sujets" })).toHaveAttribute("href", "/sujets");
});
