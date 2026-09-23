import { useCallback, useEffect, useRef, useState } from "react";
import { getBodyStatus, startBody, type BodyOptions } from "../../kit/avatar/api";

/** Intervalle de sondage. Meshy met plusieurs dizaines de secondes : sonder
 *  plus vite ne ferait qu'ajouter du bruit. */
const POLL_MS = 2500;

/**
 * Au-delà, on explique. Le conteneur backend scale à zéro : la première requête
 * après inactivité charge rembg et mediapipe, ce qui prend 10 à 30 secondes. Une
 * barre immobile sans un mot ressemble à une panne.
 */
export const COLD_START_HINT_MS = 8000;

/** Statuts Meshy qui closent la tâche. */
const TERMINES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

export interface BodyTask {
  taskId: string | null;
  progress: number;
  status: string | null;
  /** Le corps est prêt : la greffe peut partir. */
  ready: boolean;
  /** Explication affichée quand l'attente s'allonge anormalement. */
  hint: string | null;
  error: string | null;
  start(photos: File[], options: BodyOptions): void;
}

/**
 * Génération du corps, menée en arrière-plan pendant que l'utilisateur capture
 * son visage. C'est ce recouvrement qui rend l'attente supportable : les deux
 * étapes ne s'additionnent pas.
 */
export function useBodyTask(): BodyTask {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vivantRef = useRef(true);

  useEffect(() => {
    vivantRef.current = true;
    return () => {
      vivantRef.current = false;
    };
  }, []);

  const start = useCallback((photos: File[], options: BodyOptions) => {
    setError(null);
    setHint(null);
    setProgress(0);
    setStatus(null);
    setTaskId(null);

    const reveil = setTimeout(() => {
      if (vivantRef.current) {
        setHint("Le service démarre — la première requête après une pause prend un moment.");
      }
    }, COLD_START_HINT_MS);

    void startBody(photos, options)
      .then((id) => {
        if (!vivantRef.current) return;
        setHint(null);
        setTaskId(id);
      })
      .catch((cause: unknown) => {
        if (!vivantRef.current) return;
        setHint(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => clearTimeout(reveil));
  }, []);

  useEffect(() => {
    if (!taskId || (status && TERMINES.has(status))) return;

    let annule = false;

    const sonder = async () => {
      try {
        const etat = await getBodyStatus(taskId);
        if (annule || !vivantRef.current) return;
        setProgress(etat.progress);
        setStatus(etat.status);
      } catch (cause) {
        if (annule || !vivantRef.current) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    void sonder();
    const timer = setInterval(() => void sonder(), POLL_MS);

    return () => {
      annule = true;
      clearInterval(timer);
    };
  }, [taskId, status]);

  return {
    taskId,
    progress,
    status,
    ready: status === "SUCCEEDED",
    hint,
    error,
    start,
  };
}
