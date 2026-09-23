import "@testing-library/jest-dom/vitest";

// jsdom ne fournit ni ResizeObserver ni IntersectionObserver. Stubs inertes par
// défaut : un test qui a besoin de les piloter les remplace localement.
class InertObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
}

globalThis.ResizeObserver ??= InertObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= InertObserver as unknown as typeof IntersectionObserver;

// IndexedDB n'existe pas en jsdom : les vignettes et le sujet personnel du
// contributeur s'y rangent, donc les tests en ont besoin pour de vrai.
import "fake-indexeddb/auto";
