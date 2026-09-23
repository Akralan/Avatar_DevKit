import * as THREE from "three";
import { resetRendererState } from "./thumbnail-warmup";

test("l'état du renderer est remis à neuf entre deux rendus", () => {
  // Le préchauffage réutilise un seul contexte WebGL pour tous les modules.
  // `hologram` y pose un tone mapping AgX et une exposition basse ; sans remise
  // à zéro, les vignettes des modules suivants sortent sombres et délavées.
  const renderer = {
    toneMapping: THREE.AgXToneMapping,
    toneMappingExposure: 0.28,
    setClearColor: () => {},
    setRenderTarget: () => {},
  } as unknown as THREE.WebGLRenderer;

  resetRendererState(renderer);

  expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
  expect(renderer.toneMappingExposure).toBe(1);
});

test("la cible de rendu revient à l'écran", () => {
  // Un module qui plante en pleine passe hors écran laisserait la cible active,
  // et le module suivant dessinerait dans une texture que personne ne regarde.
  const cibles: unknown[] = [];
  const renderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    setClearColor: () => {},
    setRenderTarget: (cible: unknown) => cibles.push(cible),
  } as unknown as THREE.WebGLRenderer;

  resetRendererState(renderer);

  expect(cibles).toEqual([null]);
});
