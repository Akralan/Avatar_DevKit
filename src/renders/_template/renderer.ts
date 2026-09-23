import * as THREE from "three";
import { createOffscreenPass, type OffscreenPass } from "../../kit/offscreen";
import VERTEX_SHADER from "./shaders/fullscreen.vert.glsl";
import FRAGMENT_SHADER from "./shaders/effect.frag.glsl";
import type { Subject } from "../../kit/types";

export interface TemplateConfig {
  couleurA: string;
  couleurB: string;
  vitesse: number;
  bandes: number;
}

/**
 * Squelette d'un rendu, en état de marche.
 *
 * Le pipeline est celui que partagent la plupart des rendus du devkit :
 *   1. le sujet est rendu hors écran en normales + profondeur (passe du kit) ;
 *   2. un quad plein écran lit ces buffers et décide de chaque pixel.
 *
 * Vous n'avez normalement rien à changer ici : tout ce qui fait l'aspect vit
 * dans `shaders/effect.frag.glsl`. Revenez-y quand vous aurez besoin d'un
 * nouveau réglage — il se déclare dans les `uniforms` ci-dessous, puis dans
 * `module.ts`.
 */
export class TemplateRenderer {
  private readonly sourceScene = new THREE.Scene();
  private readonly modelGroup = new THREE.Group();
  private readonly offscreen: OffscreenPass;
  private readonly scene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;

  private subject: Subject;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    subject: Subject,
  ) {
    this.subject = subject;
    this.offscreen = createOffscreenPass(renderer, { width: 1, height: 1 });

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uNormalTexture: { value: this.offscreen.target.texture },
        uDepthTexture: { value: this.offscreen.depthTexture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color() },
        uColorB: { value: new THREE.Color() },
        uSpeed: { value: 0.35 },
        uBandes: { value: 3 },
      },
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.sourceScene.add(this.modelGroup);
    this.modelGroup.add(subject.group);
  }

  public setSubject(subject: Subject): void {
    this.modelGroup.remove(this.subject.group);
    this.subject = subject;
    this.modelGroup.add(subject.group);
  }

  public setConfig(config: TemplateConfig): void {
    const uniforms = this.material.uniforms;

    // sRGB brut : le shader écrit sa couleur telle quelle, la convertir en
    // linéaire assombrirait tout le rendu.
    (uniforms.uColorA.value as THREE.Color).setStyle(config.couleurA, THREE.LinearSRGBColorSpace);
    (uniforms.uColorB.value as THREE.Color).setStyle(config.couleurB, THREE.LinearSRGBColorSpace);
    uniforms.uSpeed.value = config.vitesse;
    uniforms.uBandes.value = config.bandes;
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    const bufferWidth = Math.ceil(width * pixelRatio);
    const bufferHeight = Math.ceil(height * pixelRatio);

    this.offscreen.setSize(bufferWidth, bufferHeight);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(bufferWidth, bufferHeight);
  }

  public frame(delta: number, rotation: number, reduceMotion: boolean): void {
    if (!reduceMotion) this.material.uniforms.uTime.value += delta;

    this.modelGroup.rotation.y = rotation;
    this.modelGroup.updateMatrixWorld();

    // Passe 1 — le sujet, hors écran, en normales et profondeur.
    this.sourceScene.overrideMaterial = this.offscreen.normalMaterial;
    this.renderer.setRenderTarget(this.offscreen.target);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.sourceScene, this.camera);
    this.sourceScene.overrideMaterial = null;

    // Passe 2 — le quad plein écran, qui produit l'image visible.
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.quadCamera);
  }

  public dispose(): void {
    this.offscreen.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
