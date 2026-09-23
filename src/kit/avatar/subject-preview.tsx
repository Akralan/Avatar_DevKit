import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { frameCamera } from "../framing";
import { loadSubject } from "../load-subject";

/** Tour lent : assez pour montrer le volume, assez lent pour qu'on puisse
 *  regarder un détail sans le poursuivre. */
const ROTATION_SPEED = 0.35;

const MAX_PIXEL_RATIO = 2;

interface SubjectPreviewProps {
  /** URL du GLB — une URL d'objet, en général. */
  src: string;
  className?: string;
}

/**
 * Aperçu 3D d'un corps, en rotation lente. Sert au wizard : masque facial
 * avant validation, puis avatar greffé.
 *
 * Volontairement plus simple que `RenderStage` : pas de module, pas de config,
 * pas de manipulation au doigt. C'est une vignette qui bouge, pas un atelier.
 */
export function SubjectPreview({ src, className }: SubjectPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setError(null);

    let renderer: THREE.WebGLRenderer | undefined;
    let frameId: number | null = null;
    let cancelled = false;

    const monter = async () => {
      let subject;
      try {
        subject = await loadSubject({
          id: "apercu",
          label: "aperçu",
          url: src,
          origin: "personnel",
          locked: false,
        });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Aperçu indisponible.");
        }
        return;
      }
      if (cancelled) return;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      scene.add(subject.group);
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(3, 6, 8);
      scene.add(key);

      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      const clock = new THREE.Clock();

      const dimensionner = () => {
        const { clientWidth, clientHeight } = canvas;
        if (!clientWidth || !clientHeight) return;

        renderer?.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        frameCamera(camera, subject.size, { margin: 1.05 });
      };

      const boucle = () => {
        subject.group.rotation.y += clock.getDelta() * ROTATION_SPEED;
        renderer?.render(scene, camera);
        frameId = requestAnimationFrame(boucle);
      };

      dimensionner();
      const observer = new ResizeObserver(dimensionner);
      observer.observe(canvas);
      boucle();

      cleanupObserver = () => observer.disconnect();
    };

    let cleanupObserver: (() => void) | undefined;
    void monter();

    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      cleanupObserver?.();
      renderer?.dispose();
    };
  }, [src]);

  if (error) {
    return (
      <div role="alert" className="preview-error">
        {error}
      </div>
    );
  }

  return <canvas ref={canvasRef} className={className} />;
}
