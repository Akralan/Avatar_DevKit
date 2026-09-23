import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createHologramMaterial, resolvePreset } from "./hologram-material";
import type { Subject } from "../../kit/types";

export interface HologramConfig {
  preset: string;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  exposure: number;
}

/**
 * Portage du Twin hologramme de la landing (`components/twin/shader/`).
 *
 * C'est le module qui justifie que le kit n'appelle jamais `renderer.render()`
 * lui-même : ici, l'image sort de `composer.render()`, à travers une chaîne
 * RenderPass → Bloom → OutputPass.
 */
export class HologramRenderer {
  private readonly scene = new THREE.Scene();
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly renderPass: RenderPass;
  private material: THREE.ShaderMaterial;
  private subject: Subject;
  private preset = "";
  private elapsed = 0;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    subject: Subject,
  ) {
    this.subject = subject;

    // AgX reproduit le view transform par défaut de Blender : il compresse les
    // émissions HDR en pastel doux au lieu de les écrêter à blanc. Sans lui, le
    // rendu part en surexposition.
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 0.28;
    renderer.setClearColor(0x000000, 0);

    // Cible HalfFloat : l'émission ×20 du rim externe doit survivre en HDR
    // jusqu'à l'AgX, sinon elle sature à blanc dès le RenderPass.
    this.composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }),
    );
    this.renderPass = new RenderPass(this.scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Aucune lumière de scène : le shader s'auto-ombre (Fresnel + lambert
    // interne pilotés par uniforms).
    this.material = createHologramMaterial();
    this.applyPreset("base");
    this.scene.add(subject.group);
  }

  public setSubject(subject: Subject): void {
    this.scene.remove(this.subject.group);
    this.subject = subject;
    this.scene.add(subject.group);
    this.paintSubject();
  }

  public setConfig(config: HologramConfig): void {
    if (config.preset !== this.preset) this.applyPreset(config.preset);

    this.bloom.strength = config.bloomStrength;
    this.bloom.radius = config.bloomRadius;
    this.bloom.threshold = config.bloomThreshold;
    this.renderer.toneMappingExposure = config.exposure;
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
  }

  public frame(delta: number): void {
    this.elapsed += delta;
    this.material.uniforms.uTime.value = this.elapsed;
    this.composer.render();
  }

  public dispose(): void {
    this.material.dispose();
    this.composer.dispose();
  }

  /**
   * Un preset change aussi les *features* (halo, rampe inversée, scanline,
   * tramage), qui vivent dans des uniforms posés à la construction. Recréer le
   * matériau est plus simple — et plus sûr — que de tenter de les réécrire un
   * par un.
   */
  private applyPreset(key: string): void {
    const preset = resolvePreset(key);
    this.preset = key;

    this.material.dispose();
    this.material = createHologramMaterial(preset.params, preset.features);
    this.paintSubject();
  }

  private paintSubject(): void {
    this.subject.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = this.material;
    });

    // Le dégradé vertical du shader se borne sur la boîte du sujet : sans ces
    // deux uniforms, il se calerait sur des valeurs arbitraires.
    const box = new THREE.Box3().setFromObject(this.subject.group);
    this.material.uniforms.uBboxMinY.value = box.min.y;
    this.material.uniforms.uBboxSizeY.value = box.max.y - box.min.y;
  }
}
