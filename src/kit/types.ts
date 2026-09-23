import type * as THREE from "three";

/**
 * Un sujet : un corps entier avec son visage, déjà centré sur l'origine par le
 * kit. Jamais des pièces détachées.
 */
export interface Subject {
  id: string;
  label: string;
  group: THREE.Group;
  /** Dimensions de la boîte englobante, mesurées avant recentrage. */
  size: THREE.Vector3;
  /** Présent seulement si le GLB embarque des animations. */
  mixer?: THREE.AnimationMixer;
}

/** Ce que le kit remet à un module au moment de sa création. */
export interface RenderContext {
  canvas: HTMLCanvasElement;
  /** Créé et libéré par le kit. C'est au module de s'en servir pour rendre. */
  renderer: THREE.WebGLRenderer;
  /** Déjà cadrée sur le sujet. Un module peut l'ignorer et utiliser la sienne. */
  camera: THREE.PerspectiveCamera;
  subject: Subject;
}

export interface FrameInfo {
  /** Secondes écoulées depuis la frame précédente. */
  delta: number;
  /** Secondes écoulées depuis le montage. */
  elapsed: number;
  /** Rotation Y courante, pilotée par l'orbit du kit. */
  rotation: number;
  /** Vrai si l'utilisateur a demandé un mouvement réduit. */
  reduceMotion: boolean;
}

export interface RenderInstance<C> {
  /**
   * Produit l'image. Le kit n'appelle jamais `renderer.render()` lui-même :
   * c'est ce qui permet à un module d'avoir ses propres passes et son propre
   * post-traitement, sans plafond de verre.
   */
  frame(info: FrameInfo): void;
  setConfig(config: C): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
  /** Appelé quand on change de sujet sans quitter l'atelier. */
  onSubjectChange?(subject: Subject): void;
}

/**
 * Action propre à un module, affichée dans le panneau à côté de « Défauts ».
 * `reveal` en déclare une (« Rejouer ») ; `dot-matrix`, qui n'a pas de
 * chronologie, n'en déclare aucune.
 *
 * `RenderInstance<unknown>` et non `<never>` : avec `never`, `setConfig`
 * deviendrait inappelable et aucune instance concrète ne satisferait le type.
 * Les membres étant déclarés en syntaxe de méthode, TypeScript les traite de
 * façon bivariante — une `RenderInstance<WireframeConfig>` s'y assigne.
 */
export interface RenderAction {
  id: string;
  label: string;
  run(instance: RenderInstance<unknown>): void;
}

export type Control<C> =
  | {
      kind: "slider";
      key: keyof C;
      label: string;
      min: number;
      max: number;
      step: number;
    }
  | { kind: "color"; key: keyof C; label: string }
  | { kind: "toggle"; key: keyof C; label: string }
  | { kind: "select"; key: keyof C; label: string; options: readonly string[] }
  | { kind: "group"; label: string; children: Control<C>[] };

export interface RenderModule<C = Record<string, unknown>> {
  /** Doit être égal au nom du dossier. Le registre le vérifie. */
  id: string;
  title: string;
  author: string;
  description: string;
  /** Fond derrière le canvas. Certains rendus sont pensés sur fond clair
   *  (dot-matrix), d'autres sur fond sombre. Omis = le fond de l'application. */
  background?: string;
  defaultConfig: C;
  controls: Control<C>[];
  actions?: RenderAction[];
  create(ctx: RenderContext): RenderInstance<C>;
}
