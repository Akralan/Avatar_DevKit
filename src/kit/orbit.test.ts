import { vi } from "vitest";
import { PointerOrbit } from "./orbit";

function drag(element: HTMLElement, from: number, to: number) {
  element.dispatchEvent(new PointerEvent("pointerdown", { clientX: from, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: to, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

test("glisser vers la droite fait tourner le sujet", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);

  drag(element, 0, 100);

  expect(orbit.rotation).toBeGreaterThan(0);
  orbit.dispose();
});

test("l'inertie prolonge le geste après le relâchement", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);
  drag(element, 0, 100);
  const auRelachement = orbit.rotation;

  orbit.update(0.016);

  expect(orbit.rotation).toBeGreaterThan(auRelachement);
  orbit.dispose();
});

test("l'inertie finit par s'éteindre exactement, pas asymptotiquement", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);
  drag(element, 0, 100);
  for (let i = 0; i < 600; i += 1) orbit.update(0.016);
  const stabilisee = orbit.rotation;

  orbit.update(0.016);

  expect(orbit.rotation).toBe(stabilisee);
  orbit.dispose();
});

test("pendant le glissement, l'inertie ne s'ajoute pas au geste", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);
  element.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, bubbles: true }));
  const pendantLeGeste = orbit.rotation;

  orbit.update(0.016);

  expect(orbit.rotation).toBe(pendantLeGeste);
  orbit.dispose();
});

test("un pointerdown hors du conteneur n'attrape pas le geste", () => {
  // Écouter pointerdown sur window ferait capter le scroll de la page.
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);

  window.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, bubbles: true }));

  expect(orbit.rotation).toBe(0);
  orbit.dispose();
});

test("dispose retire les écouteurs posés sur window", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);
  const removeSpy = vi.spyOn(window, "removeEventListener");

  orbit.dispose();

  expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
  expect(removeSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
});
