import * as THREE from "three";
import type { Subject } from "../../kit/types";

export interface WireframeConfig {
  opacite: number;
  couleur: string;
}

/**
 * Portage du Twin « basique » de la landing (`components/twin/basic/`).
 * Three.js nu, aucun shader : c'est le point d'entrée pour comprendre ce
 * qu'un module doit fournir, et rien de plus.
 *
 * Tout ce qui relevait du cycle de vie dans la version d'origine — chargement
 * du GLB, cadrage, rAF, ResizeObserver, écouteurs de pointeur — appartient
 * désormais au kit et a disparu d'ici.
 */
export class WireframeRenderer {
  private readonly scene = new THREE.Scene();
  private readonly material: THREE.MeshStandardMaterial;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    subject: Subject,
  ) {
    this.material = new THREE.MeshStandardMaterial({
      color: 0x41b7de,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(5, 10, 5);
    this.scene.add(key);

    this.setSubject(subject);
  }

  public setSubject(subject: Subject): void {
    // Retirer le sujet précédent sans toucher aux lumières : `scene.clear()`
    // les emporterait aussi, et la silhouette deviendrait noire.
    const previous = this.scene.children.filter((child) => child.type === "Group");
    previous.forEach((child) => this.scene.remove(child));

    subject.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = this.material;
    });
    this.scene.add(subject.group);
  }

  public setConfig(config: WireframeConfig): void {
    this.material.opacity = config.opacite;
    this.material.color.set(config.couleur);
  }

  public render(rotation: number): void {
    this.scene.rotation.y = rotation;
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.material.dispose();
  }
}
