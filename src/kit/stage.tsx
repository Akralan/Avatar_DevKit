import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as THREE from "three";
import { frameCamera } from "./framing";
import { PointerOrbit } from "./orbit";
import type { RenderInstance, RenderModule, Subject } from "./types";

/** Plafond du device pixel ratio : au-delà, on paie des pixels que personne ne
 *  distingue, sur des machines qui rament déjà. */
const MAX_PIXEL_RATIO = 2;

const SNAPSHOT_FORMAT = "image/webp";
const SNAPSHOT_QUALITY = 0.8;

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;

    const onChange = () => setReduce(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduce;
}

export interface RenderStageHandle {
  /**
   * Déclenche une action déclarée par le module. L'instance du rendu vit ici ;
   * le bouton qui la déclenche vit dans le panneau. Cette poignée est le seul
   * chemin entre les deux.
   */
  runAction(id: string): void;
  /**
   * Rend une image et la lit dans la foulée. Le buffer de dessin WebGL est vidé
   * dès que le navigateur compose : lire le canvas plus tard rendrait une image
   * vide. Rendre puis lire dans la même tâche est la seule façon d'obtenir une
   * vignette sans imposer `preserveDrawingBuffer` à tous les rendus.
   */
  snapshot(): string | null;
}

interface RenderStageProps<C> {
  module: RenderModule<C>;
  subject: Subject;
  config: C;
  className?: string;
  ref?: Ref<RenderStageHandle>;
}

export function RenderStage<C>({
  module,
  subject,
  config,
  className,
  ref,
}: RenderStageProps<C>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<RenderInstance<C> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReduceMotion();

  // Le sujet est lu par référence : le contexte WebGL n'a aucune raison d'être
  // reconstruit quand on change de corps, tant que le module sait s'adapter.
  const subjectRef = useRef(subject);
  const appliedSubjectRef = useRef<Subject | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const applySizeRef = useRef<(() => void) | null>(null);

  // Incrémenté quand un module ne sait pas changer de sujet en place : il faut
  // alors le reconstruire.
  const [rebuildToken, setRebuildToken] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      runAction(id) {
        const action = module.actions?.find((candidate) => candidate.id === id);
        const instance = instanceRef.current;
        if (!action || !instance) return;
        action.run(instance as unknown as RenderInstance<unknown>);
      },

      snapshot: () => {
        const canvas = canvasRef.current;
        const renderFrame = renderFrameRef.current;
        if (!canvas || !renderFrame) return null;

        renderFrame();
        return canvas.toDataURL(SNAPSHOT_FORMAT, SNAPSHOT_QUALITY);
      },
    }),
    [module],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setError(null);
    const subjectAtCreation = subjectRef.current;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const orbit = new PointerOrbit(canvas);
    const clock = new THREE.Clock();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setError("Le contexte WebGL a été perdu. Rechargez la page pour relancer le rendu.");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    let instance: RenderInstance<C>;
    try {
      instance = module.create({ canvas, renderer, camera, subject: subjectAtCreation });
    } catch (cause) {
      // Libérer explicitement : un create() qui jette laisserait un contexte
      // orphelin, et les navigateurs en plafonnent le nombre simultané.
      canvas.removeEventListener("webglcontextlost", onContextLost);
      renderer.forceContextLoss();
      renderer.dispose();
      orbit.dispose();
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    instanceRef.current = instance;
    appliedSubjectRef.current = subjectAtCreation;
    instance.setConfig(config);

    let frameId: number | null = null;
    let elapsed = 0;

    const renderFrame = () => {
      const delta = clock.getDelta();
      elapsed += delta;
      orbit.update(delta);
      subjectRef.current.mixer?.update(reduceMotion ? 0 : delta);
      instance.frame({ delta, elapsed, rotation: orbit.rotation, reduceMotion });
    };

    const loop = () => {
      renderFrame();
      frameId = requestAnimationFrame(loop);
    };

    const applySize = () => {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;

      const pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      frameCamera(camera, subjectRef.current.size);
      instance.resize(clientWidth, clientHeight, pixelRatio);
    };

    renderFrameRef.current = renderFrame;
    applySizeRef.current = applySize;

    applySize();
    // Une image même à l'arrêt : sans elle, un canvas monté hors viewport
    // resterait noir jusqu'à ce qu'on scrolle dessus.
    renderFrame();

    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(canvas);

    // Boucle coupée hors viewport — contrainte de performance mobile, pas un
    // détail : la galerie et les pages longues portent plusieurs canvases.
    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && frameId === null) {
          clock.getDelta(); // purge le temps passé hors écran
          loop();
        } else if (!entry.isIntersecting && frameId !== null) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
      },
      { threshold: 0 },
    );
    visibility.observe(canvas);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      resizeObserver.disconnect();
      visibility.disconnect();
      orbit.dispose();
      instance.dispose();
      instanceRef.current = null;
      appliedSubjectRef.current = null;
      renderFrameRef.current = null;
      applySizeRef.current = null;
      renderer.dispose();
    };
    // `config` et `subject` sont volontairement absents : le premier est poussé
    // par l'effet suivant, le second par celui d'après. Les remettre ici
    // reconstruirait tout le contexte WebGL à chaque cran de curseur.
  }, [module, reduceMotion, rebuildToken]);

  useEffect(() => {
    instanceRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    subjectRef.current = subject;

    const instance = instanceRef.current;
    if (!instance || appliedSubjectRef.current === subject) return;
    appliedSubjectRef.current = subject;

    if (instance.onSubjectChange) {
      instance.onSubjectChange(subject);
      // Le cadrage dépend des dimensions du sujet : un corps plus grand ou plus
      // large sort du cadre si on ne le rejoue pas.
      applySizeRef.current?.();
      return;
    }

    // Un module qui ne sait pas changer de sujet en place est reconstruit.
    setRebuildToken((token) => token + 1);
  }, [subject]);

  if (error) {
    return (
      <div role="alert" className="stage-error">
        {error}
      </div>
    );
  }

  return <canvas ref={canvasRef} className={className} />;
}
