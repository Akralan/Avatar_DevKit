/** Radians par pixel glissé. Réglé à l'œil : un balayage d'écran fait environ
 *  un demi-tour. */
const DRAG_SENSITIVITY = 0.005;

/** Fraction de vitesse conservée au bout d'une seconde. Plus c'est bas, plus
 *  l'inertie s'éteint vite. */
const DAMPING = 0.04;

/** En dessous, la rotation résiduelle est invisible : on coupe net plutôt que
 *  de laisser une asymptote tourner indéfiniment dans la boucle rAF. */
const VELOCITY_FLOOR = 1e-4;

/**
 * Rotation du sujet au doigt, avec inertie amortie.
 *
 * `pointerdown` est écouté sur le conteneur et non sur `window` : sur la
 * landing, l'écouter globalement faisait capter le scroll de la page par le
 * drag. `pointermove` et `pointerup`, eux, doivent être sur `window`, sinon
 * relâcher hors du canvas laisse le geste collé.
 */
export class PointerOrbit {
  public rotation = 0;

  private velocity = 0;
  private dragging = false;
  private lastX = 0;

  public constructor(private readonly element: HTMLElement) {
    element.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
  }

  public update(delta: number): void {
    if (this.dragging) return;

    this.rotation += this.velocity * delta;
    this.velocity *= DAMPING ** delta;
    if (Math.abs(this.velocity) < VELOCITY_FLOOR) this.velocity = 0;
  }

  public dispose(): void {
    this.element.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
  }

  private readonly onDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.lastX = event.clientX;
    this.velocity = 0;
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.dragging) return;

    const deltaX = event.clientX - this.lastX;
    this.lastX = event.clientX;
    this.rotation += deltaX * DRAG_SENSITIVITY;
    // Vitesse exprimée par seconde, en supposant une frame à 60 Hz : c'est
    // l'échelle qu'attend `update(delta)`.
    this.velocity = deltaX * DRAG_SENSITIVITY * 60;
  };

  private readonly onUp = (): void => {
    this.dragging = false;
  };
}
