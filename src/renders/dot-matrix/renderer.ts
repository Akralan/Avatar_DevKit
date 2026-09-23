import * as THREE from "three";
import { createOffscreenPass, type OffscreenPass } from "../../kit/offscreen";
import { createGlyphAtlas } from "./glyph-atlas";
import {
  applyGridConfig,
  createGridPass,
  disposeGridPass,
  type GridPass,
} from "./grid-pass";
import { DEFAULT_TWIN_2D_CONFIG, type Twin2DConfig } from "./config";
import type { Subject } from "../../kit/types";

// Focale longue : peu de distorsion grand-angle sur la tête et les pieds, le
// rendu reste graphique. Le kit lit cette valeur pour calculer le cadrage.
const CAMERA_FOV = 22;

// Vue trois-quarts au départ : une pose strictement frontale aplatit la
// silhouette, surtout quand la rotation automatique est coupée.
const INITIAL_ROTATION = 0.35;

// Le shader n'échantillonne qu'un texel au centre de chaque cellule : rendre
// l'analyse à la pleine résolution d'un canvas HiDPI serait payé pour rien. Ce
// plafond garde ~2 texels par cellule à la densité maximale.
const MAX_ANALYSIS_SIZE = 1280;

// Réutilisés à chaque frame par le calcul du dégradé : aucune allocation dans
// la boucle de rendu.
const SCRATCH_VECTOR = new THREE.Vector3();
const SCRATCH_CORNER = new THREE.Vector3();

/**
 * Pipeline en deux passes :
 *   1. le sujet est rendu hors écran en normales + profondeur (passe du kit) ;
 *   2. un quad plein écran quantifie ces buffers sur une grille écran fixe.
 *
 * Le canvas reste transparent : la couleur de fond vient du CSS, pas du WebGL.
 */
export class DotMatrixRenderer {
  private readonly sourceScene = new THREE.Scene();
  private readonly modelGroup = new THREE.Group();
  private readonly glyphAtlas = createGlyphAtlas();
  private readonly offscreen: OffscreenPass;
  private readonly grid: GridPass;
  private readonly buffer = new THREE.Vector2(1, 1);

  private config: Twin2DConfig = { ...DEFAULT_TWIN_2D_CONFIG };
  private subject: Subject;
  private autoRotation = 0;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    subject: Subject,
  ) {
    // Le kit cadre d'après la focale de la caméra : la poser ici suffit à
    // obtenir le cadrage d'origine, sans réimplémenter l'auto-fit.
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();

    this.subject = subject;
    this.offscreen = createOffscreenPass(renderer, { width: 1, height: 1 });
    this.grid = createGridPass(this.glyphAtlas);

    this.grid.material.uniforms.uNormalTexture.value = this.offscreen.target.texture;
    this.grid.material.uniforms.uDepthTexture.value = this.offscreen.depthTexture;

    this.sourceScene.add(this.modelGroup);
    this.modelGroup.add(subject.group);
    applyGridConfig(this.grid, this.config);
  }

  public setSubject(subject: Subject): void {
    this.modelGroup.remove(this.subject.group);
    this.subject = subject;
    this.modelGroup.add(subject.group);
  }

  public setConfig(config: Twin2DConfig): void {
    this.config = config;
    applyGridConfig(this.grid, config);
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    this.buffer.set(width * pixelRatio, height * pixelRatio);

    const scale = Math.min(1, MAX_ANALYSIS_SIZE / Math.max(this.buffer.x, this.buffer.y));
    this.offscreen.setSize(
      Math.ceil(this.buffer.x * scale),
      Math.ceil(this.buffer.y * scale),
    );

    this.grid.material.uniforms.uResolution.value.copy(this.buffer);
  }

  public frame(delta: number, rotation: number, reduceMotion: boolean): void {
    if (!reduceMotion) this.autoRotation += this.config.rotationSpeed * delta;

    this.modelGroup.rotation.y = INITIAL_ROTATION + rotation + this.autoRotation;
    this.modelGroup.updateMatrixWorld();
    this.updateGradientRange();

    // Les plans de la caméra sont resserrés par le kit à chaque cadrage : sans
    // les relire ici, la profondeur linéarisée du shader serait fausse.
    this.grid.material.uniforms.uNear.value = this.camera.near;
    this.grid.material.uniforms.uFar.value = this.camera.far;

    // Passe 1 — sujet hors écran : normales (RGB) + profondeur.
    this.sourceScene.overrideMaterial = this.offscreen.normalMaterial;
    this.renderer.setRenderTarget(this.offscreen.target);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.sourceScene, this.camera);
    this.sourceScene.overrideMaterial = null;

    // Passe 2 — grille 2D plein écran, composée sur le fond CSS.
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.grid.scene, this.grid.camera);
  }

  public dispose(): void {
    this.offscreen.dispose();
    disposeGridPass(this.grid);
    this.glyphAtlas.dispose();
  }

  /**
   * Borne la diagonale du dégradé sur l'emprise écran du sujet, en projetant
   * les 8 coins de sa boîte. Sans ça, un corps haut et étroit n'occupe que la
   * portion centrale de la diagonale plein cadre et n'atteint jamais les deux
   * couleurs. Suit la rotation, donc recalculé à chaque frame — 8 projections,
   * c'est gratuit.
   */
  private updateGradientRange(): void {
    const half = SCRATCH_VECTOR.copy(this.subject.size).multiplyScalar(0.5);
    let min = Infinity;
    let max = -Infinity;

    for (let corner = 0; corner < 8; corner += 1) {
      SCRATCH_CORNER.set(
        corner & 1 ? half.x : -half.x,
        corner & 2 ? half.y : -half.y,
        corner & 4 ? half.z : -half.z,
      )
        // Le sujet est centré sur l'origine par le kit : la matrice du groupe
        // suffit à porter la boîte dans la scène.
        .applyMatrix4(this.modelGroup.matrixWorld)
        .project(this.camera);

      const u = SCRATCH_CORNER.x * 0.5 + 0.5;
      const v = SCRATCH_CORNER.y * 0.5 + 0.5;
      const diagonal = (u + (1 - v)) * 0.5;

      min = Math.min(min, diagonal);
      max = Math.max(max, diagonal);
    }

    this.grid.material.uniforms.uGradientRange.value.set(min, max);
  }
}
