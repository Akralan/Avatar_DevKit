import type * as THREE from "three";

// Ordonnanceur des décharges d'énergie qui parcourent le sujet. Il ne sait rien
// du rendu : il tient une poignée de zones vivantes et les publie dans un
// tableau d'uniforms. Leur traduction visuelle — le glitch dot par dot — est
// entièrement dans le fragment shader.
//
// Une décharge est une **zone compacte qui se déplace**, jamais une bande qui
// traverse le cadre : à l'échelle d'une bande, l'effet se lit comme un
// changement d'éclairage de la région, et c'est précisément ce qu'on ne veut
// pas. Ce qui doit se voir, c'est la peau qui grésille là où l'énergie passe.

/** Décharges simultanées. Câblé en `#define` : borne de boucle constante en GLSL. */
export const MAX_DISCHARGES = 4;

// Rythme d'apparition. Court et irrégulier : ce sont des étincelles, pas des
// vagues, et à cadence régulière l'œil anticipe la suivante dès la deuxième.
const SPAWN_DELAY_MS = { min: 240, max: 900 };
const LIFETIME_MS = { min: 420, max: 1100 };

/** Rayon de la zone, en hauteurs de sujet. Une paume, pas un membre. */
const RADIUS = { min: 0.045, max: 0.11 };

const STRENGTH = { min: 0.55, max: 1 };

/** Distance parcourue sur la vie de la décharge, en hauteurs de sujet. */
const TRAVEL = { min: 0.06, max: 0.28 };

// Naissance : proche de l'axe médian, où il y a du corps quelle que soit la
// hauteur. Une décharge née dans le vide à côté d'une hanche ne s'affiche pas —
// le masque de silhouette l'éteint — et le rythme paraît sauter une mesure. Son
// rayon, lui, la fait déborder sur les bras et les jambes.
const SPAWN_HALF_WIDTH = 0.085;
const SPAWN_AXIS = { min: 0.05, max: 0.95 };

/** Part de la vie consacrée à l'allumage et à l'extinction. */
const FADE_IN = 0.25;
const FADE_OUT = 0.4;

/** Extinction à la coupure des effets. */
const KILL_MS = 200;

interface Discharge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  radius: number;
  strength: number;
  durationMs: number;
  elapsedMs: number;
}

const randomBetween = (min: number, max: number): number =>
  min + Math.random() * (max - min);

const randomIn = (range: { min: number; max: number }): number =>
  randomBetween(range.min, range.max);

const smoothstep = (edge: number): number => edge * edge * (3 - 2 * edge);

function createDischarge(): Discharge {
  const fromX = randomBetween(-SPAWN_HALF_WIDTH, SPAWN_HALF_WIDTH);
  const fromY = randomIn(SPAWN_AXIS);

  // Course orientée le long du corps, avec juste assez de dérive latérale pour
  // qu'aucune décharge ne suive exactement la même ligne qu'une autre.
  const travel = randomIn(TRAVEL);
  const drift = randomBetween(-0.4, 0.4);
  const direction = Math.random() < 0.5 ? 1 : -1;

  return {
    fromX,
    fromY,
    toX: fromX + travel * drift,
    toY: fromY + travel * direction,
    radius: randomIn(RADIUS),
    strength: randomIn(STRENGTH),
    durationMs: randomIn(LIFETIME_MS),
    elapsedMs: 0,
  };
}

export class DischargeField {
  private readonly discharges: Discharge[] = [];
  private msUntilSpawn = randomIn(SPAWN_DELAY_MS);
  private isEnabled = false;
  /** Gain global, sert uniquement à l'extinction. */
  private gain = 1;

  /** Une décharge est vivante : le rendu ne peut pas se figer. */
  public get isActive(): boolean {
    return this.discharges.length > 0;
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.isEnabled) return;

    this.isEnabled = enabled;
    if (enabled) {
      this.gain = 1;
      this.msUntilSpawn = randomIn(SPAWN_DELAY_MS);
    }
  }

  public update(deltaMs: number): void {
    if (!this.isEnabled) {
      this.gain = Math.max(0, this.gain - deltaMs / KILL_MS);
      if (this.gain === 0) this.discharges.length = 0;
    }

    for (let index = this.discharges.length - 1; index >= 0; index -= 1) {
      const discharge = this.discharges[index];
      discharge.elapsedMs += deltaMs;
      if (discharge.elapsedMs >= discharge.durationMs) {
        this.discharges.splice(index, 1);
      }
    }

    if (!this.isEnabled) return;

    this.msUntilSpawn -= deltaMs;
    if (this.msUntilSpawn > 0 || this.discharges.length >= MAX_DISCHARGES) return;

    this.discharges.push(createDischarge());
    this.msUntilSpawn = randomIn(SPAWN_DELAY_MS);
  }

  /**
   * Publie l'état courant : `(x, y, rayon, amplitude)` par décharge, en
   * hauteurs de sujet — x depuis l'axe médian, y de 0 aux pieds à 1 au crâne.
   * Une amplitude nulle éteint la zone côté shader, qui saute alors tout son
   * calcul.
   */
  public writeTo(target: THREE.Vector4[]): void {
    for (let index = 0; index < target.length; index += 1) {
      const discharge = this.discharges[index];

      if (!discharge) {
        target[index].set(0, 0, 1, 0);
        continue;
      }

      const progress = discharge.elapsedMs / discharge.durationMs;
      // Allumage et extinction adoucis : une décharge naît **sur** le corps,
      // elle ne peut pas entrer par un bord comme le ferait une vague.
      const envelope =
        smoothstep(Math.min(progress / FADE_IN, 1)) *
        smoothstep(Math.min((1 - progress) / FADE_OUT, 1));

      target[index].set(
        discharge.fromX + (discharge.toX - discharge.fromX) * progress,
        discharge.fromY + (discharge.toY - discharge.fromY) * progress,
        discharge.radius,
        discharge.strength * envelope * this.gain,
      );
    }
  }
}
