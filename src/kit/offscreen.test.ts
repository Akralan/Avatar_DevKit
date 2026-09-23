import * as THREE from "three";
import { vi } from "vitest";
import { createOffscreenPass } from "./offscreen";

function fakeRenderer() {
  return {
    setRenderTarget: vi.fn(),
    render: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
}

test("redimensionner réutilise la cible au lieu d'en allouer une nouvelle", () => {
  const pass = createOffscreenPass(fakeRenderer(), { width: 100, height: 100 });
  const premiere = pass.target;

  pass.setSize(200, 160);

  expect(pass.target).toBe(premiere);
  expect(pass.target.width).toBe(200);
  expect(pass.target.height).toBe(160);
});

test("la profondeur suit la cible quand elle change de taille", () => {
  const pass = createOffscreenPass(fakeRenderer(), { width: 100, height: 100 });

  pass.setSize(200, 160);

  expect(pass.depthTexture.image.width).toBe(200);
  expect(pass.depthTexture.image.height).toBe(160);
});

test("la passe échantillonne au plus proche, jamais en interpolant", () => {
  // Le shader lit le centre exact de chaque cellule : une interpolation
  // linéaire mélangerait corps et fond sur les contours, et le masque
  // cesserait d'être déterministe.
  const pass = createOffscreenPass(fakeRenderer(), { width: 64, height: 64 });

  expect(pass.target.texture.minFilter).toBe(THREE.NearestFilter);
  expect(pass.target.texture.magFilter).toBe(THREE.NearestFilter);
});

test("rendre la passe écrit dans la cible puis rend la main à l'écran", () => {
  const renderer = fakeRenderer();
  const pass = createOffscreenPass(renderer, { width: 64, height: 64 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();

  pass.render(renderer, scene, camera);

  const cibles = vi.mocked(renderer.setRenderTarget).mock.calls.map(([cible]) => cible);
  expect(cibles).toEqual([pass.target, null]);
});

test("dispose libère la cible et la texture de profondeur", () => {
  const pass = createOffscreenPass(fakeRenderer(), { width: 64, height: 64 });
  const cible = vi.spyOn(pass.target, "dispose");
  const profondeur = vi.spyOn(pass.depthTexture, "dispose");

  pass.dispose();

  expect(cible).toHaveBeenCalled();
  expect(profondeur).toHaveBeenCalled();
});
