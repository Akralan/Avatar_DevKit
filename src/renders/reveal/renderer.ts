import * as THREE from "three";
import { createOffscreenPass, type OffscreenPass } from "../../kit/offscreen";
import {
  applyRevealFrame,
  createRevealPass,
  disposeRevealPass,
  type RevealPass,
} from "./reveal-pass";
import { projectSubject } from "./subject-projection";
import { DischargeField } from "./discharges";
import { INITIAL_ROTATION } from "./config";
import { REVEAL_DURATION_MS, resolveFinalPitch, resolveRevealFrame } from "./choreography";
import type { Subject } from "../../kit/types";

// Focale longue : peu de distorsion grand-angle sur la tête et les pieds.
const CAMERA_FOV = 22;

// Le shader n'échantillonne qu'un texel au centre de chaque cellule.
const MAX_ANALYSIS_SIZE = 1600;

// Deux texels d'analyse par cellule au minimum. En deçà, la silhouette est
// décidée par un échantillon sur deux et les contours se mettent à grouiller.
const MIN_ANALYSIS_TEXELS_PER_CELL = 2;

export interface RevealConfig {
  effectsEnabled: boolean;
}

/**
 * Révélation du sujet, en deux passes : normales + profondeur hors écran, puis
 * un quad plein écran dont la **chorégraphie** pilote la densité et l'étendue.
 *
 * `choreography.ts` est une fonction pure interrogée à chaque frame : c'est là,
 * et nulle part ailleurs, qu'est écrit ce que l'animation fait à un instant
 * donné.
 */
export class RevealRenderer {
  private readonly sourceScene = new THREE.Scene();
  private readonly modelGroup = new THREE.Group();
  private readonly offscreen: OffscreenPass;
  private readonly pass: RevealPass;
  private readonly discharges = new DischargeField();
  private readonly buffer = new THREE.Vector2(1, 1);

  private subject: Subject;
  private elapsedMs = 0;
  private widthPx = 1;
  private finalPitchPx = 3;
  private effectsWanted = true;

  /**
   * Le kit fait tourner le sujet au doigt dès la première frame. Ici, la pose
   * n'appartient au doigt qu'une fois la silhouette complète : on mémorise la
   * rotation du kit au moment du relais et on n'applique que l'écart. Avant,
   * le drag ne produit rien — une rotation pendant la propagation lutterait
   * contre la chorégraphie.
   */
  private handoverRotation: number | null = null;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    subject: Subject,
  ) {
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();

    this.subject = subject;
    this.offscreen = createOffscreenPass(renderer, { width: 1, height: 1 });
    this.pass = createRevealPass();

    this.pass.material.uniforms.uNormalTexture.value = this.offscreen.target.texture;
    this.pass.material.uniforms.uDepthTexture.value = this.offscreen.depthTexture;

    this.sourceScene.add(this.modelGroup);
    this.modelGroup.add(subject.group);
  }

  public setSubject(subject: Subject): void {
    this.modelGroup.remove(this.subject.group);
    this.subject = subject;
    this.modelGroup.add(subject.group);
    this.replay();
  }

  public setConfig(config: RevealConfig): void {
    this.effectsWanted = config.effectsEnabled;
  }

  /** Rejoue la chorégraphie depuis le premier germe. */
  public replay(): void {
    this.elapsedMs = 0;
    this.handoverRotation = null;
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    this.widthPx = width;
    this.buffer.set(width * pixelRatio, height * pixelRatio);

    const scale = Math.min(1, MAX_ANALYSIS_SIZE / Math.max(this.buffer.x, this.buffer.y));
    const analysisWidth = Math.ceil(this.buffer.x * scale);
    this.offscreen.setSize(analysisWidth, Math.ceil(this.buffer.y * scale));

    // Le pas d'arrivée suit la finesse de l'écran, mais jamais au point de
    // demander plus de cellules que la passe d'analyse ne peut en nourrir.
    this.finalPitchPx = Math.max(
      resolveFinalPitch(pixelRatio),
      (width * MIN_ANALYSIS_TEXELS_PER_CELL) / analysisWidth,
    );

    this.pass.material.uniforms.uResolution.value.copy(this.buffer);
  }

  public frame(delta: number, rotation: number, reduceMotion: boolean): void {
    // Mouvement réduit : la chorégraphie saute directement à son état final.
    this.elapsedMs = reduceMotion ? REVEAL_DURATION_MS : this.elapsedMs + delta * 1000;

    // La pose d'abord, la reprojection ensuite, l'image en dernier : la maille
    // de départ se mesure en hauteurs de sujet, elle a donc besoin de la
    // projection de cette frame-ci. L'interactivité est celle constatée à la
    // frame précédente — elle ne dépend que du temps écoulé, jamais de la
    // projection.
    const pose = this.handoverRotation === null ? 0 : rotation - this.handoverRotation;
    this.modelGroup.rotation.y = INITIAL_ROTATION + pose;
    this.modelGroup.updateMatrixWorld();

    projectSubject(
      this.pass,
      this.camera,
      this.modelGroup.matrixWorld,
      this.subject.size,
      this.camera.aspect,
    );

    const frame = resolveRevealFrame(this.elapsedMs, {
      widthPx: this.widthPx,
      subjectHeightPx: this.subjectHeightPx,
      finalPitchPx: this.finalPitchPx,
    });

    if (frame.interactive && this.handoverRotation === null) {
      this.handoverRotation = rotation;
    }

    this.discharges.setEnabled(this.effectsWanted && frame.finished && !reduceMotion);
    this.discharges.update(delta * 1000);
    this.discharges.writeTo(this.pass.material.uniforms.uDischarges.value as THREE.Vector4[]);
    this.pass.material.uniforms.uTime.value += delta;

    applyRevealFrame(this.pass, frame);
    this.renderFrame();
  }

  public dispose(): void {
    this.offscreen.dispose();
    disposeRevealPass(this.pass);
  }


  /** Hauteur écran du sujet en px CSS, telle que la dernière reprojection l'a vue. */
  private get subjectHeightPx(): number {
    const ratio = this.pass.material.uniforms.uSubjectHeight.value as number;
    return ratio * this.widthPx;
  }

  private renderFrame(): void {
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
    this.renderer.render(this.pass.scene, this.pass.camera);
  }
}
