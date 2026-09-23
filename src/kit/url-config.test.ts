import { decodeConfig, encodeConfig } from "./url-config";
import type { Control } from "./types";

interface Config {
  densite: number;
  couleur: string;
  tramage: boolean;
  primitive: string;
}

const DEFAUTS: Config = {
  densite: 260,
  couleur: "#79f0d1",
  tramage: false,
  primitive: "dots",
};

const CONTROLS: Control<Config>[] = [
  { kind: "slider", key: "densite", label: "Densité", min: 40, max: 400, step: 2 },
  { kind: "color", key: "couleur", label: "Couleur" },
  {
    kind: "group",
    label: "Avancé",
    children: [
      { kind: "toggle", key: "tramage", label: "Tramage" },
      { kind: "select", key: "primitive", label: "Primitive", options: ["dots", "bars"] },
    ],
  },
];

test("une config encodée puis décodée revient identique", () => {
  const reglee: Config = {
    densite: 120,
    couleur: "#ff0000",
    tramage: true,
    primitive: "bars",
  };

  expect(decodeConfig(encodeConfig(reglee), DEFAUTS, CONTROLS)).toEqual(reglee);
});

test("l'encodage n'utilise que des caractères sûrs dans une URL", () => {
  // Le base64 standard contient « + », que URLSearchParams relit comme une
  // espace : un lien partagé rendrait alors une config corrompue.
  const encode = encodeConfig({ densite: 255, couleur: "#ffffff", tramage: true });

  expect(encode).toMatch(/^[A-Za-z0-9_-]*$/);
});

test("un paramètre absent retombe sur les défauts", () => {
  expect(decodeConfig(null, DEFAUTS, CONTROLS)).toEqual(DEFAUTS);
});

test("du base64 invalide ne fait pas planter l'atelier", () => {
  expect(decodeConfig("ceci n'est pas du base64 !!", DEFAUTS, CONTROLS)).toEqual(DEFAUTS);
});

test("du JSON valide mais qui n'est pas un objet retombe sur les défauts", () => {
  expect(decodeConfig(encodeConfig([1, 2, 3] as unknown as object), DEFAUTS, CONTROLS)).toEqual(
    DEFAUTS,
  );
});

test("une clé inconnue est ignorée, pas propagée dans la config", () => {
  const encode = encodeConfig({ densite: 100, obsolete: 42 });

  expect(decodeConfig(encode, DEFAUTS, CONTROLS)).toEqual({ ...DEFAUTS, densite: 100 });
});

test("une valeur hors bornes est ramenée dans l'intervalle du contrôle", () => {
  expect(decodeConfig(encodeConfig({ densite: 99999 }), DEFAUTS, CONTROLS).densite).toBe(400);
  expect(decodeConfig(encodeConfig({ densite: -5 }), DEFAUTS, CONTROLS).densite).toBe(40);
});

test("une valeur du mauvais type retombe sur le défaut", () => {
  expect(decodeConfig(encodeConfig({ densite: "beaucoup" }), DEFAUTS, CONTROLS).densite).toBe(260);
  expect(decodeConfig(encodeConfig({ tramage: "oui" }), DEFAUTS, CONTROLS).tramage).toBe(false);
});

test("une option de select hors liste est refusée", () => {
  expect(decodeConfig(encodeConfig({ primitive: "ascii" }), DEFAUTS, CONTROLS).primitive).toBe(
    "dots",
  );
});

test("une couleur mal formée est refusée", () => {
  expect(decodeConfig(encodeConfig({ couleur: "rouge" }), DEFAUTS, CONTROLS).couleur).toBe(
    "#79f0d1",
  );
});

test("les contrôles imbriqués dans un groupe sont validés comme les autres", () => {
  expect(decodeConfig(encodeConfig({ tramage: true }), DEFAUTS, CONTROLS).tramage).toBe(true);
});
