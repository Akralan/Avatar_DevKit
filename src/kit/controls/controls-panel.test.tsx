import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ControlsPanel } from "./controls-panel";
import type { Control } from "../types";

interface Config {
  densite: number;
  tramage: boolean;
  primitive: string;
  couleur: string;
}

const CONFIG: Config = {
  densite: 260,
  tramage: false,
  primitive: "dots",
  couleur: "#79f0d1",
};

const CONTROLS: Control<Config>[] = [
  { kind: "slider", key: "densite", label: "Densité", min: 40, max: 400, step: 2 },
  { kind: "toggle", key: "tramage", label: "Tramage" },
  { kind: "select", key: "primitive", label: "Primitive", options: ["dots", "bars", "ascii"] },
  { kind: "color", key: "couleur", label: "Couleur" },
];

test("chaque contrôle du schéma produit un champ", () => {
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={vi.fn()} />);

  expect(screen.getByLabelText("Densité")).toBeInTheDocument();
  expect(screen.getByLabelText("Tramage")).toBeInTheDocument();
  expect(screen.getByLabelText("Primitive")).toBeInTheDocument();
  expect(screen.getByLabelText("Couleur")).toBeInTheDocument();
});

test("la valeur courante d'un curseur est affichée à côté de son libellé", () => {
  // Sans elle on règle à l'aveugle, et on ne peut pas reporter le chiffre
  // validé dans defaultConfig.
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={vi.fn()} />);

  expect(screen.getByText("260")).toBeInTheDocument();
});

test("déplacer un curseur remonte la config entière, pas le seul champ touché", () => {
  const onChange = vi.fn();
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Densité"), { target: { value: "300" } });

  expect(onChange).toHaveBeenCalledWith({
    densite: 300,
    tramage: false,
    primitive: "dots",
    couleur: "#79f0d1",
  });
});

test("un interrupteur remonte un booléen, pas une chaîne", async () => {
  const onChange = vi.fn();
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={onChange} />);

  await userEvent.click(screen.getByLabelText("Tramage"));

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tramage: true }));
});

test("une liste déroulante propose toutes les options du schéma", () => {
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={vi.fn()} />);

  const options = screen.getAllByRole("option").map((option) => option.textContent);

  expect(options).toEqual(["dots", "bars", "ascii"]);
});

test("un groupe rend ses enfants sous son libellé", () => {
  const groupes: Control<Config>[] = [
    { kind: "group", label: "Couleurs", children: [CONTROLS[3]] },
  ];
  render(<ControlsPanel controls={groupes} config={CONFIG} onChange={vi.fn()} />);

  expect(screen.getByRole("group", { name: "Couleurs" })).toBeInTheDocument();
  expect(screen.getByLabelText("Couleur")).toBeInTheDocument();
});

test("deux modules aux clés identiques ne se disputent pas les identifiants", () => {
  // Les id des champs dérivent de la clé : deux panneaux montés en même temps
  // (atelier + préchauffage d'une vignette) casseraient l'association
  // label/champ si l'id n'était pas préfixé par le panneau.
  const { container } = render(
    <>
      <ControlsPanel controls={CONTROLS} config={CONFIG} onChange={vi.fn()} />
      <ControlsPanel controls={CONTROLS} config={CONFIG} onChange={vi.fn()} />
    </>,
  );

  const ids = [...container.querySelectorAll("input, select")].map((field) => field.id);

  expect(new Set(ids).size).toBe(ids.length);
});
