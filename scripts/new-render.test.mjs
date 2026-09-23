import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createRender } from "./new-render.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = "src/renders/_template";

let racine;

/** Chaque test part d'une copie du vrai template : si celui du dépôt casse,
 *  ces tests le disent. */
beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "devkit-"));
  mkdirSync(join(racine, "src/renders"), { recursive: true });
  cpSync(join(REPO, TEMPLATE), join(racine, TEMPLATE), { recursive: true });
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

const creer = (slug) => createRender(slug, { root: racine });

test("le slug devient l'id du module, sinon le registre refusera le dossier", async () => {
  await creer("mon-effet");

  const ecrit = readFileSync(join(racine, "src/renders/mon-effet/module.ts"), "utf8");

  expect(ecrit).toContain('id: "mon-effet"');
  expect(ecrit).not.toContain('id: "_template"');
});

test("le titre par défaut reprend le slug, pour que la galerie reste lisible", async () => {
  await creer("glitch-scan");

  const ecrit = readFileSync(join(racine, "src/renders/glitch-scan/module.ts"), "utf8");

  expect(ecrit).toContain('title: "glitch-scan"');
});

test("un slug invalide est refusé avant toute écriture", async () => {
  await expect(creer("Mon Effet !")).rejects.toThrow(/minuscules/);
  expect(() => readFileSync(join(racine, "src/renders/Mon Effet !/module.ts"))).toThrow();
});

test("un dossier existant n'est jamais écrasé", async () => {
  await creer("mon-effet");

  await expect(creer("mon-effet")).rejects.toThrow(/existe déjà/);
});

test("les shaders du template suivent la copie", async () => {
  await creer("mon-effet");

  const shader = readFileSync(
    join(racine, "src/renders/mon-effet/shaders/effect.frag.glsl"),
    "utf8",
  );

  expect(shader).toContain("uNormalTexture");
});

test("le nouveau dossier ne garde aucune trace du template", async () => {
  await creer("mon-effet");

  const renderer = readFileSync(join(racine, "src/renders/mon-effet/renderer.ts"), "utf8");

  expect(renderer).not.toContain("_template");
});
