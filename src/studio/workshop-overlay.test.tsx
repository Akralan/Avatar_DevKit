import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { WorkshopOverlay } from "./workshop-overlay";
import type { RenderModule } from "../kit/types";
import type { SubjectDescriptor } from "../kit/subjects";

interface Config {
  opacite: number;
}

const MODULE: RenderModule<Config> = {
  id: "wireframe",
  title: "Fil de fer",
  author: "MyTwin",
  description: "…",
  defaultConfig: { opacite: 0.35 },
  controls: [{ kind: "slider", key: "opacite", label: "Opacité", min: 0, max: 1, step: 0.01 }],
  create: () => ({
    frame: () => {},
    setConfig: () => {},
    resize: () => {},
    dispose: () => {},
  }),
};

const SUBJECTS: SubjectDescriptor[] = [
  { id: "male_body", label: "male_body", url: "", origin: "livré", locked: true },
  { id: "rubens", label: "Corps réel", url: "", origin: "livré", locked: true },
];

function renderOverlay(props: Partial<Parameters<typeof WorkshopOverlay<Config>>[0]> = {}) {
  const defaults = {
    module: MODULE,
    subjects: SUBJECTS,
    subjectId: "male_body",
    config: { opacite: 0.35 },
    onChange: vi.fn(),
    onReset: vi.fn(),
    onSubjectChange: vi.fn(),
    onAction: vi.fn(),
  };
  const merged = { ...defaults, ...props };

  render(
    <MemoryRouter>
      <WorkshopOverlay {...merged} />
    </MemoryRouter>,
  );

  return merged;
}

test("le nom de l'effet et le sujet actif sont visibles sans ouvrir de menu", () => {
  renderOverlay();

  expect(screen.getByText("Fil de fer")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /sujet/i })).toHaveValue("male_body");
});

test("replier le panneau ne laisse que le canvas", async () => {
  renderOverlay();

  await userEvent.click(screen.getByRole("button", { name: /replier/i }));

  expect(screen.queryByLabelText("Opacité")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /réglages/i })).toBeInTheDocument();
});

test("le retour à la galerie est toujours à portée", () => {
  renderOverlay();

  expect(screen.getByRole("link", { name: /galerie/i })).toHaveAttribute("href", "/");
});

test("« Rejouer » n'apparaît pas pour un module sans chronologie", () => {
  renderOverlay();

  expect(screen.queryByRole("button", { name: "Rejouer" })).not.toBeInTheDocument();
});

test("« Rejouer » apparaît dès qu'un module déclare l'action", async () => {
  const { onAction } = renderOverlay({
    module: {
      ...MODULE,
      actions: [{ id: "replay", label: "Rejouer", run: () => {} }],
    },
  });

  await userEvent.click(screen.getByRole("button", { name: "Rejouer" }));

  expect(onAction).toHaveBeenCalledWith("replay");
});

test("« Défauts » remonte une demande de réinitialisation", async () => {
  const { onReset } = renderOverlay();

  await userEvent.click(screen.getByRole("button", { name: "Défauts" }));

  expect(onReset).toHaveBeenCalledOnce();
});

test("changer de sujet remonte son identifiant", async () => {
  const { onSubjectChange } = renderOverlay();

  await userEvent.selectOptions(screen.getByRole("combobox", { name: /sujet/i }), "rubens");

  expect(onSubjectChange).toHaveBeenCalledWith("rubens");
});

test("copier la config met un JSON collable dans le presse-papier", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  renderOverlay({ config: { opacite: 0.42 } });

  await userEvent.click(screen.getByRole("button", { name: /copier la config/i }));

  expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({ opacite: 0.42 });
  vi.unstubAllGlobals();
});
