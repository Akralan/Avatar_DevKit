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
